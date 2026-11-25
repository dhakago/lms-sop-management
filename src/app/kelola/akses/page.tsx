import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { isSuper, MODULE_LABEL, type Module } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { THEMES, type HoldingId } from '@/lib/theme';

export const metadata = { title: 'Akses admin' };
const clean = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 60);

export default async function Akses({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await getCtx();
  if (!isSuper(ctx)) notFound();
  const q = clean((await searchParams).q ?? '');
  const supabase = await createClient();

  const { data: admins } = await supabase.from('profiles').select('id, full_name, employee_no, role, active').in('role', ['admin', 'superadmin']).order('full_name');
  const { data: acc } = await supabase.from('admin_access').select('profile_id, holding_id, module');
  const byPerson = new Map<string, { holding_id: HoldingId; module: Module }[]>();
  for (const a of (acc ?? []) as { profile_id: string; holding_id: HoldingId; module: Module }[]) {
    byPerson.set(a.profile_id, [...(byPerson.get(a.profile_id) ?? []), a]);
  }

  const { data: found } = q
    ? await supabase.from('profiles').select('id, full_name, employee_no, role').eq('active', true).or(`full_name.ilike.%${q}%,employee_no.ilike.%${q}%`).order('full_name').limit(10)
    : { data: [] };

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Akses admin' }]} />
      <h1 className="page-title">Akses admin</h1>

      <section className="glass card">
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Beri akses ke orang lain</h2>
        <form method="get" className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 260px' }}>
            <span>Cari nama atau nomor induk</span>
            <input className="input" name="q" defaultValue={q} />
          </label>
          <button className="btn" type="submit" style={{ minHeight: 52 }}>Cari</button>
        </form>
        {q && (found ?? []).length === 0 && <p className="muted" style={{ marginTop: 10 }}>Tidak ada yang cocok.</p>}
        <div className="list">
          {(found ?? []).map((u) => (
            <Link key={u.id} href={`/kelola/akses/${u.id}`} className="list-row">
              <div className="grow"><b>{u.full_name}</b><span className="muted">{u.employee_no}</span></div>
              <span className="chip grey">{u.role === 'peserta' ? 'Peserta' : u.role === 'admin' ? 'Admin' : 'Superadmin'}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="glass card">
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Admin saat ini</h2>
        {(admins ?? []).length === 0 ? (
          <p className="muted">Belum ada admin.</p>
        ) : (
          <div className="list">
            {(admins ?? []).map((a) => {
              const rows = byPerson.get(a.id) ?? [];
              const text = a.role === 'superadmin'
                ? 'Semua holding dan modul'
                : rows.length === 0 ? 'Belum ada akses'
                : (Object.entries(
                    rows.reduce<Record<string, string[]>>((o, r) => ((o[r.holding_id] ??= []).push(MODULE_LABEL[r.module]), o), {}),
                  ) as [HoldingId, string[]][]).map(([h, ms]) => `${THEMES[h].name}: ${ms.join(', ')}`).join('. ');
              const row = (
                <>
                  <div className="grow"><b>{a.full_name}</b><span className="muted">{a.employee_no}</span></div>
                  <div className="muted" style={{ flex: '2 1 260px' }}>{text}</div>
                  {!a.active && <span className="chip bad">Nonaktif</span>}
                </>
              );
              return a.role === 'superadmin'
                ? <div key={a.id} className="list-row">{row}</div>
                : <Link key={a.id} href={`/kelola/akses/${a.id}`} className="list-row">{row}</Link>;
            })}
          </div>
        )}
      </section>
    </Shell>
  );
}
