'use client';
import { useEffect, useRef, useState, useTransition, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { reorder } from '@/app/kelola/sop/actions';

type Item = { id: string; node: ReactNode };

// Daftar yang urutannya bisa diubah dengan menarik item itu sendiri (atas dan bawah, atau kanan dan kiri).
// Urutan baru disimpan saat dilepas. Tanpa gagang supaya tidak memakan tempat.
export function Sortable({ kind, items, axis = 'y', className, style, label }: {
  kind: 'library' | 'playbook' | 'card'; items: Item[]; axis?: 'x' | 'y'; className?: string; style?: CSSProperties; label: string;
}) {
  const router = useRouter();
  const ids = items.map((i) => i.id);
  const key = ids.join(',');
  const [order, setOrder] = useState(ids);
  const [dragging, setDragging] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [, startT] = useTransition();
  const drag = useRef<string | null>(null);
  const before = useRef('');
  useEffect(() => { setOrder(key ? key.split(',') : []); }, [key]);
  const byId = new Map(items.map((i) => [i.id, i]));

  function save(next: string[]) {
    startT(async () => {
      const r = await reorder(kind, next);
      if (r.error) { setErr(r.error); setOrder(key ? key.split(',') : []); } else { setErr(''); router.refresh(); }
    });
  }

  function over(e: DragEvent<HTMLElement>, id: string) {
    const d = drag.current;
    if (!d || d === id) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const after = axis === 'y' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    setOrder((prev) => {
      const rest = prev.filter((x) => x !== d);
      const at = rest.indexOf(id);
      if (at < 0) return prev;
      rest.splice(at + (after ? 1 : 0), 0, d);
      return rest.join(',') === prev.join(',') ? prev : rest;
    });
  }

  function end() {
    const was = drag.current;
    drag.current = null;
    setDragging(null);
    if (was && order.join(',') !== before.current) save(order);
  }

  return (
    <>
      <div className={className} style={style} role="list" aria-label={label}>
        {order.map((id) => {
          const it = byId.get(id);
          if (!it) return null;
          return (
            <div
              key={id}
              role="listitem"
              className={`sortable-item ${axis}${dragging === id ? ' dragging' : ''}`}
              onMouseDown={(e) => {
                // Seluruh item bisa ditarik, kecuali saat mengetik atau memakai formulir di dalamnya.
                e.currentTarget.draggable = !(e.target as HTMLElement).closest('form, details, input, textarea, select, button');
              }}
              onDragStart={(e) => {
                e.stopPropagation(); // daftar di dalam daftar: hanya item yang ditarik
                drag.current = id; before.current = order.join(','); setDragging(id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
              }}
              onDragEnd={end}
              onDragOver={(e) => over(e, id)}
              onDrop={(e) => e.preventDefault()}
            >
              {it.node}
            </div>
          );
        })}
      </div>
      {err && <div className="alert err" role="alert">{err}</div>}
    </>
  );
}
