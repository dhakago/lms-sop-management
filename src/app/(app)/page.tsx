import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { getCtx } from '@/lib/session';
import { fmtDate, getMandatory } from '@/lib/sop';

export const metadata = { title: 'Beranda' };

export default async function Beranda() {
  const ctx = await getCtx();
  const mandatory = await getMandatory(ctx);
  const first = ctx.profile.full_name.split(' ')[0];
  const pending = mandatory.filter((m) => m.read < m.total);

  return (
    <Shell ctx={ctx} active="beranda">
      <header>
        <h1 className="page-title">Halo, {first}</h1>
        <p className="sub">{ctx.theme.name}. {pending.length > 0 ? `${pending.length} SOP wajib dibaca menunggu Anda.` : 'Tidak ada SOP wajib dibaca yang tertunda.'}</p>
      </header>

      <section className="glass card" aria-labelledby="wajib">
        <h2 id="wajib" style={{ fontSize: 20 }}>SOP wajib dibaca</h2>
        {mandatory.length === 0 ? (
          <p className="muted" style={{ marginTop: 10 }}>Belum ada SOP yang diwajibkan untuk Anda.</p>
        ) : (
          <div className="list" style={{ marginTop: 6 }}>
            {mandatory.map((m) => (
              <Link key={m.playbookId} href={`/sop/p/${m.playbookId}`} className="list-row">
                <span className="grow">
                  <b>{m.playbook}</b>
                  <span className="muted">{m.read} dari {m.total} card dibaca. Batas {fmtDate(m.dueOn)}</span>
                </span>
                {m.read >= m.total ? <span className="chip ok">Selesai</span> : m.late ? <span className="chip bad">Terlambat</span> : <span className="chip warn">Belum selesai</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid">
        <Link href="/sop" className="glass card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h2 style={{ fontSize: 18 }}>SOP dan prosedur</h2>
          <p className="muted" style={{ marginTop: 6 }}>Baca prosedur kerja resmi holding Anda.</p>
        </Link>
        <Link href="/belajar" className="glass card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h2 style={{ fontSize: 18 }}>Pembelajaran</h2>
          <p className="muted" style={{ marginTop: 6 }}>Kursus dan sertifikat segera hadir.</p>
        </Link>
      </section>
    </Shell>
  );
}
