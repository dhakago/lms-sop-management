// Nama pengguna bisa nomor HP atau email. Nomor HP dinormalkan ke format 62xxxxxxxxxx.
export type LoginKind = 'phone' | 'email';

export function normalizeLogin(raw: string): { loginId: string; kind: LoginKind } | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.includes('@')) {
    const email = v.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { loginId: email, kind: 'email' } : null;
  }
  let d = v.replace(/[\s\-().+]/g, '');
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  if (!d.startsWith('62') || d.length < 10 || d.length > 15) return null;
  return { loginId: d, kind: 'phone' };
}

// Supabase Auth meminta email. Akun nomor HP memakai alamat bayangan yang tidak pernah dikirimi email.
export function authEmail(loginId: string): string {
  if (loginId.includes('@')) return loginId;
  const domain = process.env.AUTH_PHONE_DOMAIN || 'login.lms.peopleexcellence.co.id';
  return `${loginId}@${domain}`;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Kata sandi harus memuat huruf dan angka.';
  return null;
}
