'use client';
import { useForm } from '@/components/use-form';
import { Notice } from '../ui';
import { PersonPicker } from '../sop/target';
import { addMember, createGroup, deleteGroup, removeMember, renameGroup, type St } from './actions';
import type { FormEvent, ReactNode } from 'react';

type Action = (prev: St, fd: FormData) => Promise<St>;

function Form({ action, hidden, children, submit, variant = 'btn', confirm, resetOnOk, row }: {
  action: Action; hidden?: Record<string, string>; children?: ReactNode; submit: string; variant?: 'btn' | 'btn sec'; confirm?: string; resetOnOk?: boolean; row?: boolean;
}) {
  const [st, onSubmit, pending] = useForm<St>(action, {}, { resetOnOk });
  const guarded = (e: FormEvent<HTMLFormElement>) => {
    if (confirm && !window.confirm(confirm)) { e.preventDefault(); return; }
    onSubmit(e);
  };
  return (
    <form method="post" onSubmit={guarded} style={{ display: 'flex', flexDirection: row ? 'row' : 'column', flexWrap: 'wrap', gap: 10, alignItems: row ? 'center' : 'stretch' }}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button className={variant} type="submit" disabled={pending} style={{ alignSelf: row ? 'center' : 'flex-start', minHeight: row ? 36 : 44, padding: row ? '0 12px' : undefined }}>
        {pending ? 'Menyimpan...' : submit}
      </button>
      {(st.error || st.ok) && <div style={{ flexBasis: '100%' }}><Notice error={st.error} ok={st.ok} /></div>}
    </form>
  );
}

export const CreateGroupForm = ({ holdings }: { holdings: { id: string; name: string }[] }) => (
  <Form action={createGroup} submit="Buat grup">
    <label className="field"><span>Holding</span>
      <select className="input" name="holding" required>{holdings.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
    </label>
    <label className="field"><span>Nama grup</span><input className="input" name="nama" required maxLength={60} /></label>
  </Form>
);

export const RenameGroupForm = ({ id, name }: { id: string; name: string }) => (
  <Form action={renameGroup} hidden={{ id }} submit="Simpan nama">
    <label className="field"><span>Nama grup</span><input className="input" name="nama" defaultValue={name} required maxLength={60} /></label>
  </Form>
);

export const DeleteGroupForm = ({ id }: { id: string }) => (
  <Form action={deleteGroup} hidden={{ id }} submit="Hapus grup" variant="btn sec" confirm="Hapus grup ini? Akses board dan penugasan baca yang memakai grup ini ikut hilang." />
);

export const AddMemberForm = ({ id, holding }: { id: string; holding: string }) => (
  <Form action={addMember} hidden={{ id }} submit="Tambah anggota" resetOnOk>
    <PersonPicker holding={holding} />
  </Form>
);

export const RemoveMemberForm = ({ id, person }: { id: string; person: string }) => (
  <Form action={removeMember} hidden={{ id, orang: person }} submit="Keluarkan" variant="btn sec" confirm="Keluarkan orang ini dari grup?" row />
);
