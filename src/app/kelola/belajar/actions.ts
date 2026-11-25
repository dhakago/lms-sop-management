'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCtx, type Ctx } from '@/lib/session';
import { canAccess, holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { applyCoursePerm, parsePayload } from '@/lib/perm';

export type St = { error?: string; ok?: string };
type Db = Awaited<ReturnType<typeof createClient>>;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const isId = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const DENIED = 'Anda tidak punya akses untuk mengubah ini.';
const FAIL = 'Belum bisa disimpan. Coba lagi.';
const refresh = () => revalidatePath('/', 'layout');
const int = (v: string, lo: number, hi: number) => (/^\d+$/.test(v) && +v >= lo && +v <= hi ? +v : null);

async function editor(): Promise<{ ctx: Ctx; db: Db } | null> {
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'pembelajaran').length === 0) return null;
  return { ctx, db: await createClient() };
}
async function canEdit(db: Db, course: string) {
  const { data } = await db.rpc('can_edit_course', { c: course });
  return data === true;
}

// ============ Kursus ============
export async function createCourse(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  if (!e) return { error: DENIED };
  const title = s(fd, 'judul');
  if (!title || title.length > 120) return { error: 'Judul wajib diisi, paling banyak 120 karakter.' };
  const perm = parsePayload(s(fd, 'izin'));
  if (!perm || !perm.holdings.some((h) => (h.all || h.rows.length > 0) && h.id !== 'people' && canAccess(e.ctx, h.id, 'pembelajaran'))) {
    return { error: 'Buka untuk minimal satu holding di Permissions.' };
  }
  const { data: c, error } = await e.db.from('courses').insert({ title, created_by: e.ctx.userId }).select('id').single();
  if (error || !c) return { error: FAIL };
  const msg = await applyCoursePerm(e.ctx, e.db, c.id, perm);
  if (msg) {
    await e.db.from('courses').delete().eq('id', c.id); // kursus tanpa holding tidak bisa diurus; boleh dihapus pembuatnya
    return { error: msg };
  }
  refresh();
  redirect(`/kelola/belajar/${c.id}`);
}

export async function updateCourse(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id) || !(await canEdit(e.db, id))) return { error: DENIED };
  const title = s(fd, 'judul');
  if (!title || title.length > 120) return { error: 'Judul wajib diisi, paling banyak 120 karakter.' };
  const est = s(fd, 'menit');
  const minutes = est ? int(est, 1, 6000) : null;
  if (est && minutes === null) return { error: 'Perkiraan durasi harus angka 1 sampai 6000 menit.' };
  const mode = s(fd, 'mode') === 'terbuka' ? 'terbuka' : 'ditugaskan';
  const { error } = await e.db.from('courses').update({
    title, description: s(fd, 'deskripsi') || null, category: s(fd, 'kategori').slice(0, 60) || null,
    est_minutes: minutes, enroll_mode: mode, sequential: s(fd, 'urut') === '1',
  }).eq('id', id);
  if (error) return { error: FAIL };
  const raw = s(fd, 'izin');
  if (raw) {
    const perm = parsePayload(raw);
    if (!perm) return { error: FAIL };
    const msg = await applyCoursePerm(e.ctx, e.db, id, perm);
    if (msg) return { error: msg };
  }
  refresh();
  return { ok: 'Tersimpan.' };
}

// Syarat terbit: minimal satu item, setiap kuis aktif dan lengkap (tiap soal punya pilihan benar).
async function publishProblem(db: Db, course: string): Promise<string | null> {
  const { data: items } = await db.from('course_items').select('id, title, kind, quiz_id').eq('course_id', course);
  if (!(items ?? []).length) return 'Tambahkan minimal satu item sebelum menerbitkan.';
  for (const it of (items ?? []).filter((i) => i.kind === 'quiz')) {
    const { data: qz } = await db.from('quizzes').select('status').eq('id', it.quiz_id as string).maybeSingle();
    if (!qz || qz.status !== 'live') return `Kuis "${it.title}" belum diaktifkan.`;
  }
  return null;
}

export async function setCourseStatus(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  const to = s(fd, 'status');
  if (!e || !isId(id) || !['draft', 'published', 'archived'].includes(to) || !(await canEdit(e.db, id))) return { error: DENIED };
  if (to === 'published') { const p = await publishProblem(e.db, id); if (p) return { error: p }; }
  const { error } = await e.db.from('courses').update({ status: to }).eq('id', id);
  if (error) return { error: FAIL };
  refresh();
  return { ok: to === 'published' ? 'Kursus terbit.' : to === 'archived' ? 'Kursus diarsipkan.' : 'Kursus kembali jadi draf.' };
}

