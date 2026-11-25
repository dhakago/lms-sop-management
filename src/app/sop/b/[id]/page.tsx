import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { THEMES, type HoldingId } from '@/lib/theme';
import { LibraryForm, PlaybookForm, RemoveNodeForm } from '@/app/kelola/sop/forms';
import { loadBoardPerms, type BoardPerms } from '@/lib/perm';
import { Sortable } from '../../Sortable';
import { DialogButton, Menu, MenuDialog } from '../../Pop';
import { BoardMenu } from '../../board-menu';

// Keadaan awal untuk node baru: setiap holding yang dibuka board terbuka untuk semua pengguna.
const defaultNode = (parent: { holdings: { id: string; name: string; locked?: boolean }[] }, open?: string[]) =>
  parent.holdings.filter((h) => !open || open.includes(h.id)).map((h) => ({ id: h.id, name: h.name, all: true, rows: [], locked: h.locked }));

type Lib = { id: string; name: string; description: string | null; position: number; playbooks: { id: string; name: string; description: string | null; position: number; expert_id: string | null; review_interval: string; hidden: boolean; cards: { count: number }[] }[] };

export default async function SopBoard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getCtx();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data: board } = await supabase.from('boards').select('id, name, description, owner_label, archived').eq('id', id).maybeSingle();
  if (!board) notFound();
  const { data } = await supabase
    .from('libraries')
    .select('id, name, description, position, playbooks(id, name, description, position, expert_id, review_interval, hidden, cards(count))')
    .eq('board_id', id)
    .order('position')
    .order('name');
  const libs = (data ?? []) as unknown as Lib[];

  const { data: bh } = await supabase.from('board_holdings').select('holding_id').eq('board_id', id);
  const boardHoldings = (bh ?? []).map((h) => h.holding_id as HoldingId);
  const shown = boardHoldings.filter((h) => h !== 'people'); // PEOPLE selalu ikut, tidak disebut
  const mine = holdingsWith(ctx, 'sop');
  const isEditor = ctx.nav.editor;
  const editable = isEditor && boardHoldings.length > 0 && shown.every((h) => mine.includes(h));
  const editing = editable;
  const inPeople = ctx.holding === 'people';
  const L = terms.library, P = terms.playbook;
  const perms: BoardPerms | null = editing
    ? await loadBoardPerms(ctx, id, { board: terms.board, library: L, playbook: P }, libs.map((l) => l.id), libs.flatMap((l) => l.playbooks.map((p) => p.id)))
    : null;

  return (
    <Shell ctx={ctx} active="sop">
      <Crumbs items={[{ label: `Semua ${terms.board.toLowerCase()}`, href: '/sop' }, { label: board.name }]} />
      <header className="row between">
        <div>
          <div className="row" style={{ gap: 4 }}>
            <h1 className="page-title">{board.name}</h1>
            {editing && (
              <span className="menu-always" style={{ position: 'relative', display: 'inline-block', width: 40, height: 36 }}>
                <BoardMenu id={board.id} name={board.name} description={board.description} owner={board.owner_label} archived={board.archived}
                  boardLabel={terms.board} ctx={ctx} perm={perms ? { init: perms.board, options: perms.options.board } : undefined} />
              </span>
            )}
          </div>
          {board.description && <p className="sub">{board.description}</p>}
          <p className="muted" style={{ marginTop: 4 }}>
            Dibuka untuk {shown.length === 0 ? 'PEOPLE saja' : shown.map((h) => THEMES[h].name).join(', ')}
            {board.owner_label ? `. Pemilik proses: ${board.owner_label}` : ''}
          </p>
        </div>
        {board.archived && <span className="chip grey">Diarsipkan</span>}
      </header>

      {isEditor && !editable && (
        <div className="alert info">{terms.board} ini juga dibuka untuk holding yang akses SOP-nya tidak Anda miliki, jadi hanya bisa dilihat. Minta superadmin menambah akses atau mengubahnya.</div>
      )}

      {libs.length === 0 && !editing ? (
        <div className="glass card empty">
          <h2>Belum ada {L.toLowerCase()}</h2>
          <p className="sub">{terms.board} ini belum berisi apa pun.</p>
        </div>
      ) : (
        // Library berjajar ke samping seperti kolom papan. Di layar sempit bisa digeser.
        (() => {
          const colOf = (l: Lib) => {
            const pbs = [...l.playbooks].sort((x, y) => x.position - y.position || x.name.localeCompare(y.name));
            const pbCard = (p: Lib['playbooks'][number]) => (
              <div className="has-menu pb-wrap">
                <Link href={`/sop/p/${p.id}`} className="pb-card">
                  <b>{p.name}{p.hidden && <span className="chip grey" style={{ marginLeft: 8 }}>Disembunyikan</span>}</b>
                  {p.description && <span className="muted">{p.description}</span>}
                  <span className="meta">{terms.card}: {p.cards[0]?.count ?? 0}</span>
                </Link>
                {editing && (
                  <Menu label={`Menu ${P.toLowerCase()}`}>
                    <MenuDialog label="Ubah" title={`Ubah ${P.toLowerCase()}`}>
                      <PlaybookForm id={p.id} name={p.name} description={p.description ?? ''} label={P} expert={p.expert_id} interval={p.review_interval} published={!p.hidden}
                        admins={perms!.options.playbook.admins} perm={{ init: perms!.playbooks[p.id]!, options: perms!.options.playbook }} />
                    </MenuDialog>
                    <MenuDialog label="Hapus" title={`Hapus ${P.toLowerCase()}`} danger><RemoveNodeForm kind="playbook" id={p.id} what={P.toLowerCase()} /></MenuDialog>
                  </Menu>
                )}
              </div>
            );
            return (
              <section className="lib-col" aria-labelledby={`l-${l.id}`}>
                <div className="lib-col-head has-menu">
                  <h2 id={`l-${l.id}`}>{l.name}</h2>
                  {editing && (
                    <Menu label={`Menu ${L.toLowerCase()}`}>
                      <MenuDialog label="Ubah" title={`Ubah ${L.toLowerCase()}`}>
                        <LibraryForm id={l.id} name={l.name} description={l.description ?? ''} label={L} perm={{ init: perms!.libraries[l.id]!, options: perms!.options.library }} />
                      </MenuDialog>
                      <MenuDialog label="Hapus" title={`Hapus ${L.toLowerCase()}`} danger><RemoveNodeForm kind="library" id={l.id} what={L.toLowerCase()} /></MenuDialog>
                    </Menu>
                  )}
                </div>
                {l.description && <p className="muted" style={{ margin: 0 }}>{l.description}</p>}
                {editing && pbs.length > 0 ? (
                  <Sortable kind="playbook" label={`Urutan ${P.toLowerCase()} di ${l.name}`} className="sortable-col" items={pbs.map((p) => ({ id: p.id, node: pbCard(p) }))} />
                ) : (
                  pbs.map((p) => <div key={p.id}>{pbCard(p)}</div>)
                )}
                {l.playbooks.length === 0 && !editing && <p className="muted" style={{ margin: 0 }}>Belum ada {P.toLowerCase()}.</p>}
                {editing && (
                  <DialogButton label={`${P} baru`} title={`${P} baru`}>
                    <PlaybookForm library={l.id} label={P} expert={ctx.userId} admins={perms!.options.playbook.admins}
                      perm={{ init: { holdings: defaultNode(perms!.libraries[l.id]!), writers: [] }, options: perms!.options.playbook }} />
                  </DialogButton>
                )}
              </section>
            );
          };
          // Library berjajar ke samping seperti kolom papan. Admin menarik gagang ke kanan atau kiri untuk memindahkannya.
          return editing ? (
            <div className="lib-cols">
              {libs.length > 0 && (
                <Sortable kind="library" axis="x" label={`Urutan ${L.toLowerCase()}`} className="lib-cols" style={{ overflow: 'visible', padding: 0, flex: 'none' }} items={libs.map((l) => ({ id: l.id, node: colOf(l) }))} />
              )}
              <div className="lib-new">
                <DialogButton label={`${L} baru`} title={`${L} baru`} className="pill ghost">
                  <LibraryForm board={board.id} label={L} perm={{ init: { holdings: defaultNode(perms!.board, boardHoldings), writers: [] }, options: perms!.options.library }} />
                </DialogButton>
              </div>
            </div>
          ) : (
            <div className="lib-cols">{libs.map((l) => <div key={l.id} className="sortable-item x"><div className="sortable-body">{colOf(l)}</div></div>)}</div>
          );
        })()
      )}

    </Shell>
  );
}
