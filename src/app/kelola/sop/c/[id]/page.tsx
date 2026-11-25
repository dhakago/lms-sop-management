import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { CardEditor } from './editor';

export const metadata = { title: 'Tulis card' };

type C = {
  id: string; title: string; status: string; draft_content: unknown; current_version_id: string | null;
  playbooks: { id: string; name: string; libraries: { id: string; name: string; boards: { id: string; name: string } } };
};

export default async function EditCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'sop').length === 0 || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data } = await supabase
    .from('cards')
    .select('id, title, status, draft_content, current_version_id, playbooks(id, name, libraries(id, name, boards(id, name)))')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const card = data as unknown as C;
  const pb = card.playbooks;
  const boardId = pb.libraries.boards.id;

  const { data: canEdit } = await supabase.rpc('can_edit_board', { b: boardId });
  if (canEdit !== true) notFound();
  const { data: ver } = card.current_version_id ? await supabase.from('card_versions').select('version').eq('id', card.current_version_id).maybeSingle() : { data: null };

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[
        { label: 'Kelola', href: '/kelola' },
        { label: 'Editor SOP', href: '/kelola/sop' },
        { label: pb.libraries.boards.name, href: `/kelola/sop/b/${boardId}` },
        { label: pb.name, href: `/kelola/sop/p/${pb.id}` },
        { label: card.title },
      ]} />
      <div className="row between">
        <h1 className="page-title">Tulis {terms.card.toLowerCase()}</h1>
        <div className="row">
          <span className={`chip ${card.status === 'published' ? 'ok' : 'warn'}`}>{card.status === 'published' ? `Terbit, versi ${ver?.version ?? '-'}` : 'Draf'}</span>
          {card.current_version_id && <Link className="btn sec" href={`/kelola/sop/c/${card.id}/riwayat`}>Riwayat versi</Link>}
          {card.current_version_id && <Link className="btn sec" href={`/sop/c/${card.id}`}>Lihat versi terbit</Link>}
        </div>
      </div>
      <section className="glass card" style={{ maxWidth: 860 }}>
        <CardEditor id={card.id} title={card.title} doc={card.draft_content} published={!!card.current_version_id} version={ver?.version ?? null} />
      </section>
    </Shell>
  );
}
