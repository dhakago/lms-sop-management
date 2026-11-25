import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { canAccess, HOLDING_IDS, isSuper } from '@/lib/authz';
import { groupsOf, peopleByIds, unitsOf } from '@/lib/people';
import { THEMES, type HoldingId } from '@/lib/theme';
import type { Ctx } from '@/lib/session';
import type { PermHolding, PermKind, PermOptions, PermPayload, PermRow, PermState } from '@/lib/perm-types';

type Db = Awaited<ReturnType<typeof createClient>>;
const OTHERS = HOLDING_IDS.filter((h) => h !== 'people') as HoldingId[];
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

type AccessRow = { holding_id: string; subject_type: string; unit: string | null; group_id: string | null; profile_id: string | null; role: string };

export async function adminList(): Promise<{ id: string; name: string; employeeNo: string }[]> {
  const db = createAdminClient();
  const { data } = await db.from('profiles').select('id, full_name, employee_no').in('role', ['admin', 'superadmin']).eq('active', true).order('full_name');
  return (data ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string, employeeNo: p.employee_no as string }));
}

export async function permOptions(ctx: Ctx, kind: PermKind, nodeLabel: string, holdings: HoldingId[]): Promise<PermOptions> {
  const hs = holdings.filter((h) => h !== 'people');
  const [units, groups, admins] = await Promise.all([unitsOf(hs), groupsOf(hs), adminList()]);
  return {
    kind, nodeLabel, units,
    groups: groups.map((g) => ({ id: g.id, name: g.name, holding: g.holding_id, holdingName: THEMES[g.holding_id].name })),
    admins,
    canWriters: isSuper(ctx) || canAccess(ctx, 'people', 'sop'),
  };
}

// Membangun keadaan dialog dari baris akses di database.
async function buildStates(ctx: Ctx, kind: PermKind, holdingIds: HoldingId[], open: Set<string> | null, rows: AccessRow[], names: Map<string, string>, groupNames: Map<string, string>, module: 'sop' | 'pembelajaran' = 'sop'): Promise<PermState> {
  const holdings: PermHolding[] = holdingIds.map((h) => {
    const mine = rows.filter((r) => r.holding_id === h && r.role === 'pembaca');
    const marker = mine.some((r) => r.subject_type === 'all');
    const specific: PermRow[] = mine.filter((r) => r.subject_type !== 'all').map((r) => (
      r.subject_type === 'unit' ? { type: 'unit', value: r.unit!, label: r.unit! }
      : r.subject_type === 'group' ? { type: 'group', value: r.group_id!, label: groupNames.get(r.group_id!) ?? 'Grup' }
      : { type: 'user', value: r.profile_id!, label: names.get(r.profile_id!) ?? 'Orang' }));
    const top = kind === 'board' || kind === 'course';
    const isOpen = top ? open!.has(h) : true;
    const all = top ? isOpen && specific.length === 0 : specific.length === 0 && !marker;
    return { id: h, name: THEMES[h].name, all, rows: top && !isOpen ? [] : specific, locked: !canAccess(ctx, h, module) };
  });
  const writers = rows.filter((r) => r.role === 'editor' && r.profile_id).map((r) => ({ id: r.profile_id!, label: names.get(r.profile_id!) ?? 'Admin' }));
  return { holdings, writers };
}

export type BoardPerms = {
  board: PermState; libraries: Record<string, PermState>; playbooks: Record<string, PermState>;
  options: { board: PermOptions; library: PermOptions; playbook: PermOptions };
  boardHoldings: HoldingId[];
};

// Semua keadaan izin satu board sekaligus (board, library, playbook), supaya halaman board tidak membuat banyak kueri.
export async function loadBoardPerms(ctx: Ctx, boardId: string, labels: { board: string; library: string; playbook: string }, libIds: string[], pbIds: string[]): Promise<BoardPerms> {
  const db = await createClient();
  const { data: bh } = await db.from('board_holdings').select('holding_id').eq('board_id', boardId);
  const boardHoldings = (bh ?? []).map((h) => h.holding_id as HoldingId);
  const open = new Set<string>(boardHoldings);
  const { data: ba } = await db.from('board_access').select('holding_id, subject_type, unit, group_id, profile_id, role').eq('board_id', boardId);
  const { data: la } = libIds.length ? await db.from('library_access').select('library_id, holding_id, subject_type, unit, group_id, profile_id, role').in('library_id', libIds) : { data: [] };
  const { data: pa } = pbIds.length ? await db.from('playbook_access').select('playbook_id, holding_id, subject_type, unit, group_id, profile_id, role').in('playbook_id', pbIds) : { data: [] };
  type L = AccessRow & { library_id: string }; type P = AccessRow & { playbook_id: string };
  const libRows = (la ?? []) as unknown as L[], pbRows = (pa ?? []) as unknown as P[];
  const allRows = [...((ba ?? []) as AccessRow[]), ...libRows, ...pbRows];
  const names = await peopleByIds(allRows.map((r) => r.profile_id).filter((x): x is string => !!x));
  const nameMap = new Map([...names].map(([k, v]) => [k, v.name]));
  const groups = await groupsOf(OTHERS);
  const groupNames = new Map(groups.map((g) => [g.id, g.name]));

  // Board: semua holding non-PEOPLE yang bisa diatur Anda atau yang sedang terbuka.
  const boardCands = OTHERS.filter((h) => canAccess(ctx, h, 'sop') || open.has(h));
  const nodeCands = boardHoldings.filter((h) => h !== 'people');
  const board = await buildStates(ctx, 'board', boardCands, open, (ba ?? []) as AccessRow[], nameMap, groupNames);
  const libraries: Record<string, PermState> = {}, playbooks: Record<string, PermState> = {};
  for (const id of libIds) libraries[id] = await buildStates(ctx, 'library', nodeCands, null, libRows.filter((r) => r.library_id === id), nameMap, groupNames);
  for (const id of pbIds) playbooks[id] = await buildStates(ctx, 'playbook', nodeCands, null, pbRows.filter((r) => r.playbook_id === id), nameMap, groupNames);
  const [ob, ol, op] = await Promise.all([
    permOptions(ctx, 'board', labels.board, OTHERS), permOptions(ctx, 'library', labels.library, nodeCands), permOptions(ctx, 'playbook', labels.playbook, nodeCands),
  ]);
  return { board, libraries, playbooks, options: { board: ob, library: ol, playbook: op }, boardHoldings };
}

