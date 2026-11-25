'use client';
import { useForm } from '@/components/use-form';
import { Notice } from '../kelola/ui';
import { saveTerms, type TermsState } from './actions';

type Terms = { board: string; library: string; playbook: string; card: string };

export function TermsForm({ terms }: { terms: Terms }) {
  const [s, action, pending] = useForm<TermsState>(saveTerms, {});
  const f = (k: keyof Terms, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input className="input" name={k} defaultValue={terms[k]} maxLength={32} />
    </label>
  );
  return (
    <form onSubmit={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice error={s.error} ok={s.ok} />
      {f('board', 'Tingkat 1 (bawaan: Board)')}
      {f('library', 'Tingkat 2 (bawaan: Library)')}
      {f('playbook', 'Tingkat 3 (bawaan: Playbook)')}
      {f('card', 'Tingkat 4, isi yang dibaca (bawaan: Card)')}
      <button className="btn" type="submit" disabled={pending} style={{ alignSelf: 'flex-start', minHeight: 48 }}>{pending ? 'Menyimpan...' : 'Simpan istilah'}</button>
    </form>
  );
}
