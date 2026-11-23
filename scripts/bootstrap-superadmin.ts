// Membuat superadmin pertama. Dijalankan sekali, lokal atau di shell Railway:
//   SUPERADMIN_LOGIN=0812xxxxxxx SUPERADMIN_NAME="Nama Lengkap" SUPERADMIN_PASSWORD='sementara123' npm run bootstrap
// Variabel NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus sudah ada di lingkungan.
import { createClient } from '@supabase/supabase-js';
import { authEmail, normalizeLogin, passwordProblem } from '../src/lib/phone';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const login = process.env.SUPERADMIN_LOGIN ?? '';
  const name = process.env.SUPERADMIN_NAME ?? '';
  const password = process.env.SUPERADMIN_PASSWORD ?? '';
  const employeeNo = process.env.SUPERADMIN_EMPLOYEE_NO ?? 'PPL-0001';
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.');
  const norm = normalizeLogin(login);
  if (!norm) throw new Error('SUPERADMIN_LOGIN harus nomor HP atau email yang valid.');
  if (!name) throw new Error('SUPERADMIN_NAME wajib diisi.');
  const problem = passwordProblem(password);
  if (problem) throw new Error(`SUPERADMIN_PASSWORD: ${problem}`);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'superadmin');
  if ((count ?? 0) > 0 && process.env.FORCE !== '1') {
    throw new Error('Sudah ada superadmin. Skrip ini hanya untuk yang pertama (FORCE=1 untuk menambah lagi).');
  }

  const { data: created, error: e1 } = await db.auth.admin.createUser({
    email: authEmail(norm.loginId),
    password,
    email_confirm: true,
  });
  if (e1 || !created.user) throw new Error(`Gagal membuat akun login: ${e1?.message}`);
  const id = created.user.id;

  const { error: e2 } = await db.from('profiles').insert({
    id,
    employee_no: employeeNo,
    full_name: name,
    login_id: norm.loginId,
    phone: norm.kind === 'phone' ? norm.loginId : null,
    email: norm.kind === 'email' ? norm.loginId : null,
    role: 'superadmin',
    must_change_password: true,
  });
  if (e2) {
    await db.auth.admin.deleteUser(id);
    throw new Error(`Gagal membuat profil: ${e2.message}`);
  }
  const { error: e3 } = await db.from('memberships').insert({ profile_id: id, holding_id: 'people', job_title: 'Superadmin' });
  if (e3) throw new Error(`Profil dibuat, tetapi keanggotaan gagal: ${e3.message}`);

  console.log(`Superadmin dibuat: ${name} (${norm.loginId}). Kata sandi sementara harus diganti saat masuk pertama.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
