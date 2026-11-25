import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { THEMES } from '@/lib/theme';
import { BoardForm } from '../forms';

export const metadata = { title: 'Buat board' };

export default async function BaruBoard() {
  const ctx = await getCtx();
  const mine = holdingsWith(ctx, 'sop');
  if (mine.length === 0) notFound();
  const terms = await getTerms();
  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Editor SOP', href: '/kelola/sop' }, { label: `Buat ${terms.board.toLowerCase()}` }]} />
      <h1 className="page-title">Buat {terms.board.toLowerCase()}</h1>
      <section className="glass card" style={{ maxWidth: 560 }}>
        <BoardForm holdings={mine.map((h) => ({ id: h, name: THEMES[h].name }))} checked={mine.includes(ctx.holding) ? [ctx.holding] : []} labels={{ board: terms.board }} />
      </section>
    </Shell>
  );
}
