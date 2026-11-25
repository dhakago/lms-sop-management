import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { RichText } from '@/components/RichText';
import { getCtx } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fmtDate } from '@/lib/sop';
import { CompleteForm, EnrollForm } from '../forms';
import { QuizPlayer, type QuizQ } from '../Quiz';

export const metadata = { title: 'Kursus' };
type Item = { id: string; position: number; kind: 'card' | 'video' | 'quiz'; title: string; card_id: string | null; video_url: string | null; quiz_id: string | null };

// Hanya tautan YouTube yang dibenamkan. Selain itu ditampilkan sebagai tautan biasa.
function youtubeId(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).match(/^[\w-]{11}$/)?.[0] ?? null;
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      const v = url.searchParams.get('v') ?? url.pathname.match(/\/(?:embed|shorts)\/([\w-]{11})/)?.[1];
      return v && /^[\w-]{11}$/.test(v) ? v : null;
    }
  } catch { /* tautan tidak valid */ }
  return null;
}

export default async function Kursus({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getCtx();
  const db = await createClient();

  const { data: course } = await db.from('courses').select('id, title, description, category, est_minutes, status, enroll_mode, sequential').eq('id', id).maybeSingle();
  if (!course || course.status !== 'published') notFound();
  const { data: itemRows } = await db.from('course_items').select('id, position, kind, title, card_id, video_url, quiz_id').eq('course_id', id).order('position');
  const items = (itemRows ?? []) as Item[];
  const { data: enr } = await db.from('enrollments').select('id, status, due_on, escalated_at, source').eq('course_id', id).eq('profile_id', ctx.userId).maybeSingle();

  // Belum terdaftar: ringkasan dan tombol daftar (hanya bila terbuka).
  if (!enr) {
    return (
      <Shell ctx={ctx} active="belajar">
        <Crumbs items={[{ label: 'Pembelajaran', href: '/belajar' }, { label: course.title }]} />
        <h1 className="page-title">{course.title}</h1>
        <section className="glass card" style={{ maxWidth: 640, display: 'grid', gap: 12 }}>
          {course.description && <p style={{ margin: 0 }}>{course.description}</p>}
          <p className="muted" style={{ margin: 0 }}>{items.length} item{course.est_minutes ? ` · sekitar ${course.est_minutes} menit` : ''}</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>{items.map((i) => <li key={i.id}>{i.title}</li>)}</ol>
          {course.enroll_mode === 'terbuka' ? <EnrollForm course={id} /> : <div className="alert info">Kursus ini ditugaskan oleh admin. Anda akan terdaftar otomatis bila ditugaskan.</div>}
        </section>
      </Shell>
    );
  }

  const { data: prog } = await db.from('item_progress').select('item_id').eq('enrollment_id', enr.id);
  const doneSet = new Set((prog ?? []).map((p) => p.item_id as string));
  const isOpen = (idx: number) => !course.sequential || items.slice(0, idx).every((x) => doneSet.has(x.id));
  const firstOpen = items.findIndex((x, i) => !doneSet.has(x.id) && isOpen(i));
  const wanted = items.findIndex((x) => x.id === sp.item);
  const cur = wanted >= 0 && isOpen(wanted) ? wanted : firstOpen >= 0 ? firstOpen : 0;
  const item = items[cur];

  // Isi item. Card dibaca dengan kunci layanan setelah pendaftaran dan keanggotaan item diperiksa di atas.
  let body: React.ReactNode = <p className="muted">Kursus ini belum berisi item.</p>;
  if (item) {
    const completed = doneSet.has(item.id);
    if (item.kind === 'card') {
      const admin = createAdminClient();
      const { data: card } = await admin.from('cards').select('current_version_id, status').eq('id', item.card_id!).maybeSingle();
      const { data: ver } = card?.current_version_id ? await admin.from('card_versions').select('content, title, version').eq('id', card.current_version_id).maybeSingle() : { data: null };
      body = (
        <>
          {ver ? <div className="prose"><RichText doc={ver.content} /></div> : <p className="muted">Card ini belum diterbitkan.</p>}
          {!completed && ver && <CompleteForm enrollment={enr.id} item={item.id} label="Sudah saya baca" />}
        </>
      );
    } else if (item.kind === 'video') {
      const yt = youtubeId(item.video_url!);
      body = (
        <>
          {yt ? (
            <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
              <iframe title={item.title} src={`https://www.youtube-nocookie.com/embed/${yt}`} allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
          ) : <p>Video tidak bisa dibenamkan. <a href={/^https?:\/\//i.test(item.video_url!) ? item.video_url! : '#'} target="_blank" rel="noopener noreferrer">Buka tautan video</a>.</p>}
          {!completed && <CompleteForm enrollment={enr.id} item={item.id} label="Sudah selesai menonton" />}
        </>
      );
    } else {
      const admin = createAdminClient();
      const { data: qz } = await admin.from('quizzes').select('id, title, status, pass_percent, shuffle_questions, shuffle_answers, max_attempts, cooldown_minutes').eq('id', item.quiz_id!).maybeSingle();
      const { data: attempts } = await db.from('quiz_attempts').select('attempt_no, score_percent, passed, submitted_at').eq('enrollment_id', enr.id).eq('item_id', item.id).order('attempt_no');
      if (!qz || qz.status !== 'live') body = <p className="muted">Kuis ini belum aktif.</p>;
      else if (completed) body = <div className="alert info">Kuis sudah lulus{attempts?.length ? `, nilai ${attempts[attempts.length - 1]!.score_percent}%` : ''}.</div>;
      else {
        const { data: qs } = await admin.from('quiz_questions').select('id, prompt, position, quiz_options(id, text, position)').eq('quiz_id', qz.id).order('position');
        const { data: correct } = await admin.from('quiz_options').select('question_id').eq('is_correct', true).in('question_id', (qs ?? []).map((q) => q.id as string));
        const nCorrect = new Map<string, number>();
        for (const c of correct ?? []) nCorrect.set(c.question_id as string, (nCorrect.get(c.question_id as string) ?? 0) + 1);
        const questions: QuizQ[] = (qs ?? []).map((q) => ({
          id: q.id as string, prompt: q.prompt as string, multiple: (nCorrect.get(q.id as string) ?? 0) > 1,
          options: [...((q.quiz_options as { id: string; text: string; position: number }[]) ?? [])].sort((a, b) => a.position - b.position).map((o) => ({ id: o.id, text: o.text })),
        }));
        const last = attempts?.[attempts.length - 1];
        const nextRetry = last && qz.cooldown_minutes > 0 ? new Date(new Date(last.submitted_at as string).getTime() + qz.cooldown_minutes * 60000).toISOString() : null;
        body = (
          <QuizPlayer key={item.id} enrollment={enr.id} item={item.id} title={item.title} questions={questions} passPercent={qz.pass_percent} attemptsUsed={attempts?.length ?? 0}
            maxAttempts={qz.max_attempts} shuffleQ={qz.shuffle_questions} shuffleA={qz.shuffle_answers} nextRetryAt={nextRetry}
            history={(attempts ?? []).map((a) => ({ no: a.attempt_no as number, score: a.score_percent as number, passed: a.passed as boolean }))} />
        );
      }
    }
  }

  const doneCount = items.filter((x) => doneSet.has(x.id)).length;
  return (
    <Shell ctx={ctx} active="belajar">
      <Crumbs items={[{ label: 'Pembelajaran', href: '/belajar' }, { label: course.title }]} />
      <div className="row between" style={{ marginBottom: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{course.title}</h1>
        <div className="row" style={{ gap: 6 }}>
          <span className={`chip ${enr.status === 'selesai' ? 'ok' : 'grey'}`}>{enr.status === 'selesai' ? 'Selesai' : `${doneCount} dari ${items.length}`}</span>
          {enr.due_on && enr.status !== 'selesai' && <span className="chip warn">Batas {fmtDate(enr.due_on)}</span>}
        </div>
      </div>
      {enr.status === 'selesai' && <div className="alert info" style={{ marginBottom: 12 }}>Anda sudah menyelesaikan kursus ini.</div>}
      <div className="reader">
        <aside className="reader-list" aria-label="Daftar item">
          <nav>
            {items.map((x, i) => {
              const open = isOpen(i); const d = doneSet.has(x.id);
              return open ? (
                <Link key={x.id} href={`/belajar/${id}?item=${x.id}`} className="pb-card" aria-current={i === cur ? 'page' : undefined} style={{ marginBottom: 8, borderLeftColor: d ? '#2E8B57' : undefined }}>
                  <b>{i + 1}. {x.title}</b>
                  <span className="meta">{x.kind === 'card' ? 'Bacaan' : x.kind === 'video' ? 'Video' : 'Kuis'}{d ? ' · selesai' : ''}</span>
                </Link>
              ) : (
                <div key={x.id} className="pb-card" aria-disabled="true" style={{ marginBottom: 8, opacity: 0.55, borderLeftColor: '#9AA0A6' }}>
                  <b>{i + 1}. {x.title}</b><span className="meta">Terkunci, selesaikan item sebelumnya</span>
                </div>
              );
            })}
          </nav>
        </aside>
        <section className="reader-pane" aria-live="polite">
          {item && <h2 style={{ marginTop: 0 }}>{item.title}</h2>}
          {body}
        </section>
      </div>
    </Shell>
  );
}
