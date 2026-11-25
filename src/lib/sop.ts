import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Ctx } from '@/lib/session';

export type MandatoryItem = {
  playbookId: string;
  playbook: string;
  dueOn: string;
  total: number;
  read: number;
  late: boolean;
};

// Satu baris penugasan baca. target_type: 'holding' (dengan unit opsional), 'group', atau 'user'.
export type Req = {
  holding_id: string;
  unit: string | null;
  due_on: string;
  target_type?: string | null;
  group_id?: string | null;
  profile_id?: string | null;
};

// Grup yang memuat pengguna ini. RLS hanya mengizinkan membaca keanggotaan diri sendiri.
export const getMyGroupIds = cache(async (userId: string): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data } = await supabase.from('group_members').select('group_id').eq('profile_id', userId);
  return new Set((data ?? []).map((g) => g.group_id as string));
});

// Apakah satu penugasan menyasar pengguna ini di holding aktifnya.
export function reqMatches(ctx: Ctx, r: Req, groups: Set<string>): boolean {
  if (r.holding_id !== ctx.holding) return false;
  const type = r.target_type ?? 'holding';
  if (type === 'group') return !!r.group_id && groups.has(r.group_id);
  if (type === 'user') return r.profile_id === ctx.userId;
  const unit = ctx.memberships.find((m) => m.holding_id === ctx.holding)?.unit ?? null;
  return !r.unit || r.unit === unit;
}

// Penugasan baca yang berlaku bagi pengguna: ke holding dan unitnya, ke grupnya, atau ke dirinya.
// Bila lebih dari satu, yang batasnya paling dekat dipakai.
// Tanpa penugasan, SOP hanya dibaca: tidak ada tombol "Sudah saya baca" dan tidak muncul di Beranda.
export function assignedReq<T extends Req>(ctx: Ctx, reqs: T[], groups: Set<string>): T | null {
  const mine = reqs.filter((r) => reqMatches(ctx, r, groups));
  return mine.sort((a, b) => a.due_on.localeCompare(b.due_on))[0] ?? null;
}

// SOP yang ditugaskan untuk holding aktif: target dan batas waktu ada di tingkat playbook.
export async function getMandatory(ctx: Ctx): Promise<MandatoryItem[]> {
  const supabase = await createClient();
  const groups = await getMyGroupIds(ctx.userId);

  const { data: reqs } = await supabase
    .from('playbook_requirements')
    .select('playbook_id, due_on, unit, holding_id, target_type, group_id, profile_id, playbooks(id, name, cards(id, status, current_version_id))')
    .eq('holding_id', ctx.holding);

  const { data: receipts } = await supabase.from('read_receipts').select('version_id').eq('profile_id', ctx.userId);
  const done = new Set((receipts ?? []).map((r) => r.version_id));
  const today = new Date().toISOString().slice(0, 10);

  // Satu playbook bisa ditugaskan lewat beberapa jalur. Ambil batas yang paling dekat.
  type Pb = { id: string; name: string; cards: { id: string; status: string; current_version_id: string | null }[] };
  const best = new Map<string, { due: string; pb: Pb }>();
  for (const r of reqs ?? []) {
    if (!reqMatches(ctx, r as Req, groups)) continue;
    const pb = r.playbooks as unknown as Pb | null;
    if (!pb) continue; // playbook tidak terlihat (akses board dicabut): penugasan tidak tampil dan tidak dihitung
    const cur = best.get(pb.id);
    if (!cur || r.due_on < cur.due) best.set(pb.id, { due: r.due_on, pb });
  }

  const out: MandatoryItem[] = [];
  for (const { due, pb } of best.values()) {
    const cards = pb.cards.filter((c) => c.status === 'published' && c.current_version_id);
    const read = cards.filter((c) => done.has(c.current_version_id!)).length;
    if (cards.length === 0) continue;
    out.push({ playbookId: pb.id, playbook: pb.name, dueOn: due, total: cards.length, read, late: read < cards.length && due < today });
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
