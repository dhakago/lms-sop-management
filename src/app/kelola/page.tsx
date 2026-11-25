import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { getCtx } from '@/lib/session';
import { holdingsWith, isSuper } from '@/lib/authz';

export const metadata = { title: 'Kelola' };

export default async function Kelola() {
  const ctx = await getCtx();
  if (!ctx.nav.kelola) notFound();
  const tools = [
    { href: holdingsWith(ctx, 'pengguna').length > 0 ? '/kelola/pengguna' : '/kelola/akses', title: 'Manajemen pengguna', text: 'Pengguna, grup, peran admin, dan ikhtisar izin. Akses board per unit, grup, atau orang diatur dari menu board.', show: holdingsWith(ctx, 'pengguna').length > 0 || isSuper(ctx) },
    { href: '/kelola/belajar', title: 'Pembelajaran', text: 'Kursus dari card SOP, video, dan kuis. Penugasan, katalog, dan pemantauan peserta.', show: holdingsWith(ctx, 'pembelajaran').length > 0 },
    { href: '/pengaturan', title: 'Pengaturan', text: 'Istilah SOP: Board, Library, Playbook, dan Card.', show: isSuper(ctx) },
  ].filter((t) => t.show);
  return (
    <Shell ctx={ctx} active="kelola">
      <h1 className="page-title">Kelola</h1>
      <div className="grid">
        {tools.map((t) => (
          <Link key={t.href} href={t.href} className="glass card" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
            <h2 style={{ fontSize: 20, color: 'var(--p)' }}>{t.title}</h2>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>{t.text}</p>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
