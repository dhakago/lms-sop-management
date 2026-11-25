'use client';
import type { FormEvent, ReactNode } from 'react';
import { useForm } from '@/components/use-form';
import { Notice } from '../ui';
import { addCard, addLibrary, addPlaybook, addRequirement, createBoard, move, removeCard, removeNode, removeRequirement, rename, toggleArchive, updateBoard, type St } from './actions';

type Action = (prev: St, fd: FormData) => Promise<St>;

// Formulir generik: kolom hidden, isi bebas, satu tombol kirim, pesan hasil.
function Form({ action, hidden, children, submit, wait, variant = 'btn', confirm, resetOnOk, row }: {
  action: Action; hidden?: Record<string, string>; children?: ReactNode; submit: string; wait?: string;
  variant?: 'btn' | 'btn sec'; confirm?: string; resetOnOk?: boolean; row?: boolean;
}) {
  const [st, onSubmit, pending] = useForm<St>(action, {}, { resetOnOk });
  const guarded = (e: FormEvent<HTMLFormElement>) => {
    if (confirm && !window.confirm(confirm)) { e.preventDefault(); return; }
    onSubmit(e);
  };
  return (
    <form onSubmit={guarded} style={{ display: 'flex', flexDirection: row ? 'row' : 'column', flexWrap: 'wrap', gap: 10, alignItems: row ? 'center' : 'stretch' }}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button className={variant} type="submit" disabled={pending} style={{ alignSelf: row ? 'center' : 'flex-start', minHeight: row ? 36 : 44, padding: row ? '0 12px' : undefined }}>
        {pending ? (wait ?? 'Menyimpan...') : submit}
      </button>
      {(st.error || st.ok) && <div style={{ flexBasis: '100%' }}><Notice error={st.error} ok={st.ok} /></div>}
    </form>
  );
}

const Field = ({ label, name, defaultValue, required, max, type = 'text', list }: { label: string; name: string; defaultValue?: string; required?: boolean; max?: number; type?: string; list?: string }) => (
  <label className="field"><span>{label}</span><input className="input" name={name} defaultValue={defaultValue} required={required} maxLength={max} type={type} list={list} /></label>
);

export function BoardForm({ id, name, description, owner, holdings, checked, labels }: {
  id?: string; name?: string; description?: string; owner?: string;
  holdings: { id: string; name: string }[]; checked: string[]; labels: { board: string };
}) {
  return (
    <Form action={id ? updateBoard : createBoard} hidden={id ? { id } : undefined} submit={id ? 'Simpan' : `Buat ${labels.board.toLowerCase()}`}>
      <Field label="Nama" name="nama" defaultValue={name} required max={64} />
      <Field label="Deskripsi (opsional)" name="deskripsi" defaultValue={description} />
      <Field label="Pemilik proses (teks saja, opsional)" name="pemilik" defaultValue={owner} max={80} />
      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px' }}>
        <legend style={{ fontWeight: 600, fontSize: 14, padding: '0 6px' }}>Dibuka untuk holding</legend>
        <div className="row">
          {holdings.map((h) => (
            <label key={h.id} className="row" style={{ gap: 8, minHeight: 44 }}>
              <input type="checkbox" name={`h_${h.id}`} defaultChecked={checked.includes(h.id)} style={{ width: 22, height: 22 }} />
              {h.name}
            </label>
          ))}
        </div>
        <p className="muted" style={{ margin: '4px 0 0' }}>Hanya holding yang akses SOP-nya Anda miliki yang muncul di sini.</p>
      </fieldset>
    </Form>
  );
}

export const ArchiveForm = ({ id, archived }: { id: string; archived: boolean }) => (
  <Form action={toggleArchive} hidden={{ id, arsip: archived ? '0' : '1' }} submit={archived ? 'Buka kembali' : 'Arsipkan'} variant="btn sec" confirm={archived ? undefined : 'Arsipkan board ini? Pembaca tidak akan melihatnya lagi.'} />
);

export const AddLibraryForm = ({ board, label }: { board: string; label: string }) => (
  <Form action={addLibrary} hidden={{ board }} submit={`Tambah ${label.toLowerCase()}`} resetOnOk>
    <Field label={`Nama ${label.toLowerCase()}`} name="nama" required max={64} />
    <Field label="Deskripsi (opsional)" name="deskripsi" />
  </Form>
);

export const AddPlaybookForm = ({ library, label }: { library: string; label: string }) => (
  <Form action={addPlaybook} hidden={{ library }} submit={`Tambah ${label.toLowerCase()}`} variant="btn sec" resetOnOk>
    <Field label={`Nama ${label.toLowerCase()}`} name="nama" required max={64} />
  </Form>
);

export const RenameForm = ({ kind, id, name, description }: { kind: 'library' | 'playbook'; id: string; name: string; description: string }) => (
  <Form action={rename} hidden={{ jenis: kind, id }} submit="Simpan nama">
    <Field label="Nama" name="nama" defaultValue={name} required max={64} />
    <Field label="Deskripsi (opsional)" name="deskripsi" defaultValue={description} />
  </Form>
);

export const RemoveNodeForm = ({ kind, id, what }: { kind: 'library' | 'playbook'; id: string; what: string }) => (
  <Form action={removeNode} hidden={{ jenis: kind, id }} submit="Hapus" variant="btn sec" confirm={`Hapus ${what} ini beserta isinya?`} row />
);

export const MoveButtons = ({ kind, id }: { kind: 'library' | 'playbook' | 'card'; id: string }) => (
  <span className="row" style={{ gap: 4 }}>
    <Form action={move} hidden={{ jenis: kind, id, arah: 'naik' }} submit="Naik" variant="btn sec" row />
    <Form action={move} hidden={{ jenis: kind, id, arah: 'turun' }} submit="Turun" variant="btn sec" row />
  </span>
);

export const AddCardForm = ({ playbook, label }: { playbook: string; label: string }) => (
  <Form action={addCard} hidden={{ playbook }} submit={`Buat ${label.toLowerCase()} dan mulai menulis`} wait="Membuat...">
    <Field label="Judul" name="judul" required max={120} />
  </Form>
);

export const RemoveCardForm = ({ id }: { id: string }) => (
  <Form action={removeCard} hidden={{ id }} submit="Hapus draf" variant="btn sec" confirm="Hapus draf ini?" row />
);

export const AddRequirementForm = ({ playbook, holdings, units }: { playbook: string; holdings: { id: string; name: string }[]; units: string[] }) => (
  <Form action={addRequirement} hidden={{ playbook }} submit="Tambah target" resetOnOk>
    <label className="field">
      <span>Holding</span>
      <select className="input" name="holding" required>{holdings.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
    </label>
    <Field label="Unit (kosongkan untuk semua unit)" name="unit" list="unit-list" max={80} />
    <datalist id="unit-list">{units.map((u) => <option key={u} value={u} />)}</datalist>
    <Field label="Batas tanggal" name="batas" type="date" required />
  </Form>
);

export const RemoveRequirementForm = ({ id }: { id: string }) => (
  <Form action={removeRequirement} hidden={{ id }} submit="Hapus" variant="btn sec" confirm="Hapus target ini?" row />
);
