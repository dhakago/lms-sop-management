import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { DialogButton, Menu, MenuDialog } from '@/app/sop/Pop';
import { getCtx } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { DeleteQuestionForm, QuestionForm, QuizSettingsForm, QuizStatusForm } from '../../forms';

export const metadata = { title: 'Kuis' };

export default async function EditKuis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'pembelajaran').length === 0) notFound();
  const db = await createClient();
  const { data: quiz } = await db.from('quizzes').select('id, course_id, title, status, pass_percent, show_answers, shuffle_questions, shuffle_answers, max_attempts, cooldown_minutes, courses(title)').eq('id', id).maybeSingle();
  if (!quiz) notFound();
  const { data: qs } = await db.from('quiz_questions').select('id, prompt, explanation, position, quiz_options(id, text, is_correct, position)').eq('quiz_id', id).order('position');
  const questions = (qs ?? []) as unknown as { id: string; prompt: string; explanation: string | null; quiz_options: { id: string; text: string; is_correct: boolean; position: number }[] }[];
  const course = quiz.courses as unknown as { title: string } | null;
  const live = quiz.status === 'live';

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Pembelajaran', href: '/kelola/belajar' }, { label: course?.title ?? 'Kursus', href: `/kelola/belajar/${quiz.course_id}` }, { label: quiz.title }]} />
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{quiz.title}</h1>
          <span className={`chip ${live ? 'ok' : 'grey'}`}>{live ? 'Aktif' : 'Draf'}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <QuizStatusForm id={id} live={live} />
          <DialogButton label="Pengaturan" title="Pengaturan kuis" plus={false} className="btn sec">
            <QuizSettingsForm q={{ id, title: quiz.title, pass: quiz.pass_percent, max: quiz.max_attempts, cooldown: quiz.cooldown_minutes, show: quiz.show_answers, shuffleQ: quiz.shuffle_questions, shuffleA: quiz.shuffle_answers }} />
          </DialogButton>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Nilai lulus {quiz.pass_percent}%. {quiz.max_attempts ? `Maksimal ${quiz.max_attempts} percobaan.` : 'Percobaan tanpa batas.'}
        {quiz.cooldown_minutes ? ` Jeda ${quiz.cooldown_minutes} menit.` : ''} Peserta mengulang otomatis, admin tidak perlu menugaskan ulang.
      </p>
      <section className="glass card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>Soal ({questions.length})</h2>
          <DialogButton label="Soal" title="Tambah soal"><QuestionForm quiz={id} /></DialogButton>
        </div>
        {questions.length === 0 ? <p className="muted">Belum ada soal.</p> : (
          <div className="list">
            {questions.map((q, i) => {
              const opts = [...q.quiz_options].sort((a, b) => a.position - b.position);
              return (
                <div key={q.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <b>{i + 1}. {q.prompt}</b>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {opts.map((o) => <li key={o.id} style={{ fontWeight: o.is_correct ? 700 : 400 }}>{o.text}{o.is_correct ? ' (benar)' : ''}</li>)}
                    </ul>
                  </div>
                  <Menu label="Soal">
                    <MenuDialog label="Ubah" title="Ubah soal">
                      <QuestionForm quiz={id} q={{ id: q.id, prompt: q.prompt, explanation: q.explanation ?? '', options: opts.map((o) => ({ text: o.text, correct: o.is_correct })) }} />
                    </MenuDialog>
                    <MenuDialog label="Hapus" title="Hapus soal" danger><DeleteQuestionForm quiz={id} id={q.id} /></MenuDialog>
                  </Menu>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </Shell>
  );
}
