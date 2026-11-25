import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { DialogButton } from '@/app/sop/Pop';
import { getCtx } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { loadCoursePerm } from '@/lib/perm';
import { NewCourseForm } from './forms';

export const metadata = { title: 'Kelola pembelajaran' };
const STATUS: Record<string, [string, string]> = { draft: ['Draf', 'grey'], published: ['Terbit', 'ok'], archived: ['Arsip', 'warn'] };

export default async function KelolaBelajar() {
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'pembelajaran').length === 0) notFound();
  const db = await createClient();
  const { data } = await db.from('courses')
    .select('id, title, status, enroll_mode, category, course_items(count), enrollments(count), course_holdings(holding_id)')
    .order('updated_at', { ascending: false }).limit(300);
  const courses = (data ?? []) as unknown as { id: string; title: string; status: string; enroll_mode: string; category: string | null; course_items: { count: number }[]; enrollments: { count: number }[]; course_holdings: { holding_id: string }[] }[];
  const perm = await loadCoursePerm(ctx, null);

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Pembelajaran' }]} />
      <div className="row between" style={{ marginBottom: 14 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Kelola pembelajaran</h1>
        <DialogButton label="Kursus baru" title="Kursus baru"><NewCourseForm perm={perm} /></DialogButton>
      </div>
      {courses.length === 0 ? (
        <div className="glass card empty"><h2>Belum ada kursus</h2><p className="sub">Buat kursus dari card SOP yang sudah terbit, video, dan kuis.</p></div>
      ) : (
        <div className="grid">
          {courses.map((c) => {
            const [label, tone] = STATUS[c.status] ?? STATUS.draft!;
            return (
              <Link key={c.id} href={`/kelola/belajar/${c.id}`} className="glass card" style={{ textDecoration: 'none', color: 'var(--ink)', display: 'grid', gap: 6, alignContent: 'start' }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`chip ${tone}`}>{label}</span>
                  <span className="chip grey">{c.enroll_mode === 'terbuka' ? 'Terbuka' : 'Ditugaskan'}</span>
                  {c.category && <span className="chip grey">{c.category}</span>}
                </div>
                <h2 style={{ fontSize: 18, color: 'var(--p)', margin: 0 }}>{c.title}</h2>
                <span className="muted" style={{ fontSize: 13 }}>{c.course_items[0]?.count ?? 0} item, {c.enrollments[0]?.count ?? 0} peserta, {c.course_holdings.length} holding</span>
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
