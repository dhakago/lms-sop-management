'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCtx, type Ctx } from '@/lib/session';
import { audit, canAccess, HOLDING_IDS, holdingsWith } from '@/lib/authz';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { sanitizeDoc } from '@/lib/sop-doc';
import type { HoldingId } from '@/lib/theme';

export type St = { error?: string; ok?: string };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const isId = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const DENIED = 'Anda tidak punya akses untuk mengubah ini.';
const FAIL = 'Belum bisa disimpan. Coba lagi.';
const refresh = () => revalidatePath('/', 'layout');

// RLS di database adalah penjaga utama. Cek di sini hanya supaya pesan galatnya jelas.
async function editor(): Promise<{ ctx: Ctx; db: Awaited<ReturnType<typeof createClient>> } | null> {
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'sop').length === 0) return null;
  return { ctx, db: await createClient() };
}

async function canEdit(db: Awaited<ReturnType<typeof createClient>>, board: string) {
  const { data } = await db.rpc('can_edit_board', { b: board });
  return data === true;
}

const chosen = (ctx: Ctx, fd: FormData): HoldingId[] =>
  HOLDING_IDS.filter((h) => fd.get(`h_${h}`) === 'on' && canAccess(ctx, h, 'sop'));

// ============ Board ============
export async function createBoard(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  if (!e) return { error: DENIED };
  const name = s(fd, 'nama');
  if (!name || name.length > 64) return { error: 'Nama wajib diisi, paling banyak 64 karakter.' };
  const hs = chosen(e.ctx, fd);
  if (hs.length === 0) return { error: 'Pilih minimal satu holding yang boleh membuka board ini.' };

  const { data: b, error } = await e.db
    .from('boards')
    .insert({ name, description: s(fd, 'deskripsi') || null, owner_label: s(fd, 'pemilik') || null, created_by: e.ctx.userId })
    .select('id')
    .single();
  if (error || !b) return { error: FAIL };
  const { error: e2 } = await e.db.from('board_holdings').insert(hs.map((h) => ({ board_id: b.id, holding_id: h })));
  if (e2) {
    await createAdminClient().from('boards').delete().eq('id', b.id); // board tanpa holding tidak bisa diurus siapa pun
    return { error: FAIL };
  }
  for (const h of hs) await audit(e.ctx.userId, 'board.create', 'board', b.id, h, { name });
  refresh();
  redirect(`/kelola/sop/b/${b.id}`);
}

export async function updateBoard(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id) || !(await canEdit(e.db, id))) return { error: DENIED };
  const name = s(fd, 'nama');
  if (!name || name.length > 64) return { error: 'Nama wajib diisi, paling banyak 64 karakter.' };
  const want = chosen(e.ctx, fd);
  if (want.length === 0) return { error: 'Board harus dibuka untuk minimal satu holding.' };

  const { error } = await e.db.from('boards').update({ name, description: s(fd, 'deskripsi') || null, owner_label: s(fd, 'pemilik') || null }).eq('id', id);
  if (error) return { error: FAIL };

  const { data: cur } = await e.db.from('board_holdings').select('holding_id').eq('board_id', id);
  const have = new Set((cur ?? []).map((r) => r.holding_id as string));
  // Tambah dulu, baru cabut, supaya board tidak pernah sesaat tanpa holding.
  const add = want.filter((h) => !have.has(h));
  if (add.length) {
    const { error: e1 } = await e.db.from('board_holdings').insert(add.map((h) => ({ board_id: id, holding_id: h })));
    if (e1) return { error: 'Holding belum bisa ditambahkan. Coba lagi.' };
  }
  for (const h of have) {
    if (want.includes(h as HoldingId)) continue;
    const { error: e2 } = await e.db.from('board_holdings').delete().eq('board_id', id).eq('holding_id', h);
    if (e2) return { error: 'Holding belum bisa dicabut. Coba lagi.' };
  }
  for (const h of want) await audit(e.ctx.userId, 'board.update', 'board', id, h, { name });
  refresh();
  return { ok: 'Board tersimpan.' };
}

export async function toggleArchive(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id) || !(await canEdit(e.db, id))) return { error: DENIED };
  const archived = s(fd, 'arsip') === '1';
  const { error } = await e.db.from('boards').update({ archived }).eq('id', id);
  if (error) return { error: FAIL };
  const { data: hs } = await e.db.from('board_holdings').select('holding_id').eq('board_id', id);
  for (const h of hs ?? []) await audit(e.ctx.userId, archived ? 'board.archive' : 'board.unarchive', 'board', id, h.holding_id);
  refresh();
  return { ok: archived ? 'Board diarsipkan dan tidak tampil bagi pembaca.' : 'Board dibuka kembali.' };
}

