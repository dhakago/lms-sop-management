import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { THEMES, type HoldingId } from '@/lib/theme';
import { defaultState, permOptions } from '@/lib/perm';
import { BoardForm } from '@/app/kelola/sop/forms';

export const metadata = { title: 'Buat board' };

export default async function BaruBoard() {
  const ctx = await getCtx();
  const mine = holdingsWith(ctx, 'sop');
  if (mine.length === 0) notFound();
  const terms = await getTerms();
  const inPeople = ctx.holding === 'people';
  const others = mine.filter((h) => h !== 'people');
  const allowed = inPeople ? others.length > 0 : mine.includes(ctx.holding);

  return (
    <Shell ctx={ctx} active="sop">
      <Crumbs items={[{ label: `Semua ${terms.board.toLowerCase()}`, href: '/sop' }, { label: `Buat ${terms.board.toLowerCase()}` }]} />
      <h1 className="page-title">Buat {terms.board.toLowerCase()}</h1>
      <section className="glass card" style={{ maxWidth: 560 }}>
        {allowed ? (
          <BoardForm labels={{ board: terms.board }} perm={{ init: defaultState(ctx, others as HoldingId[]), options: await permOptions(ctx, 'board', terms.board, others as HoldingId[]) }} />
        ) : (
          <div className="alert info">Anda belum punya akses SOP untuk {THEMES[ctx.holding].name}. Pindah ke holding lain lewat menu profil, atau minta superadmin memberi akses.</div>
        )}
      </section>
    </Shell>
  );
}
