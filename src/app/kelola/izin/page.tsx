import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { holdingsWith, MODULE_LABEL, type Module } from '@/lib/authz';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanQuery } from '@/lib/people';
import { THEMES, type HoldingId } from '@/lib/theme';
import { UserTabs } from '../tabs';

export const metadata = { title: 'Ikhtisar izin' };

// Ringkasan "siapa boleh apa" untuk satu orang: peran, akses admin, grup, akses board, dan penugasan baca.
// Dibaca lewat kunci layanan, tetapi hanya untuk holding yang boleh dikelola penonton (modul pengguna).
export default async function Izin({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  const ctx = await getCtx();
  const hs = holdingsWith(ctx, 'pengguna');
  if (hs.length === 0) notFound();
  const sp = await searchParams;
  const q = cleanQuery(sp.q ?? '');
  const db = createAdminClient();

  const { data: found } = q.length >= 2
    ? await db.from('memberships')
        .select('profiles!memberships_profile_id_fkey!inner(id, full_name, employee_no)')
        .in('holding_id', hs).is('ended_on', null)
        .or(`full_name.ilike.%${q}%,employee_no.ilike.%${q}%`, { referencedTable: 'profiles' }).limit(30)
    : { data: [] };
  type P = { id: string; full_name: string; employee_no: string };
  const people = [...new Map(((found ?? []) as unknown as { profiles: P }[]).map((r) => [r.profiles.id, r.profiles])).values()].slice(0, 10);

  const pid = /^[0-9a-f-]{36}$/i.test(sp.id ?? '') ? sp.id! : null;
  let detail: React.ReactNode = null;
  if (pid) {
    const { data: prof } = await db.from('profiles').select('id, full_name, employee_no, role, active').eq('id', pid).maybeSingle();
    const { data: ms } = await db.from('memberships').select('holding_id, unit, job_title').eq('profile_id', pid).is('ended_on', null).in('holding_id', hs);
    if (prof && (ms ?? []).length > 0) {
      const myH = (ms ?? []).map((m) => m.holding_id as HoldingId);
      const { data: acc } = await db.from('admin_access').select('holding_id, module').eq('profile_id', pid).in('holding_id', hs);
      const { data: gm } = await db.from('group_members').select('groups(id, name, holding_id)').eq('profile_id', pid);
      const groups = ((gm ?? []) as unknown as { groups: { id: string; name: string; holding_id: HoldingId } | null }[]).map((r) => r.groups).filter((g): g is NonNullable<typeof g> => !!g && hs.includes(g.holding_id));
      const gids = groups.map((g) => g.id);
      const units = (ms ?? []).map((m) => m.unit).filter((u): u is string => !!u);
      const { data: ba } = await db.from('board_access').select('board_id, holding_id, subject_type, unit, group_id, profile_id, role, boards(name)').in('holding_id', [...hs, 'people']);
      type BA = { board_id: string; holding_id: HoldingId; subject_type: string; unit: string | null; group_id: string | null; profile_id: string | null; role: string; boards: { name: string } | null };
      const mineBA = ((ba ?? []) as unknown as BA[]).filter((r) => (r.subject_type === 'user' && r.profile_id === pid) || (r.subject_type === 'unit' && r.unit && units.includes(r.unit) && myH.includes(r.holding_id)) || (r.subject_type === 'group' && r.group_id && gids.includes(r.group_id)));
      const { data: rq } = await db.from('playbook_requirements').select('due_on, holding_id, unit, target_type, group_id, profile_id, playbooks(name)').in('holding_id', hs);
      type RQ = { due_on: string; holding_id: HoldingId; unit: string | null; target_type: string; group_id: string | null; profile_id: string | null; playbooks: { name: string } | null };
      const mineRQ = ((rq ?? []) as unknown as RQ[]).filter((r) => (r.target_type === 'user' && r.profile_id === pid) || (r.target_type === 'group' && r.group_id && gids.includes(r.group_id)) || (r.target_type === 'holding' && myH.includes(r.holding_id) && (!r.unit || units.includes(r.unit))));
      const accessByH = new Map<string, Module[]>();
      for (const a of acc ?? []) accessByH.set(a.holding_id as string, [...(accessByH.get(a.holding_id as string) ?? []), a.module as Module]);

      detail = (
        <section className="glass card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 20 }}>{prof.full_name}</h2>
          <p className="muted" style={{ margin: '2px 0 12px' }}>{prof.employee_no} · peran {prof.role}{prof.active ? '' : ' · nonaktif'}</p>
          <h3 style={{ fontSize: 16, margin: '0 0 4px' }}>Keanggotaan</h3>
          <div className="list">
            {(ms ?? []).map((m) => <div key={m.holding_id as string} className="list-row"><div className="grow"><b>{THEMES[m.holding_id as HoldingId].name}</b><span className="muted">{m.unit ?? 'Tanpa unit'}{m.job_title ? `, ${m.job_title}` : ''}</span></div></div>)}
          </div>
          {(acc ?? []).length > 0 && (<>
            <h3 style={{ fontSize: 16, margin: '14px 0 4px' }}>Akses admin</h3>
            <div className="list">
              {[...accessByH].map(([h, mods]) => <div key={h} className="list-row"><div className="grow"><b>{THEMES[h as HoldingId].name}</b><span className="muted">{mods.map((m) => MODULE_LABEL[m]).join(', ')}</span></div></div>)}
            </div>
          </>)}
          <h3 style={{ fontSize: 16, margin: '14px 0 4px' }}>Grup</h3>
          <p className="muted" style={{ margin: 0 }}>{groups.length ? groups.map((g) => `${g.name} (${THEMES[g.holding_id].name})`).join(', ') : 'Tidak ada grup.'}</p>
          <h3 style={{ fontSize: 16, margin: '14px 0 4px' }}>Akses board yang menyebutnya</h3>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>Board tanpa pembatasan di holding orang ini terbuka untuk semua orang di holding itu dan tidak tercantum di sini.</p>
          <div className="list">
            {mineBA.map((r, i) => <div key={i} className="list-row"><div className="grow"><b>{r.boards?.name ?? 'Board'}</b><span className="muted">{r.role === 'editor' ? 'Editor' : 'Pembaca'} lewat {r.subject_type === 'user' ? 'nama langsung' : r.subject_type === 'unit' ? `unit ${r.unit}` : 'grup'}, {THEMES[r.holding_id].name}</span></div></div>)}
            {mineBA.length === 0 && <p className="muted" style={{ padding: '8px 0' }}>Tidak ada.</p>}
          </div>
          <h3 style={{ fontSize: 16, margin: '14px 0 4px' }}>Penugasan baca</h3>
          <div className="list">
            {mineRQ.map((r, i) => <div key={i} className="list-row"><div className="grow"><b>{r.playbooks?.name ?? 'Playbook'}</b><span className="muted">Batas {r.due_on} · lewat {r.target_type === 'user' ? 'nama langsung' : r.target_type === 'group' ? 'grup' : r.unit ? `unit ${r.unit}` : 'seluruh holding'}</span></div></div>)}
            {mineRQ.length === 0 && <p className="muted" style={{ padding: '8px 0' }}>Tidak ada.</p>}
          </div>
        </section>
      );
    }
  }

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Manajemen pengguna' }]} />
      <h1 className="page-title">Manajemen pengguna</h1>
      <UserTabs ctx={ctx} active="izin" />
      <section className="glass card">
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Cari orang</h2>
        <form method="get" className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 260px' }}><span>Nama atau nomor induk</span><input className="input" name="q" defaultValue={q} /></label>
          <button className="btn" type="submit">Cari</button>
        </form>
        {q.length >= 2 && (
          <div className="list" style={{ marginTop: 10 }}>
            {people.map((p) => <Link key={p.id} href={`/kelola/izin?q=${encodeURIComponent(q)}&id=${p.id}`} className="list-row"><div className="grow"><b>{p.full_name}</b><span className="muted">{p.employee_no}</span></div></Link>)}
            {people.length === 0 && <p className="muted" style={{ padding: '8px 0' }}>Tidak ada hasil.</p>}
          </div>
        )}
      </section>
      {detail}
    </Shell>
  );
}
