'use client';
import { useState } from 'react';

export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div role={error ? 'alert' : 'status'} className={`alert ${error ? 'err' : 'info'}`}>
      {error ?? ok}
    </div>
  );
}

// Kata sandi sementara: tampil sekali, dengan tombol salin.
export function SecretBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bisa diblokir; teks tetap bisa dipilih manual */
    }
  }
  return (
    <div style={{ padding: 14, borderRadius: 12, background: 'var(--ta)', border: '1px solid var(--line)' }}>
      <div className="muted">{label}</div>
      <div className="row" style={{ marginTop: 6 }}>
        <code style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, userSelect: 'all' }}>{value}</code>
        <button type="button" className="btn sec" onClick={copy}>{copied ? 'Tersalin' : 'Salin'}</button>
      </div>
    </div>
  );
}