// ============ Library dan playbook ============
export async function addLibrary(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const board = s(fd, 'board');
  if (!e || !isId(board) || !(await canEdit(e.db, board))) return { error: DENIED };
  const name = s(fd, 'nama');
  if (!name || name.length > 64) return { error: 'Nama wajib diisi, paling banyak 64 karakter.' };
  const { data: last } = await e.db.from('libraries').select('position').eq('board_id', board).order('position', { ascending: false }).limit(1);
  const { error } = await e.db.from('libraries').insert({ board_id: board, name, description: s(fd, 'deskripsi') || null, position: (last?.[0]?.position ?? -1) + 1 });
  if (error) return { error: FAIL };
  refresh();
  return { ok: 'Ditambahkan.' };
}

export async function addPlaybook(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const lib = s(fd, 'library');
  if (!e || !isId(lib)) return { error: DENIED };
  const name = s(fd, 'nama');
  if (!name || name.length > 64) return { error: 'Nama wajib diisi, paling banyak 64 karakter.' };
  const { data: last } = await e.db.from('playbooks').select('position').eq('library_id', lib).order('position', { ascending: false }).limit(1);
  const { error } = await e.db.from('playbooks').insert({ library_id: lib, name, description: s(fd, 'deskripsi') || null, position: (last?.[0]?.position ?? -1) + 1 });
  if (error) return { error: DENIED }; // RLS menolak bila bukan editor board ini
  refresh();
  return { ok: 'Ditambahkan.' };
}

// Mengubah nama dan deskripsi library atau playbook.
export async function rename(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const kind = s(fd, 'jenis');
  const id = s(fd, 'id');
  const table = kind === 'library' ? 'libraries' : kind === 'playbook' ? 'playbooks' : null;
  if (!e || !table || !isId(id)) return { error: DENIED };
  const name = s(fd, 'nama');
  if (!name || name.length > 64) return { error: 'Nama wajib diisi, paling banyak 64 karakter.' };
  const { data, error } = await e.db.from(table).update({ name, description: s(fd, 'deskripsi') || null }).eq('id', id).select('id');
  if (error || !data?.length) return { error: DENIED };
  refresh();
  return { ok: 'Tersimpan.' };
}

// Library dan playbook yang sudah punya card terbit tidak dihapus, supaya riwayat baca tidak hilang.
export async function removeNode(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const kind = s(fd, 'jenis');
  const id = s(fd, 'id');
  if (!e || !isId(id) || (kind !== 'library' && kind !== 'playbook')) return { error: DENIED };

  let playbooks: string[];
  if (kind === 'library') {
    const { data } = await e.db.from('playbooks').select('id').eq('library_id', id);
    playbooks = (data ?? []).map((x) => x.id as string);
  } else playbooks = [id];
  if (playbooks.length) {
    const { count } = await e.db.from('cards').select('id', { count: 'exact', head: true }).in('playbook_id', playbooks).eq('status', 'published');
    if ((count ?? 0) > 0) return { error: 'Tidak bisa dihapus karena sudah berisi card yang terbit. Riwayat baca ikut hilang bila dihapus.' };
  }
  const { data, error } = await e.db.from(kind === 'library' ? 'libraries' : 'playbooks').delete().eq('id', id).select('id');
  if (error || !data?.length) return { error: DENIED };
  refresh();
  return { ok: 'Dihapus.' };
}

// Naik atau turun satu posisi di antara saudaranya. Posisi dinomori ulang supaya tidak ada nilai kembar.
const MOVE = {
  library: { table: 'libraries', parent: 'board_id', label: 'name' },
  playbook: { table: 'playbooks', parent: 'library_id', label: 'name' },
  card: { table: 'cards', parent: 'playbook_id', label: 'title' },
} as const;

export async function move(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const kind = s(fd, 'jenis') as keyof typeof MOVE;
  const id = s(fd, 'id');
  const cfg = MOVE[kind];
  if (!e || !cfg || !isId(id)) return { error: DENIED };
  const dir = s(fd, 'arah') === 'naik' ? -1 : 1;

  const { data: me } = await e.db.from(cfg.table).select(cfg.parent).eq('id', id).maybeSingle();
  if (!me) return { error: DENIED };
  const parentId = (me as unknown as Record<string, string>)[cfg.parent]!;
  const { data: sib } = await e.db.from(cfg.table).select(`id, position, ${cfg.label}`).eq(cfg.parent, parentId).order('position').order(cfg.label);
  const list = (sib ?? []) as unknown as { id: string; position: number }[];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return {};
  [list[i], list[j]] = [list[j]!, list[i]!];
  for (let k = 0; k < list.length; k++) {
    if (list[k]!.position === k) continue;
    const { error } = await e.db.from(cfg.table).update({ position: k }).eq('id', list[k]!.id);
    if (error) return { error: DENIED };
  }
  refresh();
  return {};
}

