'use client';
import { useForm } from '@/components/use-form';
import { Notice } from '@/app/kelola/ui';
import { completeItem, selfEnroll, type St } from './actions';

export function EnrollForm({ course }: { course: string }) {
  const [st, onSubmit, pending] = useForm<St>(selfEnroll, {});
  return (
    <form method="post" onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
      <input type="hidden" name="course" value={course} />
      <button className="btn" type="submit" disabled={pending}>{pending ? 'Mendaftar...' : 'Daftar kursus ini'}</button>
      <Notice error={st.error} ok={st.ok} />
    </form>
  );
}

export function CompleteForm({ enrollment, item, label }: { enrollment: string; item: string; label: string }) {
  const [st, onSubmit, pending] = useForm<St>(completeItem, {});
  return (
    <form method="post" onSubmit={onSubmit} style={{ display: 'grid', gap: 8, marginTop: 16 }}>
      <input type="hidden" name="enrollment" value={enrollment} />
      <input type="hidden" name="item" value={item} />
      <button className="btn" type="submit" disabled={pending} style={{ justifySelf: 'start' }}>{pending ? 'Menyimpan...' : label}</button>
      <Notice error={st.error} ok={st.ok} />
    </form>
  );
}
