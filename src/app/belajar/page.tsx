import { Shell } from '@/components/Shell';
import { getCtx } from '@/lib/session';

export const metadata = { title: 'Pembelajaran' };

export default async function Belajar() {
  const ctx = await getCtx();
  return (
    <Shell ctx={ctx} active="belajar">
      <h1 className="page-title">Pembelajaran</h1>
      <div className="glass card empty">
        <h2>Kursus segera hadir</h2>
        <p className="sub">Kursus, kuis, dan sertifikat dibuka pada tahap berikutnya. Sementara itu, baca SOP wajib di menu SOP dan prosedur.</p>
      </div>
    </Shell>
  );
}
