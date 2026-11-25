import { notFound, redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { AddCardForm } from '@/app/kelola/sop/forms';
import { DialogButton } from '../../Pop';
import { PlaybookAdmin } from '../../playbook-admin';

type PB = {
  id: string; name: string; description: string | null;
  libraries: { id: string; name: string; boards: { id: string; name: string } };
  cards: { id: string; title: string; position: number; status: string; current_version_id: string | null }[];
};

// Membuka playbook langsung membuka card pertama yang belum dibaca (atau card pertama), seperti Whale:
// daftar di kiri, isi di kanan. Tampilan dua panel ada di halaman card.
// Playbook yang masih kosong ditampilkan di sini agar admin bisa menambah card pertama.
export default async function SopPlaybook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getCtx();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data } = await supabase
    .from('playbooks')
    .select('id, name, description, libraries(id, name, boards(id, name)), cards(id, title, position, status, current_version_id)')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const pb = data as unknown as PB;

  const cards = pb.cards
    .filter((c) => c.status === 'published' || ctx.nav.editor)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

  if (cards.length > 0) {
    const { data: receipts } = await supabase.from('read_receipts').select('version_id').eq('profile_id', ctx.userId);
    const done = new Set((receipts ?? []).map((r) => r.version_id));
    const next = cards.find((c) => c.current_version_id && !done.has(c.current_version_id)) ?? cards[0]!;
    redirect(`/sop/c/${next.id}`);
  }

  const boardId = pb.libraries.boards.id;
  const { data: canEdit } = ctx.nav.editor ? await supabase.rpc('can_edit_board', { b: boardId }) : { data: false };
  const editing = canEdit === true;

  return (
    <Shell ctx={ctx} active="sop">
      <Crumbs items={[
        { label: `Semua ${terms.board.toLowerCase()}`, href: '/sop' },
        { label: pb.libraries.boards.name, href: `/sop/b/${boardId}` },
        { label: pb.name },
      ]} />
      <div className="row" style={{ gap: 4 }}>
        <h1 className="page-title">{pb.name}</h1>
        {editing && (
          <span className="menu-always" style={{ position: 'relative', display: 'inline-block', width: 40, height: 36 }}>
            <PlaybookAdmin ctx={ctx} terms={terms} id={pb.id} name={pb.name} description={pb.description} boardId={boardId} />
          </span>
        )}
      </div>
      <div className="glass card empty">
        <h2>Belum ada {terms.card.toLowerCase()} yang terbit</h2>
        <p className="sub">Isi {terms.playbook.toLowerCase()} ini akan tampil di sini setelah diterbitkan.</p>
        {editing && <div style={{ marginTop: 12 }}><DialogButton label={`${terms.card} baru`} title={`${terms.card} baru`}><AddCardForm playbook={pb.id} label={terms.card} /></DialogButton></div>}
      </div>
    </Shell>
  );
}