// Keadaan awal untuk node baru: semua holding yang bisa Anda atur terbuka untuk semua pengguna.
export function defaultState(ctx: Ctx, holdingIds: HoldingId[]): PermState {
  return {
    holdings: holdingIds.map((h) => ({ id: h, name: THEMES[h].name, all: ctx.holding === 'people' || ctx.holding === h, rows: [], locked: !canAccess(ctx, h, 'sop') })),
    writers: [],
  };
}

export function parsePayload(raw: string): PermPayload | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as PermPayload;
    if (!Array.isArray(j.holdings) || j.holdings.length > 10) return null;
    for (const h of j.holdings) {
      if (!(HOLDING_IDS as string[]).includes(h.id) || typeof h.all !== 'boolean' || !Array.isArray(h.rows) || h.rows.length > 200) return null;
      for (const r of h.rows) if (!['unit', 'group', 'user'].includes(r.type) || typeof r.value !== 'string' || r.value.length > 80) return null;
    }
    if (j.writers !== null && (!Array.isArray(j.writers) || j.writers.length > 50 || !j.writers.every(isId))) return null;
    return j;
  } catch { return null; }
}

// Menerapkan izin ke satu node. Urutan: tambah holding board, ganti baris pembaca, cabut holding, terakhir Penulis
// (supaya admin tidak mengunci dirinya sebelum selesai). Database tetap penjaga: RLS menolak yang tidak sah.
export async function applyPerm(ctx: Ctx, db: Db, kind: PermKind, nodeId: string, boardId: string, p: PermPayload): Promise<string | null> {
  const tableA = kind === 'board' ? 'board_access' : kind === 'library' ? 'library_access' : 'playbook_access';
  const col = kind === 'board' ? 'board_id' : kind === 'library' ? 'library_id' : 'playbook_id';
  const { data: bh } = await db.from('board_holdings').select('holding_id').eq('board_id', boardId);
  const have = new Set((bh ?? []).map((h) => h.holding_id as string));

  const managed = p.holdings.filter((h) => h.id !== 'people' && canAccess(ctx, h.id, 'sop') && (kind === 'board' || have.has(h.id)));
  const wantOpen = (h: PermPayload['holdings'][number]) => h.all || h.rows.length > 0;

  if (kind === 'board') {
    const add = managed.filter((h) => wantOpen(h) && !have.has(h.id)).map((h) => ({ board_id: boardId, holding_id: h.id }));
    if (add.length) { const { error } = await db.from('board_holdings').insert(add); if (error) return 'Holding belum bisa ditambahkan. Coba lagi.'; }
  }
  for (const h of managed) {
    const del = await db.from(tableA).delete().eq(col, nodeId).eq('holding_id', h.id).eq('role', 'pembaca');
    if (del.error) return 'Izin belum bisa disimpan. Coba lagi.';
    const rows: Record<string, unknown>[] = [];
    if (h.rows.length > 0) {
      for (const r of h.rows) rows.push({ [col]: nodeId, holding_id: h.id, role: 'pembaca', created_by: ctx.userId, subject_type: r.type,
        ...(r.type === 'unit' ? { unit: r.value } : r.type === 'group' ? { group_id: r.value } : { profile_id: r.value }) });
    } else if (!h.all && kind !== 'board') {
      rows.push({ [col]: nodeId, holding_id: h.id, role: 'pembaca', created_by: ctx.userId, subject_type: 'all' });
    }
    if (rows.length) {
      const ins = await db.from(tableA).insert(rows);
      if (ins.error) return 'Ada anggota atau grup yang tidak bisa ditambahkan. Pastikan mereka ada di holding yang dipilih.';
    }
  }
  if (kind === 'board') {
    for (const h of managed) {
      if (wantOpen(h) || !have.has(h.id)) continue;
      const { error } = await db.from('board_holdings').delete().eq('board_id', boardId).eq('holding_id', h.id);
      if (error) return 'Holding belum bisa dicabut. Coba lagi.';
    }
    const { data: still } = await db.from('board_holdings').select('holding_id').eq('board_id', boardId);
    if (!(still ?? []).some((x) => x.holding_id !== 'people')) return 'Buka untuk minimal satu holding di Permissions.';
  }
  if (p.writers !== null && (isSuper(ctx) || canAccess(ctx, 'people', 'sop'))) {
    const del = await db.from(tableA).delete().eq(col, nodeId).eq('role', 'editor');
    if (del.error) return 'Penulis belum bisa disimpan. Coba lagi.';
    if (p.writers.length) {
      const ins = await db.from(tableA).insert(p.writers.map((u) => ({ [col]: nodeId, holding_id: 'people', subject_type: 'user', profile_id: u, role: 'editor', created_by: ctx.userId })));
      if (ins.error) return 'Ada admin yang belum bisa jadi Penulis: ia harus punya akses SOP ke semua holding yang membuka ini.';
    }
  }
  return null;
}

