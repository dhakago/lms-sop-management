import { Shell } from '@/components/Shell';
import { getCtx } from '@/lib/session';
import { cookies } from 'next/headers';
import { setLite } from '@/app/actions';
import Link from 'next/link';

export const metadata = { title: 'Profil saya' };

export default async function Profil() {
  const ctx = await getCtx();
  const lite = (await cookies()).get('lite')?.value === '1';
  const m = ctx.memberships.find((x) => x.holding_id === ctx.holding);
  const kv = (k: string, v: string | null | undefined) => (
    <div className="row" style={{ padding: '12px 0', borderTop: '1px solid var(--line)', gap: '4px 16px' }}>
      <div className="muted" style={{ flex: '0 0 170px' }}>{k}</div>
      <div style={{ flex: 1, fontWeight: 500 }}>{v || '-'}</div>
    </div>
  );
  return (
    <Shell ctx={ctx} active="profil">
      <h1 className="page-title">Profil saya</h1>
      <section className="glass card">
        <div className="row" style={{ gap: 16 }}>
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 22, background: 'var(--p)', color: '#fff' }}>{ctx.initials}</div>
          <div>
            <h2 style={{ fontSize: 24 }}>{ctx.profile.full_name}</h2>
            <p className="muted">{ctx.profile.employee_no}, {ctx.theme.name}</p>
          </div>
        </div>
      </section>
      <section className="glass card">
        <h2 style={{ fontSize: 20 }}>Data diri</h2>
        <p className="muted" style={{ margin: '4px 0 8px' }}>Data ini diatur oleh admin PEOPLE. Jika ada yang salah, hubungi HRBP holding Anda.</p>
        {kv('Nomor induk', ctx.profile.employee_no)}
        {kv('Jabatan', m?.job_title)}
        {kv('Unit', m?.unit)}
        {kv('Atasan langsung', ctx.manager?.full_name)}
        {kv('Nomor HP', ctx.profile.phone)}
        {kv('Email', ctx.profile.email ?? 'Belum ada, pemberitahuan lewat aplikasi')}
      </section>
      <section className="glass card">
        <h2 style={{ fontSize: 20 }}>Tampilan</h2>
        <form action={setLite} className="row between" style={{ marginTop: 10 }}>
          <div style={{ flex: '1 1 260px' }}>
            <b>Mode hemat</b>
            <p className="muted" style={{ margin: 0 }}>Mematikan efek kaca buram dan gradasi agar aplikasi lebih ringan di ponsel dengan memori kecil.</p>
          </div>
          <input type="hidden" name="lite" value={lite ? '0' : '1'} />
          <button className="btn sec" type="submit">{lite ? 'Matikan mode hemat' : 'Aktifkan mode hemat'}</button>
        </form>
      </section>
      <section className="glass card row between">
        <div><b>Kata sandi</b><p className="muted" style={{ margin: 0 }}>Ganti kata sandi Anda kapan saja.</p></div>
        <Link className="btn sec" href="/ganti-sandi">Ganti kata sandi</Link>
      </section>
    </Shell>
  );
}
