'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Pop';
import { findPeople } from '@/app/kelola/sop/actions';
import type { PermHolding, PermOptions, PermPayload, PermState } from '@/lib/perm-types';
import type { Person } from '@/lib/people';

// Tombol "Permissions" di form buat dan ubah Board, Library, dan Playbook, seperti Whale.
// Perubahan ditahan di form dan dikirim bersama tombol Simpan lewat kolom tersembunyi "izin".
export function PermField({ init, options }: { init: PermState; options: PermOptions }) {
  const [state, setState] = useState<PermState>(init);
  const [open, setOpen] = useState(false);
  const noun = options.nodeLabel.toLowerCase();

  const payload: PermPayload = useMemo(() => ({
    holdings: state.holdings.filter((h) => !h.locked).map((h) => ({ id: h.id, all: h.all, rows: h.rows.map((r) => ({ type: r.type, value: r.value })) })),
    writers: options.canWriters ? state.writers.map((w) => w.id) : null,
  }), [state, options.canWriters]);

  const summary = state.holdings.map((h) => {
    const t = h.all ? 'semua pengguna' : h.rows.length ? `${h.rows.length} pembatasan` : 'tanpa akses';
    return `${h.name}: ${t}`;
  }).join(' · ');

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <input type="hidden" name="izin" value={JSON.stringify(payload)} />
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 14 }}>Permissions</b>
        <span className="muted" style={{ fontSize: 13 }}>Atur siapa yang boleh membaca dan mengubah {noun} ini.</span>
        {summary && <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{summary}</span>}
      </div>
      <button type="button" className="btn sec" style={{ minHeight: 40, borderRadius: 999 }} onClick={() => setOpen(true)}>Permissions</button>
      {open && <PermDialog state={state} options={options} onCancel={() => setOpen(false)} onSave={(s) => { setState(s); setOpen(false); }} />}
    </div>
  );
}

const ROLE = { reader: 'Pembaca', none: 'Tanpa akses' };

