'use client';
import { useActionState } from 'react';
import { changePassword, type PwState } from './actions';

export function PwForm() {
  const [state, action, pending] = useActionState<PwState, FormData>(changePassword, {});
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {state.error && <div role="alert" className="alert err">{state.error}</div>}
      <label className="field">
        <span>Kata sandi baru</span>
        <input className="input" name="baru" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label className="field">
        <span>Ulangi kata sandi baru</span>
        <input className="input" name="ulang" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <p className="muted" style={{ margin: 0 }}>Minimal 8 karakter, memuat huruf dan angka.</p>
      <button className="btn" type="submit" disabled={pending} style={{ minHeight: 52, fontSize: 16, borderRadius: 12 }}>
        {pending ? 'Menyimpan...' : 'Simpan dan lanjut'}
      </button>
    </form>
  );
}
