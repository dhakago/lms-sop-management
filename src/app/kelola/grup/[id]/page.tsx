import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { canAccess } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { peopleByIds } from '@/lib/people';
import { THEMES, type HoldingId } from '@/lib/theme';
import { UserTabs } from '../../tabs';
import { AddMemberForm, DeleteGroupForm, RemoveMemberForm, RenameGroupForm } from '../forms';

export const metadata = { title: 'Grup' };

export default async function GrupDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const { data: g } = await db.from('groups').select('id, name, holding_id').eq('id', id).maybeSingle();
  if (!g || !canAccess(ctx, g.holding_id, 'pengguna')) notFound();
  const { data: mem } = await db.from('group_members').select('profile_id').eq('group_id', id);
  const ids = (mem ?? []).map((m) => m.profile_id as string);
  const who = await peopleByIds(ids);
  const members = ids.map((p) => ({ id: p, ...(who.get(p) ?? { name: 'Pengguna', employeeNo: '' }) })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Manajemen pengguna', href: '/kelola/grup' }, { label: g.name }]} />
      <h1 className="page-title">{g.name}</h1>
      <UserTabs ctx={ctx} active="grup" />
      <p className="muted" style={{ margin: '-4px 0 14px' }}>{THEMES[g.holding_id as HoldingId].name}</p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', alignItems: 'start' }}>
        <section className="glass card">
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>Anggota ({members.length})</h2>
          <div className="list">
            {members.map((m) => (
              <div key={m.id} className="list-row">
                <div className="grow"><b>{m.name}</b><span className="muted">{m.employeeNo}</span></div>
                <RemoveMemberForm id={id} person={m.id} />
              </div>
            ))}
            {members.length === 0 && <p className="muted" style={{ padding: '10px 0' }}>Belum ada anggota.</p>}
          </div>
        </section>
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="glass card">
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>Tambah anggota</h2>
            <AddMemberForm id={id} holding={g.holding_id} />
          </section>
          <section className="glass card">
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>Ubah grup</h2>
            <RenameGroupForm id={id} name={g.name} />
            <div style={{ marginTop: 12 }}><DeleteGroupForm id={id} /></div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
