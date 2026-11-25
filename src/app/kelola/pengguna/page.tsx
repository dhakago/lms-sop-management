import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { UserTabs } from '../tabs';
import { THEMES, type HoldingId } from '@/lib/theme';

export const metadata = { title: 'Pengguna' };
const PAGE = 25;

type SP = { h?: string; q?: string; unit?: string; s?: string; p?: string };

// Karakter ini punya arti khusus di filter PostgREST, jadi dibuang dari kata pencarian.
const clean = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 60);

export default async function Pengguna({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await getCtx();
  const allowed = holdingsWith(ctx, 'pengguna');
  if (allowed.length === 0) notFound();
  const sp = await searchParams;

  const h: HoldingId = allowed.includes(sp.h as HoldingId) ? (sp.h as HoldingId) : allowed.includes(ctx.holding) ? ctx.holding : allowed[0]!;
  const q = clean(sp.q ?? '');
  const status = sp.s === 'nonaktif' || sp.s === 'semua' ? sp.s : 'aktif';
  const unit = sp.unit ?? '';
  const page = Math.max(1, Number(sp.p) || 1);

  const supabase = await createClient();
  let query = supabase
    .from('profiles')
    .select('id, employee_no, full_name, login_id, role, active, memberships!memberships_profile_id_fkey!inner(unit, job_title, manager_id)', { count: 'exact' })
    .eq('memberships.holding_id', h)
    .is('memberships.ended_on', null)
    .order('full_name')
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (status !== 'semua') query = query.eq('active', status === 'aktif');
  if (unit) query = query.eq('memberships.unit', unit);
  if (q) query = query.or(`full_name.ilike.%${q}%,employee_no.ilike.%${q}%,login_id.ilike.%${q}%`);
  const { data, count } = await query;

  const { data: unitRows } = await supabase.from('memberships').select('unit').eq('holding_id', h).is('ended_on', null).not('unit', 'is', null).limit(2000);
  const units = [...new Set((unitRows ?? []).map((u) => u.unit as string))].sort((a, b) => a.localeCompare(b, 'id'));

  type Row = { id: string; employee_no: string; full_name: string; login_id: string; role: string; active: boolean; memberships: { unit: string | null; job_title: string | null; manager_id: string | null }[] };
  const rows = (data ?? []) as unknown as Row[];
  const mgrIds = [...new Set(rows.map((r) => r.memberships[0]?.manager_id).filter((x): x is string => !!x))];
  const { data: mgrs } = mgrIds.length ? await supabase.from('profiles').select('id, full_name').in('id', mgrIds) : { data: [] };
  const mgrName = new Map((mgrs ?? []).map((m) => [m.id as string, m.full_name as string]));

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (over: Partial<SP>) => {
    const u = new URLSearchParams();
    const m = { h, q, unit, s: status, p: '1', ...over } as Record<string, string>;
    for (const [k, v] of Object.entries(m)) if (v) u.set(k, v);
    return `/kelola/pengguna?${u}`;
  };

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Manajemen pengguna' }]} />
      <UserTabs ctx={ctx} active="pengguna" />
      <div className="row between">
        <h1 className="page-title">Pengguna {THEMES[h].name}</h1>
        <div className="row">
          <Link className="btn sec" href="/kelola/pengguna/impor">Impor CSV</Link>
          <Link className="btn" href={`/kelola/pengguna/baru?h=${h}`}>Tambah pengguna</Link>
        </div>
      </div>

      {allowed.length > 1 && (
        <div className="row" role="tablist" aria-label="Holding">
          {allowed.map((x) => (
            <Link key={x} href={href({ h: x, unit: '', p: '1' })} className={`btn ${x === h ? '' : 'sec'}`} aria-current={x === h ? 'true' : undefined}>{THEMES[x].name}</Link>
          ))}
        </div>
      )}

      <form method="get" className="glass card row" style={{ alignItems: 'flex-end' }}>
        <input type="hidden" name="h" value={h} />
        <label className="field" style={{ flex: '2 1 220px' }}>
          <span>Cari nama, nomor induk, atau nomor HP</span>
          <input className="input" name="q" defaultValue={q} />
        </label>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span>Unit</span>
          <select className="input" name="unit" defaultValue={unit}>
            <option value="">Semua unit</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 140px' }}>
          <span>Status</span>
          <select className="input" name="s" defaultValue={status}>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="semua">Semua</option>
          </select>
        </label>
        <button className="btn" type="submit" style={{ minHeight: 52 }}>Terapkan</button>
      </form>

      <section className="glass card">
        <p className="muted" style={{ margin: '0 0 6px' }}>{total} pengguna</p>
        {rows.length === 0 ? (
          <div className="empty"><h2>Tidak ada pengguna</h2><p className="muted">Ubah pencarian atau filter, atau tambah pengguna baru.</p></div>
        ) : (
          <div className="list">
            {rows.map((r) => {
              const m = r.memberships[0];
              return (
                <Link key={r.id} href={`/kelola/pengguna/${r.id}`} className="list-row">
                  <div className="grow">
                    <b>{r.full_name}</b>
                    <span className="muted">{r.employee_no}{m?.job_title ? `, ${m.job_title}` : ''}{m?.unit ? `, ${m.unit}` : ''}</span>
                  </div>
                  <div className="muted" style={{ flex: '1 1 160px' }}>
                    {r.login_id}
                    {m?.manager_id && mgrName.get(m.manager_id) ? <><br />Atasan: {mgrName.get(m.manager_id)}</> : null}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {r.role !== 'peserta' && <span className="chip grey">{r.role === 'superadmin' ? 'Superadmin' : 'Admin'}</span>}
                    <span className={`chip ${r.active ? 'ok' : 'bad'}`}>{r.active ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {pages > 1 && (
          <div className="row between" style={{ marginTop: 14 }}>
            {page > 1 ? <Link className="btn sec" href={href({ p: String(page - 1) })}>Sebelumnya</Link> : <span />}
            <span className="muted">Halaman {page} dari {pages}</span>
            {page < pages ? <Link className="btn sec" href={href({ p: String(page + 1) })}>Berikutnya</Link> : <span />}
          </div>
        )}
      </section>
    </Shell>
  );
}
