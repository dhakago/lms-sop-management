import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { isSuper } from '@/lib/authz';
import { TermsForm } from './form';

export const metadata = { title: 'Pengaturan' };

export default async function Pengaturan() {
  const ctx = await getCtx();
  if (!isSuper(ctx)) notFound();
  const terms = await getTerms();
  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Pengaturan' }]} />
      <h1 className="page-title">Pengaturan</h1>
      <section className="glass card" style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Istilah SOP</h2>
        <p className="muted" style={{ margin: '0 0 14px' }}>Nama untuk empat tingkat SOP. Berlaku untuk semua holding. Kosongkan untuk kembali ke istilah bawaan.</p>
        <TermsForm terms={terms} />
      </section>
    </Shell>
  );
}
