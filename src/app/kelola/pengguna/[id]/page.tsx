import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { canAccess, holdingsWith, isSuper } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { THEMES, type HoldingId } from '@/lib/theme';
import { ActivePanel, EditPanel, MutatePanel, ResetPanel } from './panels';

export const metadata = { title: 'Detail pengguna' };

type M = { id: string; holding_id: HoldingId; unit: string | null; job_title: string | null; manager_id: string | null; started_on: string; ended_on: string | null };

export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  const mine = holdingsWith(ctx, 'pengguna');
  if (mine.length === 0) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Dibaca lewat sesi pengguna: RLS sendiri yang menolak orang di luar holding yang boleh dikelola.
  const supabase = await createClient();
  const { data: p } = await supabase.from('profiles').select('id, employee_no, full_name, login_id, phone, email, role, active, must_change_password').eq('id', id).maybeSingle();
  if (!p) notFound();
  const { data: ms } = await supabase
    .from('memberships')
    .select('id, holding_id, unit, job_title, manager_id, started_on, ended_on')
    .eq('profile_id', id)
    .order('started_on', { ascending: false });
  const memberships = (ms ?? []) as M[];
  const active = memberships.filter((m) => !m.ended_on);

  const mgrIds = [...new Set(memberships.map((m) => m.manager_id).filter((x): x is string => !!x))];
  const { data: mgrs } = mgrIds.length ? await supabase.from('profiles').select('id, full_name, employee_no').in('id', mgrIds) : { data: [] };
  const mgr = new Map((mgrs ?? []).map((m) => [m.id as string, m as { full_name: string; employee_no: string }]));

  // Admin dan superadmin hanya boleh diurus superadmin (aturan yang sama dengan loadTarget di server action).
  const manageable = isSuper(ctx) || p.role === 'peserta';
  const editable = active.filter((m) => canAccess(ctx, m.holding_id, 'pengguna'));
  const from = editable.map((m) => ({ id: m.holding_id, name: THEMES[m.holding_id].name }));
  const taken = new Set(active.map((m) => m.holding_id));
  const to = mine.filter((h) => !taken.has(h)).map((h) => ({ id: h, name: THEMES[h].name }));

  const kv = (k: React.ReactNode, v: React.ReactNode, key?: string) => (
    <div key={key} className="row" style={{ padding: '10px 0', borderTop: '1px solid var(--line)', gap: '4px 16px' }}>
      <div className="muted" style={{ flex: '0 0 170px' }}>{k}</div>
      <div style={{ flex: 1, fontWeight: 500 }}>{v || '-'}</div>
    </div>
  );

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Pengguna', href: '/kelola/pengguna' }, { label: p.full_name }]} />
      <div className="row between">
        <div>
          <h1 className="page-title">{p.full_name}</h1>
          <p className="sub">{p.employee_no}</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {p.role !== 'peserta' && <span className="chip grey">{p.role === 'superadmin' ? 'Superadmin' : 'Admin'}</span>}
          <span className={`chip ${p.active ? 'ok' : 'bad'}`}>{p.active ? 'Aktif' : 'Nonaktif'}</span>
          {p.must_change_password && <span className="chip warn">Belum ganti kata sandi sementara</span>}
        </div>
      </div>

      <section className="glass card">
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Data</h2>
        {kv('Masuk dengan', p.login_id)}
        {kv('Nomor HP', p.phone)}
        {kv('Email', p.email)}
        <p className="muted" style={{ margin: '10px 0 0' }}>Nama, nomor HP, dan email belum bisa diubah dari layar ini.</p>
      </section>

      <section className="glass card">
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Keanggotaan</h2>
        {memberships.map((m) => (
          kv(
            <>{THEMES[m.holding_id].name} {m.ended_on ? <span className="chip grey">Berakhir {m.ended_on}</span> : <span className="chip ok">Aktif</span>}</>,
            <>
              {[m.job_title, m.unit].filter(Boolean).join(', ') || '-'}
              <br />
              <span className="muted">Atasan: {m.manager_id && mgr.get(m.manager_id) ? `${mgr.get(m.manager_id)!.full_name} (${mgr.get(m.manager_id)!.employee_no})` : '-'}. Sejak {m.started_on}.</span>
            </>,
            m.id,
          )
        ))}
      </section>

      {!manageable ? (
        <div className="alert info">Akun admin hanya bisa diurus oleh superadmin.</div>
      ) : (
        <>
          {editable.length > 0 && (
            <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontSize: 20 }}>Ubah unit, jabatan, dan atasan</h2>
              {editable.map((m) => (
                <EditPanel
                  key={m.id}
                  id={p.id}
                  holding={m.holding_id}
                  holdingName={THEMES[m.holding_id].name}
                  unit={m.unit ?? ''}
                  jobTitle={m.job_title ?? ''}
                  managerNo={(m.manager_id && mgr.get(m.manager_id)?.employee_no) || ''}
                />
              ))}
            </section>
          )}
          <section className="glass card"><h2 style={{ fontSize: 20, marginBottom: 10 }}>Kata sandi</h2><ResetPanel id={p.id} /></section>
          {from.length > 0 && to.length > 0 && (
            <section className="glass card"><h2 style={{ fontSize: 20, marginBottom: 10 }}>Mutasi antar holding</h2><MutatePanel id={p.id} from={from} to={to} /></section>
          )}
          <section className="glass card"><h2 style={{ fontSize: 20, marginBottom: 10 }}>Status akun</h2><ActivePanel id={p.id} active={p.active} self={p.id === ctx.userId} /></section>
        </>
      )}
    </Shell>
  );
}
