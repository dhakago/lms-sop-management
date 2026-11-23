import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { getCtx, getTerms } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Crumbs } from '@/components/Crumbs';

type Lib = { id: string; name: string; description: string | null; position: number; playbooks: { id: string; name: string; description: string | null; position: number; cards: { count: number }[] }[] };

export default async function SopBoard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data: board } = await supabase.from('boards').select('id, name, description, owner_label').eq('id', id).maybeSingle();
  if (!board) notFound();
  const { data } = await supabase
    .from('libraries')
    .select('id, name, description, position, playbooks(id, name, description, position, cards(count))')
    .eq('board_id', id)
    .order('position')
    .order('name');
  const libs = (data ?? []) as unknown as Lib[];

  return (
    <Shell ctx={ctx} active="sop">
      <Crumbs items={[{ label: `Semua ${terms.board.toLowerCase()}`, href: '/sop' }, { label: board.name }]} />
      <header>
        <h1 className="page-title">{board.name}</h1>
        {board.description && <p className="sub">{board.description}</p>}
        {board.owner_label && <p className="muted" style={{ marginTop: 4 }}>Pemilik proses: {board.owner_label}</p>}
      </header>
      {libs.length === 0 ? (
        <div className="glass card empty">
          <h2>Belum ada {terms.library.toLowerCase()}</h2>
          <p className="sub">{terms.board} ini belum berisi apa pun.</p>
        </div>
      ) : (
        libs.map((l) => (
          <section key={l.id} className="glass card" aria-labelledby={`l-${l.id}`}>
            <h2 id={`l-${l.id}`} style={{ fontSize: 20 }}>{l.name}</h2>
            {l.description && <p className="muted" style={{ marginTop: 4 }}>{l.description}</p>}
            <div className="list" style={{ marginTop: 6 }}>
              {[...l.playbooks].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)).map((p) => (
                <Link key={p.id} href={`/sop/p/${p.id}`} className="list-row">
                  <span className="grow">
                    <b>{p.name}</b>
                    {p.description && <span className="muted">{p.description}</span>}
                  </span>
                  <span className="chip grey">{p.cards[0]?.count ?? 0} {terms.card.toLowerCase()}</span>
                </Link>
              ))}
              {l.playbooks.length === 0 && <p className="muted" style={{ padding: '14px 0' }}>Belum ada {terms.playbook.toLowerCase()}.</p>}
            </div>
          </section>
        ))
      )}
    </Shell>
  );
}
