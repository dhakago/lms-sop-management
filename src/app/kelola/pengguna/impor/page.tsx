import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { ImportForm } from './form';

export const metadata = { title: 'Impor pengguna' };

export default async function Impor() {
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'pengguna').length === 0) notFound();
  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Pengguna', href: '/kelola/pengguna' }, { label: 'Impor CSV' }]} />
      <h1 className="page-title">Impor pengguna</h1>
      <section className="glass card">
        <ImportForm />
      </section>
    </Shell>
  );
}
