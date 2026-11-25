import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { canAccess, holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/sop';
import { THEMES, type HoldingId } from '@/lib/theme';
import { AddCardForm, AddRequirementForm, MoveButtons, RemoveCardForm, RemoveNodeForm, RemoveRequirementForm, RenameForm } from '../../forms';

export const metadata = { title: 'Ubah playbook' };

type PB = {
  id: string; name: string; description: string | null;
  libraries: { id: string; name: string; boards: { id: string; name: string } };
  cards: { id: string; title: string; position: number; status: string; current_version_id: string | null }[];
  playbook_requirements: { id: string; holding_id: HoldingId; due_on: string; unit: string | null }[];
};

export default async function EditPlaybook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'sop').length === 0 || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data } = await supabase
    .from('playbooks')
    .select('id, name, description, libraries(id, name, boards(id, name)), cards(id, title, position, status, current_version_id), playbook_requirements(id, holding_id, due_on, unit)')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const pb = data as unknown as PB;
  const boardId = pb.libraries.boards.id;

  const { data: bh } = await supabase.from('board_holdings').select('holding_id').eq('board_id', boardId);
  const boardHoldings = (bh ?? []).map((h) => h.holding_id as HoldingId);
  const { data: canEdit } = await supabase.rpc('can_edit_board', { b: boardId });
  if (canEdit !== true) {
    return (
      <Shell ctx={ctx} active="kelola">
        <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Editor SOP', href: '/kelola/sop' }, { label: pb.libraries.boards.name, href: `/kelola/sop/b/${boardId}` }, { label: pb.name }]} />
        <h1 className="page-title">{pb.name}</h1>
        <div className="alert info">Anda tidak bisa mengubah {terms.playbook.toLowerCase()} ini. {terms.board} ini juga dibuka untuk holding yang akses SOP-nya tidak Anda miliki.</div>
      </Shell>
    );
  }

  // Target wajib baca hanya untuk holding yang membuka board dan yang akses SOP-nya dimiliki admin ini.
  const targetHoldings = boardHoldings.filter((h) => canAccess(ctx, h, 'sop'));
  const { data: unitRows } = await supabase.from('memberships').select('unit').in('holding_id', targetHoldings).is('ended_on', null).not('unit', 'is', null).limit(2000);
  const units = [...new Set((unitRows ?? []).map((u) => u.unit as string))].sort((a, b) => a.localeCompare(b, 'id'));

  const cards = [...pb.cards].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  const reqs = [...pb.playbook_requirements].sort((a, b) => a.due_on.localeCompare(b.due_on));

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Editor SOP', href: '/kelola/sop' }, { label: pb.libraries.boards.name, href: `/kelola/sop/b/${boardId}` }, { label: pb.name }]} />
      <div className="row between">
        <div>
          <h1 className="page-title">{pb.name}</h1>
          <p className="sub">{pb.libraries.name}</p>
        </div>
        <Link className="btn sec" href={`/sop/p/${pb.id}`}>Lihat sebagai pembaca</Link>
      </div>

      <section className="glass card">
        <h2 style={{ fontSize: 20 }}>{terms.card}</h2>
        <div className="list" style={{ marginTop: 6 }}>
          {cards.map((c) => (
            <div key={c.id} className="list-row">
              <Link href={`/kelola/sop/c/${c.id}`} className="grow" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                <b>{c.title}</b>
              </Link>
              <span className={`chip ${c.status === 'published' ? 'ok' : 'warn'}`}>{c.status === 'published' ? 'Terbit' : 'Draf'}</span>
              <MoveButtons kind="card" id={c.id} />
              {c.status === 'draft' && !c.current_version_id && <RemoveCardForm id={c.id} />}
            </div>
          ))}
          {cards.length === 0 && <p className="muted" style={{ padding: '12px 0' }}>Belum ada {terms.card.toLowerCase()}.</p>}
        </div>
        <div style={{ marginTop: 14, maxWidth: 480 }}>
          <AddCardForm playbook={pb.id} label={terms.card} />
        </div>
      </section>

      <section className="glass card">
        <h2 style={{ fontSize: 20 }}>Wajib dibaca</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>Target dan batas waktu diatur di sini. Ini yang mengisi daftar &quot;SOP wajib dibaca&quot; di Beranda peserta. Hanya {terms.card.toLowerCase()} yang sudah terbit yang dihitung.</p>
        <div className="list" style={{ marginTop: 8 }}>
          {reqs.map((r) => (
            <div key={r.id} className="list-row">
              <div className="grow">
                <b>{THEMES[r.holding_id].name}{r.unit ? `, unit ${r.unit}` : ', semua unit'}</b>
                <span className="muted">Batas {fmtDate(r.due_on)}</span>
              </div>
              {canAccess(ctx, r.holding_id, 'sop') && <RemoveRequirementForm id={r.id} />}
            </div>
          ))}
          {reqs.length === 0 && <p className="muted" style={{ padding: '12px 0' }}>Belum ada target.</p>}
        </div>
        {targetHoldings.length > 0 && (
          <div style={{ marginTop: 14, maxWidth: 480 }}>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Tambah target</h3>
            <AddRequirementForm playbook={pb.id} holdings={targetHoldings.map((h) => ({ id: h, name: THEMES[h].name }))} units={units} />
          </div>
        )}
      </section>

      <section className="glass card" style={{ maxWidth: 560 }}>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>Ubah atau hapus {terms.playbook.toLowerCase()} ini</summary>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <RenameForm kind="playbook" id={pb.id} name={pb.name} description={pb.description ?? ''} />
            <RemoveNodeForm kind="playbook" id={pb.id} what={terms.playbook.toLowerCase()} />
          </div>
        </details>
      </section>
    </Shell>
  );
}
