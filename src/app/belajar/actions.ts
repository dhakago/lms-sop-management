'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type St = { error?: string; ok?: string };
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const refresh = () => revalidatePath('/', 'layout');

// Pesan dari database sudah berbahasa Indonesia dan aman ditampilkan (lihat fungsi di migrasi 0007).
const msg = (e: { message?: string } | null) => (e?.message && !/violates|permission denied|syntax/i.test(e.message) ? e.message : 'Belum bisa diproses. Coba lagi.');

export async function selfEnroll(_p: St, fd: FormData): Promise<St> {
  const ctx = await getCtx();
  const course = s(fd, 'course');
  if (!isId(course)) return { error: 'Kursus tidak ditemukan.' };
  const db = await createClient();
  const { error } = await db.rpc('self_enroll', { p_course: course });
  if (error) return { error: msg(error) };
  void ctx;
  refresh();
  redirect(`/belajar/${course}`);
}

export async function completeItem(_p: St, fd: FormData): Promise<St> {
  const enrollment = s(fd, 'enrollment');
  const item = s(fd, 'item');
  if (!isId(enrollment) || !isId(item)) return { error: 'Item tidak ditemukan.' };
  const db = await createClient();
  const { error } = await db.rpc('complete_item', { p_enrollment: enrollment, p_item: item });
  if (error) return { error: msg(error) };
  refresh();
  return { ok: 'Ditandai selesai.' };
}

export type QuizResult = {
  attempt: number; score: number; passed: boolean; pass_percent: number; attempts_left: number | null;
  escalated: boolean; next_retry_at: string | null;
  review: { question: string; correct: string[]; explanation: string | null; right: boolean }[] | null;
};

// answers: { [questionId]: optionId[] }. Penilaian dilakukan di database.
export async function submitQuiz(enrollment: string, item: string, answers: Record<string, string[]>): Promise<{ error?: string; result?: QuizResult }> {
  if (!isId(enrollment) || !isId(item) || typeof answers !== 'object' || answers === null) return { error: 'Data tidak valid.' };
  const clean: Record<string, string[]> = {};
  for (const [q, opts] of Object.entries(answers)) {
    if (!isId(q) || !Array.isArray(opts) || opts.length > 20 || !opts.every(isId)) return { error: 'Data tidak valid.' };
    clean[q] = opts;
  }
  const db = await createClient();
  const { data, error } = await db.rpc('submit_quiz_attempt', { p_enrollment: enrollment, p_item: item, p_answers: clean });
  if (error) return { error: msg(error) };
  refresh();
  return { result: data as QuizResult };
}
