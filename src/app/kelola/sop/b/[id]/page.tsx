import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { THEMES, type HoldingId } from '@/lib/theme';
import { AddLibraryForm, AddPlaybookForm, ArchiveForm, BoardForm, MoveButtons, RemoveNodeForm, RenameForm } from '../../forms';

export const metadata = { title: 'Ubah board' };

type Lib = { id: string; name: string; description: string | null; position: number; playbooks: { id: string; name: string; description: string | null; position: number; cards: { count: number }[] }[] };

export default async function EditBoard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const mine = holdingsWith(ctx, 'sop');
  if (mine.length === 0 || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data: board } = await supabase.from('boards').select('id, name, description, owner_label, archived').eq('id', id).maybeSingle();
  if (!board) notFound();
  const { data: bh } = await supabase.from('board_holdings').select('holding_id').eq('board_id', id);
  const boardHoldings = (bh ?? []).map((h) => h.holding_id as HoldingId);
  const editable = boardHoldings.length > 0 && boardHoldings.every((h) => mine.includes(h));
  const { data } = await supabase
    .from('libraries')
    .select('id, name, description, position, playbooks(id, name, description, position, cards(count))')
    .eq('board_id', id)
    .order('position')
    .order('name');
  const libs = (data ?? []) as unknown as Lib[];
  const L = terms.library, P = terms.playbook;

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Editor SOP', href: '/kelola/sop' }, { label: board.name }]} />
      <div className="row between">
        <div>
          <h1 className="page-title">{board.name}</h1>
          <p className="sub">Dibuka untuk {boardHoldings.map((h) => THEMES[h].name).join(', ')}</p>
        </div>
        <div className="row">
          {board.archived && <span className="chip grey">Diarsipkan</span>}
          <Link className="btn sec" href={`/sop/b/${board.id}`}>Lihat sebagai pembaca</Link>
        </div>
      </div>

      {!editable ? (
        <div className="alert info">{terms.board} ini juga dibuka untuk holding yang akses SOP-nya tidak Anda miliki, jadi hanya bisa dilihat. Minta superadmin menambah akses atau mengubahnya.</div>
      ) : (
        <>
          <section className="glass card" style={{ maxWidth: 640 }}>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>Ubah data {terms.board.toLowerCase()}</summary>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <BoardForm id={board.id} name={board.name} description={board.description ?? ''} owner={board.owner_label ?? ''} holdings={mine.map((h) => ({ id: h, name: THEMES[h].name }))} checked={boardHoldings} labels={{ board: terms.board }} />
                <ArchiveForm id={board.id} archived={board.archived} />
              </div>
            </details>
          </section>

          {libs.map((l) => (
            <section key={l.id} className="glass card">
              <div className="row between">
                <h2 style={{ fontSize: 20 }}>{l.name}</h2>
                <MoveButtons kind="library" id={l.id} />
              </div>
              {l.description && <p className="muted" style={{ margin: '4px 0 0' }}>{l.description}</p>}
              <div className="list" style={{ marginTop: 8 }}>
                {[...l.playbooks].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)).map((p) => (
                  <div key={p.id} className="list-row">
                    <Link href={`/kelola/sop/p/${p.id}`} className="grow" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                      <b>{p.name}</b>
                      <span className="muted">{p.cards[0]?.count ?? 0} {terms.card.toLowerCase()}</span>
                    </Link>
                    <MoveButtons kind="playbook" id={p.id} />
                  </div>
                ))}
                {l.playbooks.length === 0 && <p className="muted" style={{ padding: '12px 0' }}>Belum ada {P.toLowerCase()}.</p>}
              </div>
              <div className="row" style={{ alignItems: 'flex-start', gap: 24, marginTop: 10 }}>
                <details style={{ flex: '1 1 260px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>Tambah {P.toLowerCase()}</summary>
                  <div style={{ marginTop: 10 }}><AddPlaybookForm library={l.id} label={P} /></div>
                </details>
                <details style={{ flex: '1 1 260px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>Ubah atau hapus {L.toLowerCase()} ini</summary>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <RenameForm kind="library" id={l.id} name={l.name} description={l.description ?? ''} />
                    <RemoveNodeForm kind="library" id={l.id} what={L.toLowerCase()} />
                  </div>
                </details>
              </div>
            </section>
          ))}

          <section className="glass card" style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>Tambah {L.toLowerCase()}</h2>
            <AddLibraryForm board={board.id} label={L} />
          </section>
        </>
      )}
    </Shell>
  );
}