export async function deleteCourse(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id) || !(await canEdit(e.db, id))) return { error: DENIED };
  const { count } = await e.db.from('enrollments').select('id', { count: 'exact', head: true }).eq('course_id', id);
  if ((count ?? 0) > 0) return { error: 'Kursus ini sudah punya peserta. Arsipkan saja agar riwayat tetap ada.' };
  const { error } = await e.db.from('courses').delete().eq('id', id);
  if (error) return { error: 'Kursus belum bisa dihapus. Hapus dulu item dan kuisnya, atau arsipkan.' };
  refresh();
  redirect('/kelola/belajar');
}

// ============ Item ============
async function nextPos(db: Db, course: string) {
  const { data } = await db.from('course_items').select('position').eq('course_id', course).order('position', { ascending: false }).limit(1);
  return ((data?.[0]?.position as number | undefined) ?? -1) + 1;
}

export async function addCardItem(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const course = s(fd, 'course'); const card = s(fd, 'card');
  if (!e || !isId(course) || !(await canEdit(e.db, course))) return { error: DENIED };
  if (!isId(card)) return { error: 'Pilih card.' };
  const { data: c } = await e.db.from('cards').select('title, status, current_version_id').eq('id', card).maybeSingle();
  if (!c || !c.current_version_id) return { error: 'Card ini belum diterbitkan.' };
  const { error } = await e.db.from('course_items').insert({ course_id: course, kind: 'card', card_id: card, title: s(fd, 'judul') || (c.title as string), position: await nextPos(e.db, course) });
  if (error) return { error: error.message.includes('belum dibuka') ? 'Board card ini belum dibuka untuk semua holding kursus.' : 'Card ini tidak bisa dipakai di kursus.' };
  refresh();
  return { ok: 'Card ditambahkan.' };
}

export async function addVideoItem(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const course = s(fd, 'course');
  if (!e || !isId(course) || !(await canEdit(e.db, course))) return { error: DENIED };
  const title = s(fd, 'judul'); const url = s(fd, 'url');
  if (!title || title.length > 120) return { error: 'Judul wajib diisi.' };
  if (!/^https:\/\/[^\s]{4,280}$/i.test(url)) return { error: 'Tautan video harus diawali https://' };
  const { error } = await e.db.from('course_items').insert({ course_id: course, kind: 'video', title, video_url: url, position: await nextPos(e.db, course) });
  if (error) return { error: FAIL };
  refresh();
  return { ok: 'Video ditambahkan.' };
}

export async function addQuizItem(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const course = s(fd, 'course');
  if (!e || !isId(course) || !(await canEdit(e.db, course))) return { error: DENIED };
  const title = s(fd, 'judul');
  if (!title || title.length > 120) return { error: 'Judul wajib diisi.' };
  const { data: q, error } = await e.db.from('quizzes').insert({ course_id: course, title }).select('id').single();
  if (error || !q) return { error: FAIL };
  const { error: e2 } = await e.db.from('course_items').insert({ course_id: course, kind: 'quiz', quiz_id: q.id, title, position: await nextPos(e.db, course) });
  if (e2) { await e.db.from('quizzes').delete().eq('id', q.id); return { error: FAIL }; }
  refresh();
  redirect(`/kelola/belajar/q/${q.id}`);
}

export async function renameItem(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id'); const title = s(fd, 'judul');
  if (!e || !isId(id) || !title || title.length > 120) return { error: 'Judul wajib diisi.' };
  const { data, error } = await e.db.from('course_items').update({ title }).eq('id', id).select('id');
  if (error || !data?.length) return { error: DENIED };
  refresh();
  return { ok: 'Tersimpan.' };
}

export async function removeItem(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id)) return { error: DENIED };
  const { data: it } = await e.db.from('course_items').select('course_id, quiz_id').eq('id', id).maybeSingle();
  if (!it || !(await canEdit(e.db, it.course_id as string))) return { error: DENIED };
  const { error } = await e.db.from('course_items').delete().eq('id', id);
  if (error) return { error: FAIL };
  if (it.quiz_id) await e.db.from('quizzes').delete().eq('id', it.quiz_id as string);
  refresh();
  return { ok: 'Item dihapus.' };
}