// ============ Kursus ============
// Kursus dibuka untuk holding (course_holdings) dan bisa dipersempit lewat course_access, seperti board.
export async function loadCoursePerm(ctx: Ctx, courseId: string | null): Promise<{ init: PermState; options: PermOptions }> {
  const db = await createClient();
  const managed = OTHERS.filter((h) => canAccess(ctx, h, 'pembelajaran'));
  let open = new Set<string>(); let rows: AccessRow[] = [];
  if (courseId) {
    const { data: ch } = await db.from('course_holdings').select('holding_id').eq('course_id', courseId);
    open = new Set((ch ?? []).map((h) => h.holding_id as string));
    const { data: ca } = await db.from('course_access').select('holding_id, subject_type, unit, group_id, profile_id').eq('course_id', courseId);
    rows = ((ca ?? []) as Omit<AccessRow, 'role'>[]).map((r) => ({ ...r, role: 'pembaca' }));
  }
  const cands = OTHERS.filter((h) => managed.includes(h) || open.has(h));
  const names = await peopleByIds(rows.map((r) => r.profile_id).filter((x): x is string => !!x));
  const groups = await groupsOf(OTHERS);
  const init = courseId
    ? await buildStates(ctx, 'course', cands, open, rows, new Map([...names].map(([k, v]) => [k, v.name])), new Map(groups.map((g) => [g.id, g.name])), 'pembelajaran')
    : { holdings: cands.map((h) => ({ id: h, name: THEMES[h].name, all: ctx.holding === 'people' || ctx.holding === h, rows: [], locked: !managed.includes(h) })), writers: [] };
  const options = { ...(await permOptions(ctx, 'course', 'Kursus', cands)), canWriters: false };
  return { init, options };
}

export async function applyCoursePerm(ctx: Ctx, db: Db, courseId: string, p: PermPayload): Promise<string | null> {
  const { data: ch } = await db.from('course_holdings').select('holding_id').eq('course_id', courseId);
  const have = new Set((ch ?? []).map((h) => h.holding_id as string));
  const managed = p.holdings.filter((h) => h.id !== 'people' && canAccess(ctx, h.id, 'pembelajaran'));
  const wantOpen = (h: PermPayload['holdings'][number]) => h.all || h.rows.length > 0;

  const add = managed.filter((h) => wantOpen(h) && !have.has(h.id)).map((h) => ({ course_id: courseId, holding_id: h.id }));
  if (add.length) { const { error } = await db.from('course_holdings').insert(add); if (error) return 'Holding belum bisa ditambahkan. Coba lagi.'; }
  for (const h of managed) {
    const del = await db.from('course_access').delete().eq('course_id', courseId).eq('holding_id', h.id);
    if (del.error) return 'Izin belum bisa disimpan. Coba lagi.';
    if (h.rows.length > 0 && wantOpen(h)) {
      const rows = h.rows.map((r) => ({ course_id: courseId, holding_id: h.id, created_by: ctx.userId, subject_type: r.type,
        ...(r.type === 'unit' ? { unit: r.value } : r.type === 'group' ? { group_id: r.value } : { profile_id: r.value }) }));
      const ins = await db.from('course_access').insert(rows);
      if (ins.error) return 'Ada anggota atau grup yang tidak bisa ditambahkan. Pastikan mereka ada di holding yang dipilih.';
    }
  }
  for (const h of managed) {
    if (wantOpen(h) || !have.has(h.id)) continue;
    const { error } = await db.from('course_holdings').delete().eq('course_id', courseId).eq('holding_id', h.id);
    if (error) return 'Holding belum bisa dicabut. Coba lagi.';
  }
  const { data: still } = await db.from('course_holdings').select('holding_id').eq('course_id', courseId);
  if (!(still ?? []).length) return 'Buka untuk minimal satu holding di Permissions.';
  return null;
}
