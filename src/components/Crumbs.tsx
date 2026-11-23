import Link from 'next/link';

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Lokasi" className="crumbs">
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', gap: 8 }}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.href ? <Link href={it.href}>{it.label}</Link> : <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
