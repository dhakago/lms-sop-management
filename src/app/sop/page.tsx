import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { getCtx, getTerms } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { THEMES, type HoldingId } from '@/lib/theme';

export const metadata = { title: 'SOP dan prosedur' };

type BoardRow = { id: string; name: string; description: string | null; owner_label: string | null; libraries: { count: number }[]; board_holdings: { holding_id: string }[] };

export default async function SopBoards() {
  const ctx = await getCtx();
  const terms = await getTerms();
  const supabase = await createClient();

  // Hanya board yang dibuka untuk holding aktif. Database tetap menolak yang tidak berhak.
  const { data: ids } = await supabase.from('board_holdings').select('board_id').eq('holding_id', ctx.holding);
  const boardIds = (ids ?? []).map((r) => r.board_id);
  const { data } = boardIds.length
    ? await supabase
        .from('boards')
        .select('id, name, description, owner_label, libraries(count), board_holdings(holding_id)')
        .in('id', boardIds)
        .eq('archived', false)
        .order('position')
        .order('name')
    : { data: [] as BoardRow[] };
  const boards = (data ?? []) as unknown as BoardRow[];

  return (
    <Shell ctx={ctx} active="sop">
      <header className="row between">
        <div>
          <h1 className="page-title">SOP dan prosedur</h1>
          <p className="sub">Semua prosedur kerja resmi {ctx.theme.name}, dikelompokkan dalam {terms.board.toLowerCase()}.</p>
        </div>
      </header>
      {boards.length === 0 ? (
        <div className="glass card empty">
          <Icon name="sop" size={34} />
          <h2 style={{ marginTop: 12 }}>Belum ada {terms.board.toLowerCase()}</h2>
          <p className="sub">Belum ada SOP yang dibuka untuk {ctx.theme.name}. Hubungi HRBP jika Anda merasa seharusnya ada.</p>
        </div>
      ) : (
        <div className="grid">
          {boards.map((b) => (
            <Link key={b.id} href={`/sop/b/${b.id}`} className="glass board-tile">
              <div className="band" aria-hidden="true"><Icon name="sop" size={34} sw={1.6} /></div>
              <div className="body">
                <h3>{b.name}</h3>
                <div className="muted" style={{ marginTop: 4 }}>{b.libraries[0]?.count ?? 0} {terms.library.toLowerCase()}</div>
                {b.owner_label && <div className="muted">Pemilik proses: {b.owner_label}</div>}
                <div className="muted">
                  Dibuka untuk: {b.board_holdings.length >= 3 ? 'Semua holding' : b.board_holdings.map((h) => THEMES[h.holding_id as HoldingId]?.name.replace(' Group', '') ?? h.holding_id).join(', ')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