export async function moveItem(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id'); const dir = s(fd, 'arah') === 'naik' ? -1 : 1;
  if (!e || !isId(id)) return { error: DENIED };
  const { data: it } = await e.db.from('course_items').select('course_id').eq('id', id).maybeSingle();
  if (!it || !(await canEdit(e.db, it.course_id as string))) return { error: DENIED };
  const { data: all } = await e.db.from('course_items').select('id').eq('course_id', it.course_id as string).order('position').order('id');
  const ids = (all ?? []).map((x) => x.id as string);
  const i = ids.indexOf(id); const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return {};
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  for (let k = 0; k < ids.length; k++) {
    const { error } = await e.db.from('course_items').update({ position: k }).eq('id', ids[k]!);
    if (error) return { error: FAIL };
  }
  refresh();
  return {};
}

// ============ Kuis ============
async function quizEditor(quiz: string): Promise<{ db: Db; course: string } | null> {
  const e = await editor();
  if (!e || !isId(quiz)) return null;
  const { data } = await e.db.from('quizzes').select('course_id').eq('id', quiz).maybeSingle();
  if (!data || !(await canEdit(e.db, data.course_id as string))) return null;
  return { db: e.db, course: data.course_id as string };
}

export async function updateQuiz(_p: St, fd: FormData): Promise<St> {
  const id = s(fd, 'id');
  const q = await quizEditor(id);
  if (!q) return { error: DENIED };
  const title = s(fd, 'judul');
  const pass = int(s(fd, 'lulus'), 1, 100);
  const cool = int(s(fd, 'jeda') || '0', 0, 43200);
  const maxRaw = s(fd, 'maks');
  const max = maxRaw ? int(maxRaw, 1, 50) : null;
  if (!title || title.length > 120) return { error: 'Judul wajib diisi.' };
  if (pass === null) return { error: 'Nilai lulus harus 1 sampai 100.' };
  if (cool === null) return { error: 'Jeda antar percobaan harus 0 sampai 43200 menit.' };
  if (maxRaw && max === null) return { error: 'Batas percobaan harus 1 sampai 50, atau kosongkan.' };
  const { error } = await q.db.from('quizzes').update({
    title, pass_percent: pass, cooldown_minutes: cool, max_attempts: max,
    show_answers: s(fd, 'tinjau') === 'never' ? 'never' : 'end',
    shuffle_questions: s(fd, 'acak_soal') === '1', shuffle_answers: s(fd, 'acak_jawab') === '1',
  }).eq('id', id);
  if (error) return { error: FAIL };
  await q.db.from('course_items').update({ title }).eq('quiz_id', id);
  refresh();
  return { ok: 'Tersimpan.' };
}

export async function setQuizStatus(_p: St, fd: FormData): Promise<St> {
  const id = s(fd, 'id');
  const q = await quizEditor(id);
  if (!q) return { error: DENIED };
  const to = s(fd, 'status') === 'live' ? 'live' : 'draft';
  if (to === 'live') {
    const { data: qs } = await q.db.from('quiz_questions').select('id, prompt, quiz_options(is_correct)').eq('quiz_id', id);
    if (!(qs ?? []).length) return { error: 'Tambahkan minimal satu soal.' };
    for (const x of qs ?? []) {
      const o = (x.quiz_options as { is_correct: boolean }[]) ?? [];
      if (o.length < 2) return { error: `Soal "${x.prompt}" butuh minimal dua pilihan.` };
      if (!o.some((y) => y.is_correct)) return { error: `Soal "${x.prompt}" belum punya jawaban benar.` };
    }
  }
  const { error } = await q.db.from('quizzes').update({ status: to }).eq('id', id);
  if (error) return { error: FAIL };
  refresh();
  return { ok: to === 'live' ? 'Kuis aktif.' : 'Kuis kembali jadi draf.' };
}

// Pilihan dikirim sebagai opsi_1..opsi_6 dengan benar_1..benar_6.
function readOptions(fd: FormData): { text: string; ok: boolean }[] | string {
  const out: { text: string; ok: boolean }[] = [];
  for (let i = 1; i <= 6; i++) {
    const text = s(fd, `opsi_${i}`);
    if (!text) continue;
    if (text.length > 300) return 'Satu pilihan paling banyak 300 karakter.';
    out.push({ text, ok: s(fd, `benar_${i}`) === '1' });
  }
  if (out.length < 2) return 'Isi minimal dua pilihan.';
  if (!out.some((o) => o.ok)) return 'Tandai minimal satu jawaban benar.';
  return out;
}