// ============ Card ============
export async function addCard(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const pb = s(fd, 'playbook');
  if (!e || !isId(pb)) return { error: DENIED };
  const title = s(fd, 'judul');
  if (!title || title.length > 120) return { error: 'Judul wajib diisi, paling banyak 120 karakter.' };
  const { data: last } = await e.db.from('cards').select('position').eq('playbook_id', pb).order('position', { ascending: false }).limit(1);
  const { data, error } = await e.db
    .from('cards')
    .insert({ playbook_id: pb, title, position: (last?.[0]?.position ?? -1) + 1, created_by: e.ctx.userId })
    .select('id')
    .single();
  if (error || !data) return { error: DENIED };
  refresh();
  redirect(`/kelola/sop/c/${data.id}`);
}

export async function removeCard(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id)) return { error: DENIED };
  const { data: c } = await e.db.from('cards').select('status').eq('id', id).maybeSingle();
  if (!c) return { error: DENIED };
  if (c.status === 'published') return { error: 'Card yang sudah terbit tidak bisa dihapus karena riwayat baca ikut hilang.' };
  const { data, error } = await e.db.from('cards').delete().eq('id', id).select('id');
  if (error || !data?.length) return { error: DENIED };
  refresh();
  return { ok: 'Dihapus.' };
}

const MAX_DOC = 400_000;

// Menyimpan draf, dan bila tombol Terbitkan yang ditekan, menerbitkan lewat publish_card().
export async function saveCard(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id)) return { error: DENIED };
  const title = s(fd, 'judul');
  if (!title || title.length > 120) return { error: 'Judul wajib diisi, paling banyak 120 karakter.' };

  const raw = String(fd.get('isi') ?? '');
  if (raw.length > MAX_DOC) return { error: 'Isi terlalu panjang. Pecah menjadi beberapa card.' };
  let doc;
  try { doc = sanitizeDoc(JSON.parse(raw)); } catch { doc = null; }
  if (!doc) return { error: 'Isi card tidak terbaca. Muat ulang halaman lalu coba lagi.' };

  const { data, error } = await e.db.from('cards').update({ title, draft_content: doc }).eq('id', id).select('id');
  if (error || !data?.length) return { error: DENIED };

  if (s(fd, 'aksi') !== 'terbit') { refresh(); return { ok: 'Draf tersimpan.' }; }

  if (doc.content?.length === 0) return { error: 'Draf tersimpan, tetapi card kosong tidak bisa diterbitkan.' };
  const change = s(fd, 'jenis') === 'besar' ? 'besar' : 'kecil';
  const { error: ep } = await e.db.rpc('publish_card', { p_card: id, p_change: change, p_note: s(fd, 'catatan') || null });
  if (ep) return { error: 'Draf tersimpan, tetapi belum bisa diterbitkan. Coba lagi.' };
  refresh();
  return { ok: change === 'besar' ? 'Diterbitkan. Semua peserta akan diminta membaca ulang.' : 'Diterbitkan sebagai perubahan kecil.' };
}

// ============ Wajib baca (tingkat playbook) ============
export async function addRequirement(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const pb = s(fd, 'playbook');
  const holding = s(fd, 'holding');
  if (!e || !isId(pb) || !canAccess(e.ctx, holding, 'sop')) return { error: DENIED };
  const due = s(fd, 'batas');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) return { error: 'Isi batas tanggal yang valid.' };

  // Holding target harus termasuk holding yang membuka board ini.
  const { data: lib } = await e.db.from('playbooks').select('library_id').eq('id', pb).maybeSingle();
  const { data: bd } = lib ? await e.db.from('libraries').select('board_id').eq('id', lib.library_id).maybeSingle() : { data: null };
  const { data: bh } = bd ? await e.db.from('board_holdings').select('holding_id').eq('board_id', bd.board_id) : { data: [] };
  if (!(bh ?? []).some((x) => x.holding_id === holding)) return { error: 'Holding ini tidak termasuk yang membuka board.' };

  const unit = s(fd, 'unit') || null;
  const { error } = await e.db.from('playbook_requirements').insert({ playbook_id: pb, holding_id: holding, unit, due_on: due });
  if (error) return { error: DENIED };
  await audit(e.ctx.userId, 'requirement.add', 'playbook', pb, holding, { unit, due_on: due });
  refresh();
  return { ok: 'Target ditambahkan.' };
}

export async function removeRequirement(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id)) return { error: DENIED };
  const { data: r } = await e.db.from('playbook_requirements').select('playbook_id, holding_id').eq('id', id).maybeSingle();
  const { data, error } = await e.db.from('playbook_requirements').delete().eq('id', id).select('id');
  if (error || !data?.length) return { error: DENIED };
  if (r) await audit(e.ctx.userId, 'requirement.remove', 'playbook', r.playbook_id, r.holding_id);
  refresh();
  return { ok: 'Target dihapus.' };
}
