import Link from 'next/link';
import type { Ctx } from '@/lib/session';
import { holdingsWith, isSuper } from '@/lib/authz';

// Tab "Manajemen pengguna": Pengguna, Grup, Peran (akses admin), Ikhtisar izin.
export function UserTabs({ ctx, active }: { ctx: Ctx; active: 'pengguna' | 'grup' | 'peran' | 'izin' }) {
  const canUsers = holdingsWith(ctx, 'pengguna').length > 0;
  const items = [
    { key: 'pengguna', label: 'Pengguna', href: '/kelola/pengguna', show: canUsers },
    { key: 'grup', label: 'Grup', href: '/kelola/grup', show: canUsers },
    { key: 'peran', label: 'Peran', href: '/kelola/akses', show: isSuper(ctx) },
    { key: 'izin', label: 'Ikhtisar izin', href: '/kelola/izin', show: canUsers },
  ].filter((i) => i.show);
  return (
    <nav aria-label="Manajemen pengguna" className="row" style={{ gap: 8, marginBottom: 14 }}>
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={active === i.key ? 'page' : undefined} className={active === i.key ? 'pill' : 'btn sec'}
          style={{ textDecoration: 'none', minHeight: 36, padding: '0 16px', borderRadius: 999, fontSize: 14 }}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
