import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { RichText } from '@/components/RichText';
import { Icon } from '@/components/Icon';
import { getCtx, getTerms } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/sop';
import Link from 'next/link';
import { markRead } from './actions';

type CardRow = {
  id: string; title: string; status: string; current_version_id: string | null;
  playbooks: { id: string; name: string; libraries: { id: string; name: string; boards: { id: string; name: string } } };
};

export default async function SopCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data } = await supabase
    .from('cards')
    .select('id, title, status, current_version_id, playbooks(id, name, libraries(id, name, boards(id, name)))')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const card = data as unknown as CardRow;
  const pb = card.playbooks;

  const { data: ver } = card.current_version_id
    ? await supabase.from('card_versions').select('id, version, title, content, change, published_at').eq('id', card.current_version_id).maybeSingle()
    : { data: null };
  const { data: mine } = ver
    ? await supabase.from('read_receipts').select('read_at').eq('profile_id', ctx.userId).eq('version_id', ver.id).maybeSingle()
    : { data: null };
  // Hanya anggota holding board yang bisa menandai dibaca. Admin yang meninjau tidak perlu.
  const { data: board } = await supabase.from('board_holdings').select('holding_id').eq('board_id', pb.libraries.boards.id);
  const canRead = ctx.memberships.some((m) => (board ?? []).some((b) => b.holding_id === m.holding_id));

  return (
    <Shell ctx={ctx} active="sop">
      <Crumbs items={[
        { label: `Semua ${terms.board.toLowerCase()}`, href: '/sop' },
        { label: pb.libraries.boards.name, href: `/sop/b/${pb.libraries.boards.id}` },
        { label: pb.libraries.name, href: `/sop/b/${pb.libraries.boards.id}` },
        { label: pb.name, href: `/sop/p/${pb.id}` },
        { label: card.title },
      ]} />
      <article className="glass card" style={{ padding: 'clamp(20px, 4vw, 36px)' }}>
        <header style={{ marginBottom: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            {card.status === 'draft' && <span className="chip warn">Draf, belum terbit</span>}
            {ver && <span className="chip grey">Versi {ver.version}, diterbitkan {fmtDate(ver.published_at)}</span>}
            {ctx.nav.editor && <Link className="btn sec" href={`/kelola/sop/c/${card.id}`} style={{ minHeight: 32 }}>Ubah di editor</Link>}
          </div>
          <h1 className="page-title">{ver?.title ?? card.title}</h1>
        </header>
        {ver ? <RichText doc={ver.content} /> : <p className="muted">Card ini belum diterbitkan.</p>}
        {ver && canRead && (
          <footer style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
            {mine ? (
              <div className="row"><span className="chip ok"><Icon name="check" size={14} sw={2.4} /> Sudah dibaca {fmtDate(mine.read_at)}</span></div>
            ) : (
              <form action={markRead}>
                <input type="hidden" name="card" value={card.id} />
                <button className="btn" type="submit"><Icon name="check" size={18} sw={2.2} /> Sudah saya baca</button>
              </form>
            )}
          </footer>
        )}
      </article>
    </Shell>
  );
}
