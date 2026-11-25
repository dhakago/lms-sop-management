import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { getCtx, getTerms } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { THEMES, type HoldingId } from '@/lib/theme';
import { holdingsWith } from '@/lib/authz';
import { BoardMenu } from './board-menu';

export const metadata = { title: 'SOP dan prosedur' };

type BoardRow = { id: string; archived: boolean; name: string; description: string | null; owner_label: string | null; libraries: { count: number }[]; board_holdings: { holding_id: string }[] };

// PEOPLE selalu ikut di setiap board, jadi tidak disebut. Tiga holding lain semua berarti "Semua holding".
function openFor(hs: { holding_id: string }[]) {
  const others = hs.map((h) => h.holding_id).filter((h) => h !== 'people');
  if (others.length >= 3) return 'Semua holding';
  if (others.length === 0) return 'PEOPLE';
  return others.map((h) => THEMES[h as HoldingId]?.name.replace(' Group', '') ?? h).join(', ');
}

export default async function SopBoards() {
  const ctx = await getCtx();
  const terms = await getTerms();
  const mine = holdingsWith(ctx, 'sop');
  const isEditor = ctx.nav.editor;
  const supabase = await createClient();

  // Hanya board yang dibuka untuk holding aktif. Database tetap menolak yang tidak berhak.
  const { data: ids } = await supabase.from('board_holdings').select('board_id').eq('holding_id', ctx.holding);
  const boardIds = (ids ?? []).map((r) => r.board_id);
  const { data } = boardIds.length
    ? await supabase
        .from('boards')
        .select('id, archived, name, description, owner_label, libraries(count), board_holdings(holding_id)')
        .in('id', boardIds)
        .order('archived')
        .order('position')
        .order('name')
    : { data: [] as BoardRow[] };
  // Board yang diarsipkan hanya tampil untuk admin (mode ubah).
  const boards = ((data ?? []) as unknown as BoardRow[]).filter((b) => isEditor || !b.archived);

  return (
    <Shell ctx={ctx} active="sop">
      <header className="row between">
        <div>
          <h1 className="page-title">SOP dan prosedur</h1>
          <p className="sub">Semua prosedur kerja resmi {ctx.theme.name}, dikelompokkan dalam {terms.board.toLowerCase()}.</p>
        </div>
        {isEditor && <Link className="btn" href="/sop/baru">Buat {terms.board.toLowerCase()}</Link>}
      </header>
      {boards.length === 0 ? (
        <div className="glass card empty">
          <Icon name="sop" size={34} />
          <h2 style={{ marginTop: 12 }}>Belum ada {terms.board.toLowerCase()}</h2>
          <p className="sub">Belum ada SOP yang dibuka untuk {ctx.theme.name}. Hubungi HRBP jika Anda merasa seharusnya ada.</p>
        </div>
      ) : (
        <div className="grid">
          {boards.map((b) => {
            const bhs = b.board_holdings.map((h) => h.holding_id as HoldingId);
            const others = bhs.filter((h) => h !== 'people');
            const editable = isEditor && bhs.length > 0 && others.every((h) => mine.includes(h));
            return (
              <div key={b.id} className="has-menu board-tile-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
                <Link href={`/sop/b/${b.id}`} className="glass board-tile" style={{ flex: 1 }}>
                  <div className="band" aria-hidden="true"><Icon name="sop" size={34} sw={1.6} /></div>
                  <div className="body">
                    <h3>{b.name}{b.archived && <span className="chip grey" style={{ marginLeft: 8 }}>Diarsipkan</span>}</h3>
                    <div className="muted" style={{ marginTop: 4 }}>{b.libraries[0]?.count ?? 0} {terms.library.toLowerCase()}</div>
                    {b.owner_label && <div className="muted">Pemilik proses: {b.owner_label}</div>}
                    <div className="muted">Dibuka untuk: {openFor(b.board_holdings)}</div>
                  </div>
                </Link>
                {editable && (
                  <BoardMenu id={b.id} name={b.name} description={b.description} owner={b.owner_label} archived={b.archived} boardLabel={terms.board} ctx={ctx} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