function PermDialog({ state, options, onCancel, onSave }: { state: PermState; options: PermOptions; onCancel: () => void; onSave: (s: PermState) => void }) {
  const [draft, setDraft] = useState<PermState>(state);
  const noun = options.nodeLabel.toLowerCase();
  const setHolding = (id: string, f: (h: PermHolding) => PermHolding) => setDraft((d) => ({ ...d, holdings: d.holdings.map((h) => (h.id === id ? f(h) : h)) }));

  return (
    <Modal title="Izin dan hak akses" onClose={onCancel}>
      <div style={{ display: 'grid', gap: 16 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {options.kind === 'board' || options.kind === 'course'
            ? `Pilih holding yang boleh membuka ${noun} ini. Tanpa pembatasan, semua orang di holding itu bisa membaca. PEOPLE selalu ikut.`
            : `${options.nodeLabel} hanya bisa dipersempit dari apa yang dibuka oleh board. Tanpa pembatasan, semua yang bisa membuka board bisa membaca.`}
        </p>
        {draft.holdings.length === 0 && <p className="muted">Belum ada holding yang bisa diatur.</p>}
        {draft.holdings.map((h) => (
          <section key={h.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px' }}>
            <div className="row between" style={{ gap: 10 }}>
              <div><b>Semua pengguna {h.name}</b>{h.locked && <span className="muted" style={{ display: 'block', fontSize: 12 }}>Akses SOP untuk holding ini tidak Anda miliki, jadi tidak bisa diubah.</span>}</div>
              <select className="input" style={{ width: 150, minHeight: 40 }} disabled={h.locked} aria-label={`Semua pengguna ${h.name}`}
                value={h.all ? 'reader' : 'none'} onChange={(e) => setHolding(h.id, (x) => ({ ...x, all: e.target.value === 'reader', rows: e.target.value === 'reader' ? [] : x.rows }))}>
                <option value="reader">{ROLE.reader}</option><option value="none">{ROLE.none}</option>
              </select>
            </div>
            {h.rows.length > 0 && (
              <div className="list" style={{ marginTop: 6 }}>
                {h.rows.map((r) => (
                  <div key={`${r.type}:${r.value}`} className="list-row" style={{ padding: '8px 0' }}>
                    <div className="grow"><b style={{ fontSize: 14 }}>{r.label}</b><span className="muted" style={{ fontSize: 12 }}>{r.type === 'unit' ? 'Unit' : r.type === 'group' ? 'Grup' : 'Orang'} · {ROLE.reader}</span></div>
                    {!h.locked && <button type="button" className="btn sec" style={{ minHeight: 34, padding: '0 10px' }} onClick={() => setHolding(h.id, (x) => ({ ...x, rows: x.rows.filter((y) => y !== r) }))}>Cabut</button>}
                  </div>
                ))}
              </div>
            )}
            {!h.locked && (
              <AddRow holding={h} options={options}
                onAdd={(r) => setHolding(h.id, (x) => (x.rows.some((y) => y.type === r.type && y.value === r.value) ? x : { ...x, all: false, rows: [...x.rows, r] }))} />
            )}
          </section>
        ))}

        {options.canWriters && (
          <section style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px' }}>
            <b>Penulis</b>
            <p className="muted" style={{ margin: '2px 0 6px', fontSize: 13 }}>
              {draft.writers.length === 0 ? `Semua admin yang berhak bisa mengubah ${noun} ini.` : `Hanya admin di daftar ini (dan superadmin) yang bisa mengubah ${noun} ini.`}
            </p>
            {draft.writers.map((w) => (
              <div key={w.id} className="list-row" style={{ padding: '6px 0' }}>
                <div className="grow"><b style={{ fontSize: 14 }}>{w.label}</b></div>
                <button type="button" className="btn sec" style={{ minHeight: 34, padding: '0 10px' }} onClick={() => setDraft((d) => ({ ...d, writers: d.writers.filter((x) => x.id !== w.id) }))}>Cabut</button>
              </div>
            ))}
            <select className="input" style={{ minHeight: 40, marginTop: 6 }} value="" aria-label="Tambah Penulis"
              onChange={(e) => { const a = options.admins.find((x) => x.id === e.target.value); if (a) setDraft((d) => (d.writers.some((x) => x.id === a.id) ? d : { ...d, writers: [...d.writers, { id: a.id, label: a.name }] })); }}>
              <option value="">Tambah Penulis</option>
              {options.admins.filter((a) => !draft.writers.some((w) => w.id === a.id)).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.employeeNo})</option>)}
            </select>
          </section>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn sec" onClick={onCancel}>Batal</button>
          <button type="button" className="btn" onClick={() => onSave(draft)}>Simpan</button>
        </div>
      </div>
    </Modal>
  );
}

// Tambah pembatasan di satu holding: unit, grup, atau orang.
function AddRow({ holding, options, onAdd }: { holding: PermHolding; options: PermOptions; onAdd: (r: { type: 'unit' | 'group' | 'user'; value: string; label: string }) => void }) {
  const [type, setType] = useState<'unit' | 'group' | 'user'>('group');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const seq = useRef(0);
  const units = options.units[holding.id] ?? [];
  const groups = options.groups.filter((g) => g.holding === holding.id);

  useEffect(() => {
    if (type !== 'user' || q.trim().length < 2) { setFound([]); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => { const r = await findPeople(holding.id, q); if (n === seq.current) setFound(r); }, 250);
    return () => clearTimeout(t);
  }, [q, type, holding.id]);

  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <select className="input" style={{ width: 120, minHeight: 40 }} value={type} onChange={(e) => { setType(e.target.value as typeof type); setQ(''); }} aria-label="Jenis">
          <option value="group">Grup</option><option value="unit">Unit</option><option value="user">Orang</option>
        </select>
        {type === 'group' && (
          <select className="input" style={{ flex: 1, minHeight: 40 }} value="" aria-label="Pilih grup"
            onChange={(e) => { const g = groups.find((x) => x.id === e.target.value); if (g) onAdd({ type: 'group', value: g.id, label: g.name }); }}>
            <option value="">{groups.length ? 'Tambah grup' : 'Belum ada grup di holding ini'}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {type === 'unit' && (
          <select className="input" style={{ flex: 1, minHeight: 40 }} value="" aria-label="Pilih unit"
            onChange={(e) => { if (e.target.value) onAdd({ type: 'unit', value: e.target.value, label: e.target.value }); }}>
            <option value="">{units.length ? 'Tambah unit' : 'Belum ada unit'}</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        {type === 'user' && <input className="input" style={{ flex: 1, minHeight: 40 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau nomor induk" autoComplete="off" />}
      </div>
      {type === 'user' && found.length > 0 && (
        <div className="list" role="listbox">
          {found.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected="false" className="list-row" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: '8px 0' }}
              onClick={() => { onAdd({ type: 'user', value: p.id, label: p.name }); setQ(''); setFound([]); }}>
              <div className="grow"><b style={{ fontSize: 14 }}>{p.name}</b><span className="muted" style={{ fontSize: 12 }}>{p.employeeNo}{p.unit ? `, ${p.unit}` : ''}</span></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
