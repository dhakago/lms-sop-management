import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { getCtx } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/sop';

export const metadata = { title: 'Pembelajaran' };

type Course = { id: string; title: string; description: string | null; category: string | null; est_minutes: number | null; enroll_mode: string; course_items: { count: number }[] };
type Enr = { id: string; course_id: string; status: string; due_on: string | null; escalated_at: string | null; source: string; courses: Course | null };
const clean = (q: string) => q.replace(/[,()%*\\_]/g, ' ').trim().slice(0, 60);

export default async function Belajar({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; k?: string }> }) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const db = await createClient();

  const { data: enr } = await db
    .from('enrollments')
    .select('id, course_id, status, due_on, escalated_at, source, courses(id, title, description, category, est_minutes, enroll_mode, status, course_items(count))')
    .eq('profile_id', ctx.userId)
    .order('enrolled_at', { ascending: false });
  const mine = ((enr ?? []) as unknown as (Enr & { courses: Course & { status: string } | null })[]).filter((e) => e.courses && e.courses.status === 'published');
  const ids = mine.map((e) => e.id);
  const { data: prog } = ids.length ? await db.from('item_progress').select('enrollment_id').in('enrollment_id', ids) : { data: [] };
  const done = new Map<string, number>();
  for (const p of prog ?? []) done.set(p.enrollment_id as string, (done.get(p.enrollment_id as string) ?? 0) + 1);

  const tab = sp.tab === 'katalog' ? 'katalog' : sp.tab === 'saya' ? 'saya' : mine.length > 0 ? 'saya' : 'katalog';
  const q = clean(sp.q ?? '');
  const kat = sp.k ?? '';

  let catalog: Course[] = [];
  let categories: string[] = [];
  if (tab === 'katalog') {
    const { data } = await db.from('courses').select('id, title, description, category, est_minutes, enroll_mode, course_items(count)')
      .eq('status', 'published').eq('enroll_mode', 'terbuka').order('title').limit(200);
    const all = (data ?? []) as unknown as Course[];
    categories = [...new Set(all.map((c) => c.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'id'));
    catalog = all.filter((c) => (!kat || c.category === kat) && (!q || `${c.title} ${c.description ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  }
  const enrolledIds = new Set(mine.map((e) => e.course_id));
  const today = new Date().toISOString().slice(0, 10);
  const running = mine.filter((e) => e.status === 'berjalan');
  const finished = mine.filter((e) => e.status === 'selesai');

  const tabLink = (t: string, label: string) => (
    <Link href={`/belajar?tab=${t}`} aria-current={tab === t ? 'page' : undefined} className={tab === t ? 'pill' : 'btn sec'} style={{ textDecoration: 'none', minHeight: 36, padding: '0 16px', borderRadius: 999, fontSize: 14 }}>{label}</Link>
  );

  const card = (c: Course, extra?: React.ReactNode, href?: string) => (
    <Link key={c.id} href={href ?? `/belajar/${c.id}`} className="glass card" style={{ textDecoration: 'none', color: 'var(--ink)', display: 'grid', gap: 6, alignContent: 'start' }}>
      {c.category && <span className="chip grey" style={{ justifySelf: 'start' }}>{c.category}</span>}
      <h2 style={{ fontSize: 18, color: 'var(--p)', margin: 0 }}>{c.title}</h2>
      {c.description && <p className="muted" style={{ margin: 0, fontSize: 14 }}>{c.description.length > 140 ? `${c.description.slice(0, 140)}...` : c.description}</p>}
      <span className="muted" style={{ fontSize: 13 }}>{c.course_items[0]?.count ?? 0} item{c.est_minutes ? ` · ${c.est_minutes} menit` : ''}</span>
      {extra}
    </Link>
  );
  const bar = (d: number, t: number) => (
    <div aria-label={`${d} dari ${t} item selesai`} style={{ height: 8, borderRadius: 4, background: 'var(--tp)', overflow: 'hidden' }}>
      <div style={{ width: `${t ? Math.round((100 * d) / t) : 0}%`, height: '100%', background: 'var(--p)' }} />
    </div>
  );

  return (
    <Shell ctx={ctx} active="belajar">
      <h1 className="page-title">Pembelajaran</h1>
      <nav className="row" style={{ gap: 8, marginBottom: 14 }} aria-label="Pembelajaran">{tabLink('saya', 'Pembelajaran saya')}{tabLink('katalog', 'Katalog')}</nav>

      {tab === 'saya' ? (
        mine.length === 0 ? (
          <div className="glass card empty"><h2>Belum ada kursus</h2><p className="sub">Anda belum terdaftar di kursus mana pun. Lihat <Link href="/belajar?tab=katalog">katalog</Link> untuk kursus yang bisa diikuti sendiri.</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 22 }}>
            {running.length > 0 && (
              <section>
                <h2 style={{ fontSize: 20, margin: '0 0 10px' }}>Sedang berjalan</h2>
                <div className="grid">
                  {running.map((e) => {
                    const total = e.courses!.course_items[0]?.count ?? 0; const d = done.get(e.id) ?? 0;
                    return card(e.courses!, (
                      <>
                        {bar(d, total)}
                        <div className="row" style={{ gap: 6 }}>
                          <span className="chip grey">{d} dari {total}</span>
                          {e.source === 'ditugaskan' && <span className="chip warn">Ditugaskan</span>}
                          {e.due_on && <span className={`chip ${e.due_on < today ? 'bad' : 'warn'}`}>Batas {fmtDate(e.due_on)}</span>}
                          {e.escalated_at && <span className="chip bad">Perlu tindak lanjut</span>}
                        </div>
                      </>
                    ));
                  })}
                </div>
              </section>
            )}
            {finished.length > 0 && (
              <section>
                <h2 style={{ fontSize: 20, margin: '0 0 10px' }}>Selesai</h2>
                <div className="grid">{finished.map((e) => card(e.courses!, <span className="chip ok" style={{ justifySelf: 'start' }}>Selesai</span>))}</div>
              </section>
            )}
          </div>
        )
      ) : (
        <>
          <form method="get" className="row" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
            <input type="hidden" name="tab" value="katalog" />
            <label className="field" style={{ flex: '1 1 240px' }}><span>Cari kursus</span><input className="input" name="q" defaultValue={q} /></label>
            {categories.length > 0 && (
              <label className="field" style={{ flex: '0 1 220px' }}><span>Kategori</span>
                <select className="input" name="k" defaultValue={kat}><option value="">Semua</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
            )}
            <button className="btn" type="submit">Cari</button>
          </form>
          {catalog.length === 0 ? (
            <div className="glass card empty"><h2>Tidak ada kursus</h2><p className="sub">Belum ada kursus terbuka yang cocok untuk Anda.</p></div>
          ) : (
            <div className="grid">{catalog.map((c) => card(c, <span className={`chip ${enrolledIds.has(c.id) ? 'ok' : 'grey'}`} style={{ justifySelf: 'start' }}>{enrolledIds.has(c.id) ? 'Sudah terdaftar' : 'Belum mulai'}</span>))}</div>
          )}
        </>
      )}
    </Shell>
  );
}
