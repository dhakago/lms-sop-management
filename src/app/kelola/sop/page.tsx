import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { THEMES, type HoldingId } from '@/lib/theme';

export const metadata = { title: 'Editor SOP' };

type B = { id: string; name: string; owner_label: string | null; archived: boolean; libraries: { count: number }[]; board_holdings: { holding_id: HoldingId }[] };

export default async function EditorSop() {
  const ctx = await getCtx();
  const mine = holdingsWith(ctx, 'sop');
  if (mine.length === 0) notFound();
  const terms = await getTerms();
  const supabase = await createClient();
  const { data } = await supabase
    .from('boards')
    .select('id, name, owner_label, archived, libraries(count), board_holdings(holding_id)')
    .order('archived')
    .order('position')
    .order('name');
  const boards = ((data ?? []) as unknown as B[]).filter((b) => b.board_holdings.some((h) => mine.includes(h.holding_id)));

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Editor SOP' }]} />
      <div className="row between">
        <h1 className="page-title">Editor SOP</h1>
        <Link className="btn" href="/kelola/sop/baru">Buat {terms.board.toLowerCase()}</Link>
      </div>
      {boards.length === 0 ? (
        <div className="glass card empty">
          <h2>Belum ada {terms.board.toLowerCase()}</h2>
          <p className="sub">Buat {terms.board.toLowerCase()} pertama untuk mulai menulis SOP.</p>
        </div>
      ) : (
        <section className="glass card">
          <div className="list">
            {boards.map((b) => {
              const editable = b.board_holdings.every((h) => mine.includes(h.holding_id));
              return (
                <Link key={b.id} href={`/kelola/sop/b/${b.id}`} className="list-row">
                  <div className="grow">
                    <b>{b.name}</b>
                    <span className="muted">
                      {b.libraries[0]?.count ?? 0} {terms.library.toLowerCase()}. Dibuka untuk {b.board_holdings.map((h) => THEMES[h.holding_id].name).join(', ')}
                      {b.owner_label ? `. Pemilik proses: ${b.owner_label}` : ''}
                    </span>
                  </div>
                  {b.archived && <span className="chip grey">Diarsipkan</span>}
                  {!editable && <span className="chip warn">Hanya lihat</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </Shell>
  );
}
