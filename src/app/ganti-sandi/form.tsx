'use client';
import { useForm } from '@/components/use-form';
import { PasswordInput } from '@/components/password-input';
import { changePassword, type PwState } from './actions';

export function PwForm() {
  const [state, action, pending] = useForm<PwState>(changePassword, {});
  return (
    <form onSubmit={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {state.error && <div role="alert" className="alert err">{state.error}</div>}
      <label className="field">
        <span>Kata sandi baru</span>
        <PasswordInput name="baru" autoComplete="new-password" minLength={8} required />
      </label>
      <label className="field">
        <span>Ulangi kata sandi baru</span>
        <PasswordInput name="ulang" autoComplete="new-password" minLength={8} required />
      </label>
      <p className="muted" style={{ margin: 0 }}>Minimal 8 karakter, memuat huruf dan angka.</p>
      <button className="btn" type="submit" disabled={pending} style={{ minHeight: 52, fontSize: 16, borderRadius: 12 }}>
        {pending ? 'Menyimpan...' : 'Simpan dan lanjut'}
      </button>
    </form>
  );
}
