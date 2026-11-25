import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { THEMES, type HoldingId } from '@/lib/theme';
import { NewUserForm } from './form';

export const metadata = { title: 'Tambah pengguna' };

export default async function Baru({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const ctx = await getCtx();
  const allowed = holdingsWith(ctx, 'pengguna');
  if (allowed.length === 0) notFound();
  const { h } = await searchParams;
  const initial = allowed.includes(h as HoldingId) ? (h as HoldingId) : allowed.includes(ctx.holding) ? ctx.holding : allowed[0]!;
  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Pengguna', href: '/kelola/pengguna' }, { label: 'Tambah' }]} />
      <h1 className="page-title">Tambah pengguna</h1>
      <section className="glass card" style={{ maxWidth: 560 }}>
        <NewUserForm holdings={allowed.map((x) => ({ id: x, name: THEMES[x].name }))} initial={initial} />
      </section>
    </Shell>
  );
}
