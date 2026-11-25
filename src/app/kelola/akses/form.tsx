'use client';
import { useActionState } from 'react';
import { Notice } from '../ui';
import { saveAccess, type AccessState } from './actions';

export function AccessForm({ id, holdings, modules, granted }: {
  id: string;
  holdings: { id: string; name: string }[];
  modules: { id: string; label: string }[];
  granted: string[]; // "holding|modul"
}) {
  const [s, action, pending] = useActionState<AccessState, FormData>(saveAccess, {});
  const has = new Set(granted);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="id" value={id} />
      <Notice error={s.error} ok={s.ok} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--line)' }}>Holding</th>
              {modules.map((m) => <th key={m.id} style={{ padding: '8px 10px', borderBottom: '2px solid var(--line)' }}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{h.name}</td>
                {modules.map((m) => (
                  <td key={m.id} style={{ textAlign: 'center', padding: '8px 10px' }}>
                    <input
                      type="checkbox"
                      name={`a_${h.id}_${m.id}`}
                      defaultChecked={has.has(`${h.id}|${m.id}`)}
                      aria-label={`${m.label} di ${h.name}`}
                      style={{ width: 22, height: 22 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0 }}>Pengguna yang diberi minimal satu akses menjadi admin. Bila semua dicabut, ia kembali menjadi peserta. Perubahan tercatat di log audit.</p>
      <button className="btn" type="submit" disabled={pending} style={{ alignSelf: 'flex-start', minHeight: 48 }}>{pending ? 'Menyimpan...' : 'Simpan akses'}</button>
    </form>
  );
}
