'use client';
import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ fontSize: 26, color: 'var(--p)' }}>Masuk</h2>
      {(state.error || notice) && (
        <div role="alert" className="alert err">{state.error ?? notice}</div>
      )}
      <label className="field">
        <span>Nomor HP atau email</span>
        <input
          className="input"
          name="akun"
          type="text"
          inputMode="email"
          autoComplete="username"
          placeholder="0812 3456 7890 atau nama@email.com"
          defaultValue={state.value}
          required
        />
      </label>
      <label className="field">
        <span>Kata sandi</span>
        <input className="input" name="sandi" type="password" autoComplete="current-password" aria-invalid={state.error ? 'true' : undefined} required />
      </label>
      <button className="btn" type="submit" disabled={pending} style={{ minHeight: 52, fontSize: 16, borderRadius: 12 }}>
        {pending ? 'Memeriksa...' : 'Masuk'}
      </button>
      <p className="muted" style={{ margin: 0 }}>
        Akun dibuat oleh HRBP holding Anda. Lupa kata sandi atau nomor berubah? Hubungi HRBP, mereka yang meresetnya.
      </p>
    </form>
  );
}
