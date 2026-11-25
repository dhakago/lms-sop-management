import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { THEMES } from '@/lib/theme';
import { UserTabs } from '../tabs';
import { CreateGroupForm } from './forms';

export const metadata = { title: 'Grup' };

export default async function Grup() {
  const ctx = await getCtx();
  const hs = holdingsWith(ctx, 'pengguna').filter((h) => h !== 'people');
  if (hs.length === 0) notFound();
  const db = await createClient();
  const { data } = await db.from('groups').select('id, name, holding_id, group_members(count)').in('holding_id', hs).order('name');
  type Row = { id: string; name: string; holding_id: keyof typeof THEMES; group_members: { count: number }[] };
  const rows = (data ?? []) as unknown as Row[];
  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Manajemen pengguna' }]} />
      <h1 className="page-title">Manajemen pengguna</h1>
      <UserTabs ctx={ctx} active="grup" />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', alignItems: 'start' }}>
        <section className="glass card">
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>Grup</h2>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>Kumpulan orang dalam satu holding. Dipakai untuk membatasi akses board dan menugaskan baca, tanpa memilih satu per satu.</p>
          <div className="list">
            {rows.map((g) => (
              <Link key={g.id} href={`/kelola/grup/${g.id}`} className="list-row">
                <div className="grow"><b>{g.name}</b><span className="muted">{THEMES[g.holding_id].name}</span></div>
                <span className="chip">{g.group_members[0]?.count ?? 0} anggota</span>
              </Link>
            ))}
            {rows.length === 0 && <p className="muted" style={{ padding: '10px 0' }}>Belum ada grup.</p>}
          </div>
        </section>
        <section className="glass card">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Grup baru</h2>
          <CreateGroupForm holdings={hs.map((h) => ({ id: h, name: THEMES[h].name }))} />
        </section>
      </div>
    </Shell>
  );
}
