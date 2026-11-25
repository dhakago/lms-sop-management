import 'server-only';
import type { Ctx } from '@/lib/session';
import type { HoldingId } from '@/lib/theme';
import { createAdminClient } from '@/lib/supabase/admin';

export const HOLDING_IDS: HoldingId[] = ['people', 'sib', 'bejo', 'bos'];
export const MODULES = ['sop', 'pembelajaran', 'pengguna', 'analitik'] as const;
export type Module = (typeof MODULES)[number];
export const MODULE_LABEL: Record<Module, string> = {
  sop: 'SOP',
  pembelajaran: 'Pembelajaran',
  pengguna: 'Pengguna',
  analitik: 'Analitik',
};

// Cermin has_access() di database: superadmin semua, admin hanya yang diberikan. RLS tetap penjaga terakhir.
export function canAccess(ctx: Ctx, holding: string, module: Module): boolean {
  if (ctx.profile.role === 'superadmin') return true;
  if (ctx.profile.role !== 'admin') return false;
  return ctx.access.some((a) => a.holding_id === holding && a.module === module);
}

export function holdingsWith(ctx: Ctx, module: Module): HoldingId[] {
  return HOLDING_IDS.filter((h) => canAccess(ctx, h, module));
}

export const isSuper = (ctx: Ctx) => ctx.profile.role === 'superadmin';

// Catatan audit untuk tindakan lewat kunci layanan (auth.uid() kosong di sana, jadi pelaku ditulis eksplisit).
export async function audit(
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  holding: string | null,
  detail: Record<string, unknown> = {},
) {
  const db = createAdminClient();
  await db.from('audit_log').insert({ actor, action, entity, entity_id: entityId, holding_id: holding, detail });
}

export type Target = {
  id: string;
  role: 'peserta' | 'admin' | 'superadmin';
  active: boolean;
  holdings: string[];
};

// Admin pengguna hanya boleh mengurus orang yang punya keanggotaan aktif di holding yang ia kelola.
// Akun admin dan superadmin hanya boleh diurus superadmin, supaya tidak ada eskalasi hak lewat reset kata sandi.
export async function loadTarget(ctx: Ctx, id: string): Promise<{ target: Target } | { error: string }> {
  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('id, role, active').eq('id', id).maybeSingle();
  if (!p) return { error: 'Pengguna tidak ditemukan.' };
  const { data: ms } = await db.from('memberships').select('holding_id').eq('profile_id', id).is('ended_on', null);
  const holdings = (ms ?? []).map((m) => m.holding_id as string);
  const target: Target = { id: p.id, role: p.role, active: p.active, holdings };
  if (isSuper(ctx)) return { target };
  if (p.role !== 'peserta') return { error: 'Hanya superadmin yang boleh mengurus akun admin.' };
  if (!holdings.some((h) => canAccess(ctx, h, 'pengguna'))) return { error: 'Anda tidak punya akses ke pengguna ini.' };
  return { target };
}
