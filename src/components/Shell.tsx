import { cookies } from 'next/headers';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { themeVars } from '@/lib/theme';
import type { Ctx } from '@/lib/session';
import { setHolding, signOut } from '@/app/actions';
import { THEMES } from '@/lib/theme';

type NavItem = { key: string; label: string; href: string; icon: string; show: boolean };

export async function Shell({ ctx, active, children }: { ctx: Ctx; active: string; children: React.ReactNode }) {
  const lite = (await cookies()).get('lite')?.value === '1';
  const items: NavItem[] = [
    { key: 'beranda', label: 'Beranda', href: '/', icon: 'home', show: true },
    { key: 'sop', label: 'SOP dan prosedur', href: '/sop', icon: 'sop', show: true },
    { key: 'belajar', label: 'Pembelajaran', href: '/belajar', icon: 'cap', show: true },
    { key: 'tim', label: 'Tim', href: '/tim', icon: 'people', show: ctx.nav.tim },
    { key: 'analitik', label: 'Analitik', href: '/analitik', icon: 'bars', show: ctx.nav.analitik },
  ];
  const mobile: NavItem[] = [
    { key: 'beranda', label: 'Beranda', href: '/', icon: 'home', show: true },
    { key: 'sop', label: 'SOP', href: '/sop', icon: 'sop', show: true },
    { key: 'belajar', label: 'Belajar', href: '/belajar', icon: 'cap', show: true },
    { key: 'akun', label: 'Akun', href: '/profil', icon: 'user', show: true },
  ];

  const popover = (
    <div className="pop" role="menu" aria-label="Menu profil">
      <div className="who">
        <b style={{ display: 'block' }}>{ctx.profile.full_name}</b>
        <span className="muted">
          {ctx.profile.employee_no}
          {ctx.memberships.find((m) => m.holding_id === ctx.holding)?.job_title
            ? `, ${ctx.memberships.find((m) => m.holding_id === ctx.holding)?.job_title}`
            : ''}
        </span>
      </div>
      {ctx.nav.ganti && (
        <form action={setHolding}>
          <div className="muted" style={{ padding: '6px 12px' }}>Ganti holding</div>
          {ctx.holdings.map((h) => (
            <button key={h} name="holding" value={h} type="submit" aria-current={h === ctx.holding ? 'true' : undefined}>
              <Icon name="swap" size={18} />
              {THEMES[h].name}
              {h === ctx.holding ? ' (aktif)' : ''}
            </button>
          ))}
        </form>
      )}
      <Link href="/profil" role="menuitem"><Icon name="user" size={18} /> Profil saya</Link>
      {ctx.nav.pengaturan && <Link href="/pengaturan" role="menuitem"><Icon name="gear" size={18} /> Pengaturan</Link>}
      <form action={signOut} style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}>
        <button type="submit" role="menuitem"><Icon name="exit" size={18} /> Keluar</button>
      </form>
    </div>
  );

  return (
    <div className={`shell${lite ? ' lite' : ''}`} style={themeVars(ctx.theme) as React.CSSProperties}>
      <div className="blob" aria-hidden="true" style={{ left: -140, top: -120, width: 560, height: 560, background: 'var(--p)', filter: 'blur(100px)', opacity: 0.38 }} />
      <div className="blob" aria-hidden="true" style={{ right: -120, top: 140, width: 480, height: 480, background: 'var(--a)', filter: 'blur(100px)', opacity: 0.5 }} />
      <nav className="rail" aria-label="Modul">
        <div className="mono" aria-hidden="true">{ctx.theme.mono}</div>
        {items.filter((i) => i.show).map((i) => (
          <Link key={i.key} href={i.href} className="item" aria-label={i.label} title={i.label} aria-current={active === i.key ? 'page' : undefined}>
            <Icon name={i.icon} />
          </Link>
        ))}
        <div className="bottom">
          <details className="menu">
            <summary className="avatar" aria-label="Menu profil">{ctx.initials}</summary>
            {popover}
          </details>
        </div>
      </nav>
      <main className="main" id="isi">
        <div className="topbar-m">
          <strong style={{ fontFamily: 'var(--head)', fontSize: 18, color: 'var(--p)' }}>{ctx.theme.name}</strong>
          <details className="menu">
            <summary className="avatar" aria-label="Menu profil">{ctx.initials}</summary>
            {popover}
          </details>
        </div>
        {children}
      </main>
      <nav className="bnav" aria-label="Menu utama">
        {mobile.map((i) => (
          <Link key={i.key} href={i.href} aria-current={(active === i.key || (i.key === 'akun' && active === 'profil')) ? 'page' : undefined}>
            <Icon name={i.icon} size={24} />
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
