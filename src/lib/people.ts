import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Ctx } from '@/lib/session';
import { canAccess, type Module } from '@/lib/authz';
import type { HoldingId } from '@/lib/theme';

// Data pendukung untuk memilih unit, grup, dan orang. Dibaca lewat kunci layanan karena admin SOP
// belum tentu punya akses pengguna (RLS memberships), tetapi tetap dibatasi ke holding yang boleh ia kelola.
// Pemanggil wajib sudah memeriksa akses lewat canAccess sebelum memakainya.

export type Person = { id: string; name: string; employeeNo: string; unit: string | null };
export type GroupRow = { id: string; name: string; holding_id: HoldingId };

// Karakter ini punya arti khusus di filter PostgREST, jadi dibuang dari kata pencarian.
export const cleanQuery = (q: string) => q.replace(/[,()%*\\_]/g, ' ').trim().slice(0, 60);

export function allowedHoldings(ctx: Ctx, holdings: HoldingId[], modules: Module[]): HoldingId[] {
  return holdings.filter((h) => modules.some((m) => canAccess(ctx, h, m)));
}

export async function unitsOf(holdings: HoldingId[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (holdings.length === 0) return out;
  const db = createAdminClient();
  const { data } = await db.from('memberships').select('holding_id, unit').in('holding_id', holdings).is('ended_on', null).not('unit', 'is', null).limit(5000);
  for (const r of data ?? []) (out[r.holding_id as string] ??= []).push(r.unit as string);
  for (const h of Object.keys(out)) out[h] = [...new Set(out[h])].sort((a, b) => a.localeCompare(b, 'id'));
  return out;
}

export async function groupsOf(holdings: HoldingId[]): Promise<GroupRow[]> {
  if (holdings.length === 0) return [];
  const db = createAdminClient();
  const { data } = await db.from('groups').select('id, name, holding_id').in('holding_id', holdings).order('name');
  return (data ?? []) as GroupRow[];
}

export async function searchPeople(holding: HoldingId, q: string, limit = 8): Promise<Person[]> {
  const term = cleanQuery(q);
  if (term.length < 2) return [];
  const db = createAdminClient();
  const { data } = await db
    .from('memberships')
    .select('unit, profiles!memberships_profile_id_fkey!inner(id, full_name, employee_no, active)')
    .eq('holding_id', holding)
    .is('ended_on', null)
    .eq('profiles.active', true)
    .or(`full_name.ilike.%${term}%,employee_no.ilike.%${term}%`, { referencedTable: 'profiles' })
    .limit(limit);
  type Row = { unit: string | null; profiles: { id: string; full_name: string; employee_no: string } };
  return ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.profiles.id, name: r.profiles.full_name, employeeNo: r.profiles.employee_no, unit: r.unit }));
}

export async function peopleByIds(ids: string[]): Promise<Map<string, { name: string; employeeNo: string }>> {
  const out = new Map<string, { name: string; employeeNo: string }>();
  if (ids.length === 0) return out;
  const db = createAdminClient();
  const { data } = await db.from('profiles').select('id, full_name, employee_no').in('id', [...new Set(ids)]);
  for (const p of data ?? []) out.set(p.id as string, { name: p.full_name as string, employeeNo: p.employee_no as string });
  return out;
}

// Admin yang boleh dijadikan Editor board: superadmin, atau admin dengan akses SOP ke semua holding board (selain PEOPLE).
export async function editorCandidates(boardHoldings: HoldingId[]): Promise<{ id: string; name: string; employeeNo: string }[]> {
  const db = createAdminClient();
  const needed = boardHoldings.filter((h) => h !== 'people');
  const { data: admins } = await db.from('profiles').select('id, full_name, employee_no, role').in('role', ['admin', 'superadmin']).eq('active', true).order('full_name');
  const { data: acc } = await db.from('admin_access').select('profile_id, holding_id').eq('module', 'sop');
  const has = new Map<string, Set<string>>();
  for (const a of acc ?? []) (has.get(a.profile_id as string) ?? has.set(a.profile_id as string, new Set()).get(a.profile_id as string)!).add(a.holding_id as string);
  return (admins ?? [])
    .filter((p) => p.role === 'superadmin' || needed.every((h) => has.get(p.id as string)?.has(h)))
    .map((p) => ({ id: p.id as string, name: p.full_name as string, employeeNo: p.employee_no as string }));
}
