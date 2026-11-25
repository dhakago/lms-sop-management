'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { Notice, SecretBox } from '../../ui';
import { createUser, type CreateState } from '../actions';

export function NewUserForm({ holdings, initial }: { holdings: { id: string; name: string }[]; initial: string }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createUser, {});

  if (state.done) {
    const d = state.done;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Notice ok={`${d.name} (${d.employeeNo}) berhasil dibuat. Masuk dengan ${d.loginId}.`} />
        <SecretBox label="Kata sandi sementara, tampil sekali saja" value={d.password} />
        <p className="muted" style={{ margin: 0 }}>Berikan ke yang bersangkutan. Saat masuk pertama ia diminta membuat kata sandi sendiri.</p>
        <div className="row">
          <a className="btn" href="/kelola/pengguna/baru">Tambah pengguna lain</a>
          <Link className="btn sec" href="/kelola/pengguna">Kembali ke daftar</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice error={state.error} />
      <label className="field"><span>Nama lengkap</span><input className="input" name="nama" required maxLength={100} /></label>
      <label className="field"><span>Nomor induk</span><input className="input" name="nomor_induk" placeholder="SIB-0142" required /></label>
      <label className="field"><span>Nomor HP atau email (untuk masuk)</span><input className="input" name="login" inputMode="email" autoComplete="off" placeholder="0812 3456 7890" required /></label>
      <label className="field">
        <span>Holding</span>
        <select className="input" name="holding" defaultValue={initial} required>
          {holdings.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
      <label className="field"><span>Unit</span><input className="input" name="unit" /></label>
      <label className="field"><span>Jabatan</span><input className="input" name="jabatan" /></label>
      <label className="field"><span>Nomor induk atasan langsung (opsional)</span><input className="input" name="atasan" placeholder="SIB-0100" /></label>
      <label className="field">
        <span>Kata sandi sementara (kosongkan agar dibuat otomatis)</span>
        <PasswordInput name="sandi" autoComplete="new-password" />
      </label>
      <button className="btn" type="submit" disabled={pending} style={{ minHeight: 52, fontSize: 16 }}>
        {pending ? 'Menyimpan...' : 'Simpan pengguna'}
      </button>
    </form>
  );
}
