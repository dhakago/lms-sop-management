import { getCtx } from '@/lib/session';
import { PwForm } from './form';
import { themeVars } from '@/lib/theme';

export const metadata = { title: 'Buat kata sandi baru' };

export default async function GantiSandiPage() {
  const ctx = await getCtx({ allowPasswordChange: true });
  return (
    <div className="shell" style={{ ...(themeVars(ctx.theme) as React.CSSProperties), alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="glass card" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440, padding: 28, borderRadius: 20 }}>
        <h1 style={{ fontSize: 28, color: 'var(--p)' }}>Buat kata sandi baru</h1>
        <p className="sub">Halo {ctx.profile.full_name.split(' ')[0]}. Kata sandi sementara dari HRBP hanya untuk masuk pertama kali. Buat kata sandi milik Anda sendiri.</p>
        <div style={{ marginTop: 20 }}>
          <PwForm />
        </div>
      </div>
    </div>
  );
}
