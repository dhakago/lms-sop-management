import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx, getTerms } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/sop';

type PB = {
  id: string; name: string; description: string | null;
  libraries: { id: string; name: string; boards: { id: string; name: string } };
  cards: { id: string; title: string; position: number; status: string; current_version_id: string | null }[];
  playbook_requirements: { holding_id: string; due_on: string; unit: string | null }[];
};

export default async function SopPlaybook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data } = await supabase
    .from('playbooks')
    .select('id, name, description, libraries(id, name, boards(id, name)), cards(id, title, position, status, current_version_id), playbook_requirements(holding_id, due_on, unit)')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const pb = data as unknown as PB;

  const { data: receipts } = await supabase.from('read_receipts').select('card_id, version_id').eq('profile_id', ctx.userId);
  const readVersions = new Set((receipts ?? []).map((r) => r.version_id));
  const readCards = new Set((receipts ?? []).map((r) => r.card_id));
  const req = pb.playbook_requirements.find((r) => r.holding_id === ctx.holding);
  const cards = pb.cards.filter((c) => c.status === 'published').sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  const drafts = pb.cards.length - cards.length;
  const readCount = cards.filter((c) => c.current_version_id && readVersions.has(c.current_version_id)).length;

  return (
    <Shell ctx={ctx} active="sop">
      <Crumbs items={[
        { label: `Semua ${terms.board.toLowerCase()}`, href: '/sop' },
        { label: pb.libraries.boards.name, href: `/sop/b/${pb.libraries.boards.id}` },
        { label: pb.libraries.name, href: `/sop/b/${pb.libraries.boards.id}` },
        { label: pb.name },
      ]} />
      <header className="row between">
        <div>
          <h1 className="page-title">{pb.name}</h1>
          {pb.description && <p className="sub">{pb.description}</p>}
        </div>
        {req && <span className={`chip ${readCount >= cards.length ? 'ok' : 'warn'}`}>Wajib dibaca, batas {fmtDate(req.due_on)}</span>}
      </header>
      <section className="glass card">
        <div className="row between">
          <h2 style={{ fontSize: 20 }}>{cards.length} {terms.card.toLowerCase()}</h2>
          <span className="muted">{readCount} dari {cards.length} sudah dibaca{drafts > 0 && ctx.nav.editor ? `, ${drafts} masih draf` : ''}</span>
        </div>
        <div className="list" style={{ marginTop: 6 }}>
          {cards.map((c, i) => {
            const read = c.current_version_id && readVersions.has(c.current_version_id);
            const again = !read && readCards.has(c.id);
            return (
              <Link key={c.id} href={`/sop/c/${c.id}`} className="list-row">
                <span className="muted" style={{ width: 24 }}>{i + 1}</span>
                <span className="grow"><b>{c.title}</b></span>
                {read ? <span className="chip ok">Sudah dibaca</span> : again ? <span className="chip warn">Baca ulang, ada perubahan</span> : <span className="chip grey">Belum dibaca</span>}
              </Link>
            );
          })}
          {cards.length === 0 && <p className="muted" style={{ padding: '14px 0' }}>Belum ada {terms.card.toLowerCase()} yang terbit.</p>}
        </div>
      </section>
    </Shell>
  );
}
