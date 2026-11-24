import { LoginForm } from './form';

export const metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const notice = e === 'nonaktif' ? 'Akun Anda tidak aktif atau belum punya data. Hubungi HRBP holding Anda.' : undefined;
  return (
    <div className="shell" style={{ alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--tp)' }}>
      <div className="blob" aria-hidden="true" style={{ left: -140, top: -120, width: 560, height: 560, background: 'var(--p)', filter: 'blur(100px)', opacity: 0.38 }} />
      <div className="blob" aria-hidden="true" style={{ right: -120, top: 160, width: 480, height: 480, background: 'var(--a)', filter: 'blur(100px)', opacity: 0.5 }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'center', maxWidth: 1040, width: '100%' }}>
        <div style={{ flex: '1 1 340px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/people.png" alt="PEOPLE" width={240} height={53} style={{ display: 'block', width: 240, height: 'auto' }} />
          <h1 style={{ marginTop: 24, fontSize: 'clamp(32px, 6vw, 44px)', color: 'var(--p)' }}>Know the way, do it right.</h1>
          <p style={{ margin: '14px 0 0', fontSize: 17, lineHeight: 1.55, color: '#34403B', maxWidth: 460 }}>
            Pelajari cara kerja yang benar, kapan saja dan di mana saja.
          </p>
        </div>
        <div className="glass card" style={{ flex: '0 1 420px', padding: 28, minWidth: 'min(100%, 320px)', borderRadius: 20 }}>
          <LoginForm notice={notice} />
        </div>
      </div>
    </div>
  );
}
