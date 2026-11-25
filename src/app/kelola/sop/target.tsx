'use client';
import { useEffect, useRef, useState } from 'react';
import { findPeople } from './actions';
import type { Person } from '@/lib/people';

export type GroupOpt = { id: string; name: string; holding: string; holdingName: string };
type Kind = 'holding' | 'unit' | 'group' | 'user';
const LABEL: Record<Kind, string> = { holding: 'Holding atau unit', unit: 'Unit', group: 'Grup', user: 'Orang' };

// Pilih sasaran: seluruh holding atau unit, satu grup, atau satu orang. Mengisi kolom jenis, holding, unit, grup, dan orang.
export function TargetPicker({ holdings, units, groups, kinds }: {
  holdings: { id: string; name: string }[]; units: string[]; groups: GroupOpt[]; kinds: Kind[];
}) {
  const [kind, setKind] = useState<Kind>(kinds[0]!);
  const [holding, setHolding] = useState(holdings[0]?.id ?? '');
  const hasUnit = kind === 'holding' || kind === 'unit';
  const visibleGroups = groups.filter((g) => holdings.some((h) => h.id === g.holding));
  return (
    <>
      <label className="field">
        <span>Sasaran</span>
        <select className="input" name="jenis" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {kinds.map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}
        </select>
      </label>
      {kind !== 'group' && (
        <label className="field">
          <span>Holding</span>
          <select className="input" name="holding" value={holding} onChange={(e) => setHolding(e.target.value)} required>
            {holdings.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      )}
      {hasUnit && (
        <label className="field">
          <span>{kind === 'holding' ? 'Unit (kosongkan untuk semua unit)' : 'Unit'}</span>
          <input className="input" name="unit" list="unit-opts" maxLength={80} required={kind === 'unit'} />
          <datalist id="unit-opts">{units.map((u) => <option key={u} value={u} />)}</datalist>
        </label>
      )}
      {kind === 'group' && (
        <label className="field">
          <span>Grup</span>
          <select className="input" name="grup" required defaultValue="">
            <option value="" disabled>{visibleGroups.length ? 'Pilih grup' : 'Belum ada grup. Buat di Pengaturan, Manajemen pengguna.'}</option>
            {visibleGroups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.holdingName})</option>)}
          </select>
        </label>
      )}
      {kind === 'user' && <PersonPicker holding={holding} />}
    </>
  );
}

// Cari orang di satu holding. Hasil dipilih dengan klik dan disimpan di kolom tersembunyi "orang".
export function PersonPicker({ holding }: { holding: string }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const seq = useRef(0);
  useEffect(() => { setPicked(null); setFound([]); }, [holding]);
  useEffect(() => {
    if (picked || q.trim().length < 2) { setFound([]); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await findPeople(holding, q);
      if (n === seq.current) setFound(r);
    }, 250);
    return () => clearTimeout(t);
  }, [q, holding, picked]);
  return (
    <div className="field">
      <span>Orang</span>
      <input type="hidden" name="orang" value={picked?.id ?? ''} required />
      {picked ? (
        <div className="row" style={{ alignItems: 'center', gap: 10 }}>
          <b>{picked.name}</b><span className="muted">{picked.employeeNo}</span>
          <button type="button" className="btn sec" style={{ minHeight: 36, padding: '0 12px' }} onClick={() => { setPicked(null); setQ(''); }}>Ganti</button>
        </div>
      ) : (
        <>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik nama atau nomor induk" autoComplete="off" />
          {found.length > 0 && (
            <div className="list" role="listbox" style={{ marginTop: 6 }}>
              {found.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected="false" className="list-row" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setPicked(p)}>
                  <div className="grow"><b>{p.name}</b><span className="muted">{p.employeeNo}{p.unit ? `, ${p.unit}` : ''}</span></div>
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && found.length === 0 && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Tidak ada hasil di holding ini.</p>}
        </>
      )}
    </div>
  );
}
