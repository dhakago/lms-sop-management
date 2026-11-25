import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { RichText } from '@/components/RichText';
import { getCtx, getTerms } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fmtDate } from '@/lib/sop';

export const metadata = { title: 'Riwayat versi' };

export default async function Riwayat({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'sop').length === 0 || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const terms = await getTerms();
  const supabase = await createClient();

  const { data: card } = await supabase.from('cards').select('id, title, current_version_id, playbooks(id, name, libraries(boards(id, name)))').eq('id', id).maybeSingle();
  if (!card) notFound();
  const pb = card.playbooks as unknown as { id: string; name: string; libraries: { boards: { id: string; name: string } } };
  const { data: canEdit } = await supabase.rpc('can_edit_board', { b: pb.libraries.boards.id });
  if (canEdit !== true) notFound();

  const { data } = await supabase.from('card_versions').select('id, version, title, content, change, note, published_by, published_at').eq('card_id', id).order('version', { ascending: false });
  const versions = data ?? [];
  const shown = versions.find((x) => String(x.version) === v) ?? versions[0];

  // Nama penerbit: baris versi sudah lolos RLS, jadi hanya nama yang dilengkapi dengan kunci layanan.
  const ids = [...new Set(versions.map((x) => x.published_by as string))];
  const { data: people } = ids.length ? await createAdminClient().from('profiles').select('id, full_name').in('id', ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));

  return (
    <Shell ctx={ctx} active="sop">
      <Crumbs items={[
        { label: `Semua ${terms.board.toLowerCase()}`, href: '/sop' },
        { label: pb.libraries.boards.name, href: `/sop/b/${pb.libraries.boards.id}` },
        { label: pb.name, href: `/sop/p/${pb.id}` },
        { label: card.title, href: `/sop/c/${card.id}` },
        { label: 'Riwayat' },
      ]} />
      <h1 className="page-title">Riwayat versi</h1>
      {versions.length === 0 ? (
        <div className="glass card empty"><h2>Belum ada versi</h2><p className="sub">{terms.card} ini belum pernah diterbitkan.</p></div>
      ) : (
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <section className="glass card" style={{ flex: '1 1 260px' }}>
            <div className="list">
              {versions.map((x) => (
                <Link key={x.id} href={`/sop/c/${id}/riwayat?v=${x.version}`} className="list-row" aria-current={shown?.id === x.id ? 'true' : undefined} style={shown?.id === x.id ? { fontWeight: 700 } : undefined}>
                  <div className="grow">
                    <b>Versi {x.version}{x.id === card.current_version_id ? ' (sekarang)' : ''}</b>
                    <span className="muted">{fmtDate(x.published_at)}, {name.get(x.published_by as string) ?? '-'}</span>
                    <span className={`chip ${x.change === 'besar' ? 'warn' : 'grey'}`} style={{ marginTop: 4 }}>{x.change === 'besar' ? 'Perubahan besar' : 'Perubahan kecil'}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          {shown && (
            <article className="glass card" style={{ padding: 'clamp(20px, 4vw, 32px)', flex: '3 1 420px', minWidth: 0 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="chip grey">Versi {shown.version}, {fmtDate(shown.published_at)}</span>
                {shown.note && <span className="muted">Catatan: {shown.note}</span>}
              </div>
              <h2 style={{ fontSize: 26, marginBottom: 12 }}>{shown.title}</h2>
              <RichText doc={shown.content} />
            </article>
          )}
        </div>
      )}
    </Shell>
  );
}
