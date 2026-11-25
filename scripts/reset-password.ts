// Mereset kata sandi satu akun dan membuka kunci login. Dijalankan di shell Railway atau lokal:
//   RESET_LOGIN=0812xxxxxxx RESET_PASSWORD='sementara123' npm run reset-password
// Variabel NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, dan AUTH_PHONE_DOMAIN
// harus sama dengan yang dipakai aplikasi di Railway. Kata sandi tidak dicetak.
import { createClient } from '@supabase/supabase-js';
import { authEmail, normalizeLogin, passwordProblem } from '../src/lib/phone';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.');
  const norm = normalizeLogin(process.env.RESET_LOGIN ?? '');
  if (!norm) throw new Error('RESET_LOGIN harus nomor HP atau email yang valid.');
  const password = process.env.RESET_PASSWORD ?? '';
  const problem = passwordProblem(password);
  if (problem) throw new Error(`RESET_PASSWORD: ${problem}`);

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const db = createClient(url, key, opts);
  console.log(`Alamat login di Supabase Auth: ${authEmail(norm.loginId)}`);

  const { data: p, error: e0 } = await db.from('profiles').select('id, role, active').eq('login_id', norm.loginId).maybeSingle();
  if (e0) throw new Error(`Gagal membaca profil: ${e0.message}`);
  if (!p) throw new Error(`Tidak ada profil dengan login_id ${norm.loginId}. Cek penulisan nomor atau email.`);
  console.log(`Profil ditemukan. Peran: ${p.role}, aktif: ${p.active}`);

  const { data: u, error: e1 } = await db.auth.admin.getUserById(p.id);
  if (e1 || !u.user) throw new Error('Profil ada, tetapi akun login di Supabase Auth tidak ditemukan.');
  if (u.user.email !== authEmail(norm.loginId)) {
    console.log(`PERHATIAN: email di Auth (${u.user.email}) berbeda dengan yang dipakai aplikasi (${authEmail(norm.loginId)}). Periksa AUTH_PHONE_DOMAIN.`);
  }

  const { error: e2 } = await db.auth.admin.updateUserById(p.id, { password, email_confirm: true, ban_duration: p.active ? 'none' : undefined });
  if (e2) throw new Error(`Gagal mengganti kata sandi: ${e2.message}`);
  await db.from('profiles').update({ must_change_password: true }).eq('id', p.id);
  await db.from('login_attempts').delete().eq('login_id', norm.loginId);

  // Uji langsung seperti yang dilakukan halaman login.
  const test = await createClient(url, anon, opts).auth.signInWithPassword({ email: authEmail(norm.loginId), password });
  if (test.error) throw new Error(`Kata sandi tersimpan, tetapi uji masuk gagal: ${test.error.message}`);
  console.log('Selesai. Uji masuk berhasil. Kata sandi sementara harus diganti saat masuk pertama.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