export async function saveQuestion(_p: St, fd: FormData): Promise<St> {
  const quiz = s(fd, 'quiz'); const id = s(fd, 'id');
  const q = await quizEditor(quiz);
  if (!q) return { error: DENIED };
  const prompt = s(fd, 'soal');
  if (!prompt || prompt.length > 600) return { error: 'Soal wajib diisi, paling banyak 600 karakter.' };
  const opts = readOptions(fd);
  if (typeof opts === 'string') return { error: opts };
  const explanation = s(fd, 'penjelasan').slice(0, 1000) || null;

  let qid = id;
  if (id) {
    if (!isId(id)) return { error: DENIED };
    const { data, error } = await q.db.from('quiz_questions').update({ prompt, explanation }).eq('id', id).eq('quiz_id', quiz).select('id');
    if (error || !data?.length) return { error: DENIED };
    await q.db.from('quiz_options').delete().eq('question_id', id);
  } else {
    const { data: last } = await q.db.from('quiz_questions').select('position').eq('quiz_id', quiz).order('position', { ascending: false }).limit(1);
    const { data, error } = await q.db.from('quiz_questions').insert({ quiz_id: quiz, prompt, explanation, position: ((last?.[0]?.position as number | undefined) ?? -1) + 1 }).select('id').single();
    if (error || !data) return { error: FAIL };
    qid = data.id as string;
  }
  const { error } = await q.db.from('quiz_options').insert(opts.map((o, i) => ({ question_id: qid, position: i, text: o.text, is_correct: o.ok })));
  if (error) return { error: FAIL };
  // Mengubah soal pada kuis aktif tetap diizinkan, tetapi kuis kembali dicek saat diaktifkan ulang.
  refresh();
  return { ok: 'Soal tersimpan.' };
}

export async function deleteQuestion(_p: St, fd: FormData): Promise<St> {
  const quiz = s(fd, 'quiz'); const id = s(fd, 'id');
  const q = await quizEditor(quiz);
  if (!q || !isId(id)) return { error: DENIED };
  const { error } = await q.db.from('quiz_questions').delete().eq('id', id).eq('quiz_id', quiz);
  if (error) return { error: FAIL };
  refresh();
  return { ok: 'Soal dihapus.' };
}

// ============ Penugasan dan peserta ============
export async function addAssignment(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const course = s(fd, 'course');
  if (!e || !isId(course) || !(await canEdit(e.db, course))) return { error: DENIED };
  const jenis = s(fd, 'jenis') || 'holding';
  let holding = s(fd, 'holding');
  const row: Record<string, unknown> = { course_id: course, created_by: e.ctx.userId };
  if (jenis === 'group') {
    const g = s(fd, 'grup');
    if (!isId(g)) return { error: 'Pilih grup.' };
    const { data: grp } = await e.db.from('groups').select('holding_id').eq('id', g).maybeSingle();
    if (!grp) return { error: 'Grup tidak ditemukan.' };
    holding = grp.holding_id as string;
    Object.assign(row, { target_type: 'group', group_id: g });
  } else if (jenis === 'user') {
    const u = s(fd, 'orang');
    if (!isId(u)) return { error: 'Pilih orang dari hasil pencarian.' };
    Object.assign(row, { target_type: 'user', profile_id: u });
  } else {
    Object.assign(row, { target_type: 'holding', unit: s(fd, 'unit') || null });
  }
  if (!canAccess(e.ctx, holding, 'pembelajaran')) return { error: DENIED };
  const { data: ch } = await e.db.from('course_holdings').select('holding_id').eq('course_id', course).eq('holding_id', holding);
  if (!ch?.length) return { error: 'Holding ini belum dibuka untuk kursus. Atur di Permissions.' };
  const dd = s(fd, 'hari');
  const days = dd ? int(dd, 1, 1000) : null;
  if (dd && days === null) return { error: 'Batas hari harus 1 sampai 1000.' };
  Object.assign(row, { holding_id: holding, due_days: days });
  const { error } = await e.db.from('course_assignments').insert(row);
  if (error) return { error: 'Sasaran ini tidak bisa ditugaskan. Pastikan mereka punya akses baca ke kursus dan anggota holding tersebut.' };
  refresh();
  return { ok: 'Penugasan ditambahkan dan peserta didaftarkan.' };
}

export async function removeAssignment(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id)) return { error: DENIED };
  const { data, error } = await e.db.from('course_assignments').delete().eq('id', id).select('id');
  if (error || !data?.length) return { error: DENIED };
  refresh();
  return { ok: 'Penugasan dicabut. Peserta yang sudah terdaftar tetap ada.' };
}

export async function removeEnrollment(_p: St, fd: FormData): Promise<St> {
  const e = await editor();
  const id = s(fd, 'id');
  if (!e || !isId(id)) return { error: DENIED };
  const { data, error } = await e.db.from('enrollments').delete().eq('id', id).select('id');
  if (error || !data?.length) return { error: DENIED };
  refresh();
  return { ok: 'Peserta dikeluarkan dari kursus.' };
}
