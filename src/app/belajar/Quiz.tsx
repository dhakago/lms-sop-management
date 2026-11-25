'use client';
import { useMemo, useState } from 'react';
import { submitQuiz, type QuizResult } from './actions';

export type QuizQ = { id: string; prompt: string; multiple: boolean; options: { id: string; text: string }[] };

// Acak deterministik per percobaan supaya urutan tidak berubah saat layar digambar ulang.
function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let x = seed || 1;
  for (let i = a.length - 1; i > 0; i--) { x = (x * 1664525 + 1013904223) % 4294967296; const j = x % (i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

export function QuizPlayer({ enrollment, item, title, questions, passPercent, attemptsUsed, maxAttempts, shuffleQ, shuffleA, nextRetryAt, history }: {
  enrollment: string; item: string; title: string; questions: QuizQ[]; passPercent: number; attemptsUsed: number; maxAttempts: number | null;
  shuffleQ: boolean; shuffleA: boolean; nextRetryAt: string | null; history: { no: number; score: number; passed: boolean }[];
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(attemptsUsed + 1);

  const view = useMemo(() => {
    const qs = shuffleQ ? shuffled(questions, round * 7919) : questions;
    return qs.map((q, i) => ({ ...q, options: shuffleA ? shuffled(q.options, round * 104729 + i) : q.options }));
  }, [questions, shuffleQ, shuffleA, round]);

  const left = maxAttempts === null ? null : Math.max(maxAttempts - attemptsUsed, 0);
  const waiting = nextRetryAt && new Date(nextRetryAt) > new Date() ? new Date(nextRetryAt) : null;

  function toggle(q: QuizQ, opt: string) {
    setAnswers((a) => {
      const cur = a[q.id] ?? [];
      if (!q.multiple) return { ...a, [q.id]: [opt] };
      return { ...a, [q.id]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });
  }

  async function submit() {
    setErr('');
    if (questions.some((q) => !(answers[q.id]?.length))) { setErr('Jawab semua soal dulu.'); return; }
    setBusy(true);
    const r = await submitQuiz(enrollment, item, answers);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setResult(r.result!);
  }

  function retry() { setAnswers({}); setResult(null); setErr(''); setRound((n) => n + 1); }

  if (result) {
    const reviewOf = (id: string) => result.review?.find((r) => r.question === id);
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div className={`alert ${result.passed ? 'info' : 'err'}`} role="status">
          <div>
            <b>{result.passed ? 'Lulus' : 'Belum lulus'}: nilai {result.score}%</b>
            <div>Nilai lulus {result.pass_percent}%. Percobaan ke-{result.attempt}{result.attempts_left !== null ? `, sisa ${result.attempts_left}` : ''}.</div>
            {!result.passed && result.escalated && <div>Batas percobaan habis. Atasan dan HC akan menindaklanjuti.</div>}
            {!result.passed && !result.escalated && result.next_retry_at && <div>Anda bisa mengulang setelah {new Date(result.next_retry_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}.</div>}
          </div>
        </div>
        {result.review && (
          <div style={{ display: 'grid', gap: 10 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>Tinjauan jawaban</h3>
            {questions.map((q, i) => {
              const r = reviewOf(q.id);
              return (
                <div key={q.id} className="glass card" style={{ padding: 14 }}>
                  <b>{i + 1}. {q.prompt}</b> <span className={`chip ${r?.right ? 'ok' : 'bad'}`}>{r?.right ? 'Benar' : 'Salah'}</span>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {q.options.map((o) => <li key={o.id} style={{ fontWeight: r?.correct.includes(o.id) ? 700 : 400 }}>{o.text}{r?.correct.includes(o.id) ? ' (jawaban benar)' : ''}{(answers[q.id] ?? []).includes(o.id) ? ' (pilihan Anda)' : ''}</li>)}
                  </ul>
                  {r?.explanation && <p className="muted" style={{ margin: '8px 0 0' }}>{r.explanation}</p>}
                </div>
              );
            })}
          </div>
        )}
        {!result.passed && result.attempts_left !== 0 && !result.escalated && (
          <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={retry} disabled={!!result.next_retry_at && new Date(result.next_retry_at) > new Date()}>Coba lagi</button>
        )}
      </div>
    );
  }

  if (left === 0) {
    return <div className="alert err">Batas percobaan untuk kuis ini sudah habis. Atasan dan HC akan menindaklanjuti.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p className="muted" style={{ margin: 0 }}>
        {title}. Nilai lulus {passPercent}%{maxAttempts !== null ? `. Percobaan ${attemptsUsed + 1} dari ${maxAttempts}` : '. Boleh mengulang sampai lulus'}.
      </p>
      {history.length > 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Riwayat: {history.map((h) => `#${h.no} ${h.score}%`).join(', ')}</p>}
      {waiting && <div className="alert info">Tunggu sampai {waiting.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} sebelum mencoba lagi.</div>}
      {view.map((q, i) => (
        <fieldset key={q.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', background: '#fff' }}>
          <legend style={{ fontWeight: 700, padding: '0 6px' }}>{i + 1}. {q.prompt}</legend>
          {q.multiple && <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>Pilih semua jawaban yang benar.</p>}
          {q.options.map((o) => (
            <label key={o.id} className="row" style={{ gap: 10, minHeight: 44, alignItems: 'center' }}>
              <input type={q.multiple ? 'checkbox' : 'radio'} name={q.id} checked={(answers[q.id] ?? []).includes(o.id)} onChange={() => toggle(q, o.id)} style={{ width: 22, height: 22 }} />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      ))}
      {err && <div className="alert err" role="alert">{err}</div>}
      <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={submit} disabled={busy || !!waiting}>{busy ? 'Menilai...' : 'Kirim jawaban'}</button>
    </div>
  );
}
