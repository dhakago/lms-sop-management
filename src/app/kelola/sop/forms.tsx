'use client';
import { useEffect, type FormEvent, type ReactNode } from 'react';
import { useDialogClose } from '@/app/sop/Pop';
import { useForm } from '@/components/use-form';
import { Notice } from '../ui';
import { TargetPicker, type GroupOpt } from './target';
import { PermField } from '@/app/sop/permissions';
import type { PermOptions, PermState } from '@/lib/perm-types';
import { addCard, addLibrary, addPlaybook, addRequirement, createBoard, move, removeCard, removeNode, removeRequirement, rename, toggleArchive, updateBoard, type St } from './actions';

type Action = (prev: St, fd: FormData) => Promise<St>;

// Formulir generik: kolom hidden, isi bebas, satu tombol kirim, pesan hasil.
export function Form({ action, hidden, children, submit, wait, variant = 'btn', confirm, resetOnOk, row }: {
  action: Action; hidden?: Record<string, string>; children?: ReactNode; submit: string; wait?: string;
  variant?: 'btn' | 'btn sec'; confirm?: string; resetOnOk?: boolean; row?: boolean;
}) {
  const [st, onSubmit, pending] = useForm<St>(action, {}, { resetOnOk });
  const closeDialog = useDialogClose();
  useEffect(() => { if (st.ok) closeDialog?.(); }, [st.ok]); // eslint-disable-line react-hooks/exhaustive-deps
  const guarded = (e: FormEvent<HTMLFormElement>) => {
    if (confirm && !window.confirm(confirm)) { e.preventDefault(); return; }
    onSubmit(e);
  };
  return (
    <form method="post" onSubmit={guarded} style={{ display: 'flex', flexDirection: row ? 'row' : 'column', flexWrap: 'wrap', gap: 10, alignItems: row ? 'center' : 'stretch' }}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button className={variant} type="submit" disabled={pending} style={{ alignSelf: row ? 'center' : 'flex-start', minHeight: row ? 36 : 44, padding: row ? '0 12px' : undefined }}>
        {pending ? (wait ?? 'Menyimpan...') : submit}
      </button>
      {(st.error || st.ok) && <div style={{ flexBasis: '100%' }}><Notice error={st.error} ok={st.ok} /></div>}
    </form>
  );
}

export const Field = ({ label, name, defaultValue, required, max, type = 'text', list }: { label: string; name: string; defaultValue?: string; required?: boolean; max?: number; type?: string; list?: string }) => (
  <label className="field"><span>{label}</span><input className="input" name={name} defaultValue={defaultValue} required={required} maxLength={max} type={type} list={list} /></label>
);

type Perm = { init: PermState; options: PermOptions };

export function BoardForm({ id, name, description, owner, labels, perm }: {
  id?: string; name?: string; description?: string; owner?: string; labels: { board: string }; perm: Perm;
}) {
  return (
    <Form action={id ? updateBoard : createBoard} hidden={id ? { id } : undefined} submit={id ? 'Simpan' : `Buat ${labels.board.toLowerCase()}`}>
      <Field label="Nama" name="nama" defaultValue={name} required max={64} />
      <Field label="Deskripsi (opsional)" name="deskripsi" defaultValue={description} />
      <Field label="Pemilik proses (teks saja, opsional)" name="pemilik" defaultValue={owner} max={80} />
      <PermField init={perm.init} options={perm.options} />
    </Form>
  );
}

export const ArchiveForm = ({ id, archived }: { id: string; archived: boolean }) => (
  <Form action={toggleArchive} hidden={{ id, arsip: archived ? '0' : '1' }} submit={archived ? 'Buka kembali' : 'Arsipkan'} variant="btn sec" confirm={archived ? undefined : 'Arsipkan board ini? Pembaca tidak akan melihatnya lagi.'} />
);

export const LibraryForm = ({ board, id, name, description, label, perm }: { board?: string; id?: string; name?: string; description?: string; label: string; perm: Perm }) => (
  <Form action={id ? rename : addLibrary} hidden={id ? { jenis: 'library', id } : { board: board! }} submit={id ? 'Simpan' : 'Buat'} resetOnOk={!id}>
    <Field label={`Nama ${label.toLowerCase()}`} name="nama" defaultValue={name} required max={64} />
    <Field label="Deskripsi (opsional)" name="deskripsi" defaultValue={description} />
    <PermField init={perm.init} options={perm.options} />
  </Form>
);

export const REVIEW_OPTIONS: [string, string][] = [['never', 'Tidak pernah'], ['1w', 'Tiap minggu'], ['2w', 'Tiap 2 minggu'], ['1m', 'Tiap bulan'], ['3m', 'Tiap 3 bulan'], ['6m', 'Tiap 6 bulan'], ['1y', 'Tiap tahun'], ['3y', 'Tiap 3 tahun']];

// Buat atau ubah playbook: nama, deskripsi, ahli, interval review, saklar terbit, dan Permissions (seperti Whale).
export const PlaybookForm = ({ library, id, name, description, label, expert, interval, published, admins, perm }: {
  library?: string; id?: string; name?: string; description?: string; label: string; expert?: string | null; interval?: string; published?: boolean;
  admins: { id: string; name: string }[]; perm: Perm;
}) => (
  <Form action={id ? rename : addPlaybook} hidden={id ? { jenis: 'playbook', id } : { library: library! }} submit={id ? 'Simpan' : 'Buat'} resetOnOk={!id}>
    <Field label={`Nama ${label.toLowerCase()}`} name="nama" defaultValue={name} required max={64} />
    <Field label="Deskripsi (opsional)" name="deskripsi" defaultValue={description} />
    <fieldset style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', display: 'grid', gap: 10 }}>
      <legend style={{ fontWeight: 600, fontSize: 14, padding: '0 6px' }}>Pengaturan</legend>
      <label className="field"><span>Ahli (penanggung jawab isi)</span>
        <select className="input" name="ahli" defaultValue={expert ?? ''}>
          <option value="">Belum ditentukan</option>
          {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="field"><span>Interval review</span>
        <select className="input" name="interval" defaultValue={interval ?? '3m'}>
          {REVIEW_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>
      <label className="row" style={{ gap: 10, minHeight: 44 }}>
        <input type="checkbox" name="terbit" defaultChecked={published ?? true} style={{ width: 22, height: 22 }} />
        <span><b>Terbit</b><br /><span className="muted" style={{ fontSize: 13 }}>Bila dimatikan, {label.toLowerCase()} ini disembunyikan: peserta tidak bisa melihat atau mencari isinya.</span></span>
      </label>
    </fieldset>
    <PermField init={perm.init} options={perm.options} />
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

export const AddRequirementForm = ({ playbook, holdings, units, groups }: { playbook: string; holdings: { id: string; name: string }[]; units: string[]; groups: GroupOpt[] }) => (
  <Form action={addRequirement} hidden={{ playbook }} submit="Tugaskan" resetOnOk>
    <TargetPicker holdings={holdings} units={units} groups={groups} kinds={['holding', 'group', 'user']} />
    <Field label="Batas tanggal" name="batas" type="date" required />
  </Form>
);

export const RemoveRequirementForm = ({ id }: { id: string }) => (
  <Form action={removeRequirement} hidden={{ id }} submit="Cabut" variant="btn sec" confirm="Cabut penugasan ini?" row />
);
