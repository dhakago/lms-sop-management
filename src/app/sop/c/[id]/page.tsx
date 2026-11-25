import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { RichText } from '@/components/RichText';
import { Icon } from '@/components/Icon';
import { getCtx, getTerms } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { assignedReq, fmtDate, getMyGroupIds, type Req } from '@/lib/sop';
import { markRead } from './actions';
import { DialogButton, Menu, MenuDialog, PencilIcon } from '../../Pop';
import { PlaybookAdmin } from '../../playbook-admin';
import { AddCardForm, RemoveCardForm } from '@/app/kelola/sop/forms';
import { Sortable } from '../../Sortable';
import { CardEditor } from '@/app/kelola/sop/c/[id]/editor';

type CardRow = {
  id: string; title: string; status: string; draft_content: unknown; current_version_id: string | null;
  playbooks: {
    id: string; name: string; description: string | null;
    libraries: { id: string; name: string; boards: { id: string; name: string } };
    cards: { id: string; title: string; position: number; status: string; current_version_id: string | null }[];
    playbook_requirements: Req[];
  };
};

// Tata letak dua panel seperti Whale: daftar card di kiri, isi yang sedang dibaca di kanan.
export default async function SopCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ubah?: string }> }) {
  const { id } = await params;
  const { ubah } = await searchParams;
  const ctx = await getCtx();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data } = await supabase
    .from('cards')
    .select('id, title, status, draft_content, current_version_id, playbooks(id, name, description, libraries(id, name, boards(id, name)), cards(id, title, position, status, current_version_id), playbook_requirements(holding_id, due_on, unit, target_type, group_id, profile_id))')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const card = data as unknown as CardRow;
  const pb = card.playbooks;

  // Mode ubah: sama dengan tampilan baca, ditambah tombol ubah. Hak ubah tetap dijaga database (can_edit_board).
  const { data: canEdit } = ctx.nav.editor ? await supabase.rpc('can_edit_board', { b: pb.libraries.boards.id }) : { data: false };
  const editable = canEdit === true;
  const editing = editable;
  const writing = editing && ubah === '1'; // editor isi card terbuka di panel kanan


  const list = pb.cards
    .filter((c) => c.status === 'published' || editing)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  const idx = Math.max(0, list.findIndex((c) => c.id === card.id));
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx < list.length - 1 ? list[idx + 1] : null;

  const { data: ver } = card.current_version_id
    ? await supabase.from('card_versions').select('id, version, title, content, change, published_at').eq('id', card.current_version_id).maybeSingle()
    : { data: null };
  const { data: receipts } = await supabase.from('read_receipts').select('card_id, version_id, read_at').eq('profile_id', ctx.userId);
  const readVersions = new Set((receipts ?? []).map((r) => r.version_id));
  const readCards = new Set((receipts ?? []).map((r) => r.card_id));
  const mine = ver ? (receipts ?? []).find((r) => r.version_id === ver.id) : undefined;
  const publishedList = list.filter((c) => c.status === 'published');
  const readCount = publishedList.filter((c) => c.current_version_id && readVersions.has(c.current_version_id)).length;
  const req = assignedReq(ctx, pb.playbook_requirements, await getMyGroupIds(ctx.userId)); // null bila tidak ditugaskan: hanya membaca

  // Hanya anggota holding board yang bisa menandai dibaca. Admin yang meninjau tidak perlu.
  const { data: board } = await supabase.from('board_holdings').select('holding_id').eq('board_id', pb.libraries.boards.id);
  const canRead = !!req && ctx.memberships.some((m) => (board ?? []).some((b) => b.holding_id === m.holding_id));

  // Menulis card: editor satu halaman seperti Whale, tanpa panel daftar di kiri.
  if (writing) {
    return (
      <Shell ctx={ctx} active="sop">
        <CardEditor
          id={card.id} title={card.title} doc={card.draft_content} published={!!card.current_version_id} version={ver?.version ?? null}
          backHref={`/sop/c/${card.id}`}
          crumbs={[{ label: pb.libraries.boards.name }, { label: pb.libraries.name }, { label: pb.name }, { label: card.title }]}
        />
      </Shell>
    );
  }

  return (
    <Shell ctx={ctx} active="sop">
      <Crumbs items={[
        { label: `Semua ${terms.board.toLowerCase()}`, href: '/sop' },
        { label: pb.libraries.boards.name, href: `/sop/b/${pb.libraries.boards.id}` },
        { label: pb.libraries.name, href: `/sop/b/${pb.libraries.boards.id}` },
        { label: pb.name },
      ]} />

      <div className="reader">
        <aside className="reader-list" aria-label={`Daftar ${terms.card.toLowerCase()}`}>
          <div className="reader-title has-menu">
            <h2 style={{ flex: 1 }}>{pb.name}</h2>
            {editing && <PlaybookAdmin ctx={ctx} terms={terms} id={pb.id} name={pb.name} description={pb.description} boardId={pb.libraries.boards.id} />}
          </div>
          {pb.description && <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{pb.description}</p>}
          <div className="row" style={{ margin: '10px 0 12px', gap: 8 }}>
            {req && <span className="chip grey">{readCount} dari {publishedList.length} dibaca</span>}
            {req && <span className={`chip ${readCount >= publishedList.length ? 'ok' : 'warn'}`}>Ditugaskan, batas {fmtDate(req.due_on)}</span>}
          </div>
          <nav>
            {(() => {
              const row = (c: (typeof list)[number], i: number) => {
                const read = !!req && !!c.current_version_id && readVersions.has(c.current_version_id);
                const again = !!req && !read && readCards.has(c.id);
                return (
                  <div className="has-menu row-wrap">
                    <Link href={`/sop/c/${c.id}`} className="reader-item" aria-current={c.id === card.id ? 'page' : undefined}>
                      <span className="num">{i + 1}</span>
                      <span className="grow">{c.title}</span>
                      {c.status === 'draft' ? <span className="chip warn">Draf</span> : read ? <span className="chip ok" aria-label="Sudah dibaca"><Icon name="check" size={13} sw={2.6} /></span> : again ? <span className="chip warn">Ulang</span> : null}
                    </Link>
                    {editing && c.status === 'draft' && !c.current_version_id && (
                      <Menu label={`Menu ${terms.card.toLowerCase()}`}>
                        <MenuDialog label="Hapus draf" title="Hapus draf" danger><RemoveCardForm id={c.id} /></MenuDialog>
                      </Menu>
                    )}
                  </div>
                );
              };
              return editing && list.length > 0 ? (
                <Sortable kind="card" label={`Urutan ${terms.card.toLowerCase()}`} className="sortable-col" items={list.map((c, i) => ({ id: c.id, node: row(c, i) }))} />
              ) : (
                list.map((c, i) => <div key={c.id}>{row(c, i)}</div>)
              );
            })()}
            {list.length === 0 && <p className="muted">Belum ada {terms.card.toLowerCase()}.</p>}
          </nav>
          {editing && (
            <div style={{ marginTop: 14 }}>
              <DialogButton label={`${terms.card} baru`} title={`${terms.card} baru`}><AddCardForm playbook={pb.id} label={terms.card} /></DialogButton>
            </div>
          )}
        </aside>

        <article className="reader-pane">
          {editing && <Link className="edit-fab" href={`/sop/c/${card.id}?ubah=1`} aria-label={`Ubah ${terms.card.toLowerCase()}`} title={`Ubah ${terms.card.toLowerCase()}`}><PencilIcon /></Link>}
          <header>
            <div className="row" style={{ marginBottom: 8 }}>
              {card.status === 'draft' && <span className="chip warn">Draf, belum terbit</span>}
              {ver && (editing
                ? <Link className="chip grey" href={`/sop/c/${card.id}/riwayat`} title="Lihat riwayat versi">Versi {ver.version}, diterbitkan {fmtDate(ver.published_at)}</Link>
                : <span className="chip grey">Versi {ver.version}, diterbitkan {fmtDate(ver.published_at)}</span>)}
            </div>
            <h1 className="page-title" style={{ fontSize: 'clamp(24px, 3vw, 32px)' }}>{ver?.title ?? card.title}</h1>
          </header>
          <div className="reader-body">
            {ver ? <RichText doc={ver.content} /> : <p className="muted">{terms.card} ini belum diterbitkan.</p>}
          </div>
          <footer className="reader-foot">
            {ver && canRead && (mine ? (
              <span className="chip ok"><Icon name="check" size={14} sw={2.4} /> Sudah dibaca {fmtDate(mine.read_at)}</span>
            ) : (
              <form action={markRead}>
                <input type="hidden" name="card" value={card.id} />
                <button className="btn" type="submit"><Icon name="check" size={18} sw={2.2} /> Sudah saya baca</button>
              </form>
            ))}
            <span className="grow" />
            <div className="reader-nav" aria-label="Pindah card">
              {prev ? <Link className="btn sec" href={`/sop/c/${prev.id}`}>Sebelumnya</Link> : <span className="btn sec" aria-disabled="true" style={{ opacity: 0.4 }}>Sebelumnya</span>}
              <span className="muted">{idx + 1} / {list.length}</span>
              {next ? <Link className="btn sec" href={`/sop/c/${next.id}`}>Berikutnya</Link> : <span className="btn sec" aria-disabled="true" style={{ opacity: 0.4 }}>Berikutnya</span>}
            </div>
          </footer>
        </article>
      </div>
    </Shell>
  );
}
