import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { getCtx } from '@/lib/session';
import { fmtDate, getMandatory } from '@/lib/sop';

export const metadata = { title: 'Beranda' };

// Beranda menampilkan SOP yang ditugaskan kepada pengguna. Tanpa penugasan, tidak ada yang muncul di sini,
// tetapi SOP holding tetap bisa dibaca dari menu SOP.
export default async function Beranda() {
  const ctx = await getCtx();
  const assigned = await getMandatory(ctx);
  const first = ctx.profile.full_name.split(' ')[0];
  const waiting = assigned.filter((m) => m.read < m.total);
  const done = assigned.filter((m) => m.read >= m.total);

  return (
    <Shell ctx={ctx} active="beranda">
      <header>
        <h1 className="page-title">Halo, {first}</h1>
        <p className="sub">{ctx.theme.name}. {waiting.length > 0 ? `${waiting.length} SOP ditugaskan dan menunggu Anda.` : 'Tidak ada SOP yang menunggu Anda.'}</p>
      </header>

      <section aria-labelledby="menunggu" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <h2 id="menunggu" style={{ fontSize: 20 }}>Menunggu Anda</h2>
          {waiting.length > 0 && <span className="chip grey">{waiting.length}</span>}
        </div>
        {waiting.length === 0 ? (
          <div className="glass card"><p className="muted">Belum ada SOP yang ditugaskan kepada Anda. Penugasan baru akan muncul di sini.</p></div>
        ) : (
          waiting.map((m) => (
            <div key={m.playbookId} className="glass card row between" style={{ padding: '14px 18px' }}>
              <div>
                <div className="muted" style={{ fontSize: 13 }}>Playbook</div>
                <b style={{ fontSize: 17 }}>{m.playbook}</b>
                <div className="muted" style={{ fontSize: 13 }}>
                  Card {m.read} dari {m.total} dibaca. Batas {fmtDate(m.dueOn)} {m.late && <span className="chip bad" style={{ marginLeft: 6 }}>Terlambat</span>}
                </div>
              </div>
              <Link className="btn sec" href={`/sop/p/${m.playbookId}`}>{m.read === 0 ? 'Mulai' : 'Lanjutkan'}</Link>
            </div>
          ))
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="selesai" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 id="selesai" style={{ fontSize: 18 }}>Sudah selesai</h2>
          <div className="glass card">
            <div className="list">
              {done.map((m) => (
                <Link key={m.playbookId} href={`/sop/p/${m.playbookId}`} className="list-row">
                  <span className="grow"><b>{m.playbook}</b><span className="muted">{m.total} card dibaca</span></span>
                  <span className="chip ok">Selesai</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

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
