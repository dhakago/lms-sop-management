import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { authEmail, normalizeLogin } from '@/lib/phone';
import { THEMES, type HoldingId } from '@/lib/theme';

// Menerima id (sib), kode (SIB), atau nama (SIBIMA Group) tanpa membedakan huruf besar kecil.
export function parseHolding(raw: string): HoldingId | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  for (const [id, t] of Object.entries(THEMES)) {
    if (v === id || v === t.code.toLowerCase() || v === t.name.toLowerCase()) return id as HoldingId;
  }
  return null;
}

// Atasan harus pengguna aktif dengan keanggotaan aktif di holding yang sama.
export async function findManager(holding: HoldingId, employeeNo: string): Promise<{ id: string } | { error: string }> {
  const no = employeeNo.trim();
  if (!no) return { error: 'Nomor induk atasan kosong.' };
  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('id, active').eq('employee_no', no).maybeSingle();
  if (!p) return { error: `Atasan dengan nomor induk ${no} tidak ditemukan.` };
  if (!p.active) return { error: `Atasan ${no} sudah nonaktif.` };
  const { data: m } = await db
    .from('memberships')
    .select('id')
    .eq('profile_id', p.id)
    .eq('holding_id', holding)
    .is('ended_on', null)
    .maybeSingle();
  if (!m) return { error: `Atasan ${no} tidak terdaftar di ${THEMES[holding].name}.` };
  return { id: p.id };
}

export type NewUser = {
  name: string;
  employeeNo: string;
  login: string; // nomor HP atau email mentah
  contactEmail?: string; // email tambahan bila login memakai nomor HP
  holding: HoldingId;
  unit: string;
  jobTitle: string;
  managerId: string | null;
  password: string;
};

// Membuat akun login, profil, dan keanggotaan. Bila salah satu langkah gagal, langkah sebelumnya dibatalkan.
export async function createUserAccount(u: NewUser): Promise<{ id: string } | { error: string }> {
  const norm = normalizeLogin(u.login);
  if (!norm) return { error: 'Nomor HP atau email tidak valid.' };
  const db = createAdminClient();

  const [{ data: dupNo }, { data: dupLogin }] = await Promise.all([
    db.from('profiles').select('id').eq('employee_no', u.employeeNo).maybeSingle(),
    db.from('profiles').select('id').eq('login_id', norm.loginId).maybeSingle(),
  ]);
  if (dupNo) return { error: `Nomor induk ${u.employeeNo} sudah dipakai.` };
  if (dupLogin) return { error: `${norm.kind === 'phone' ? 'Nomor HP' : 'Email'} ${norm.loginId} sudah terdaftar.` };

  const { data: created, error: e1 } = await db.auth.admin.createUser({
    email: authEmail(norm.loginId),
    password: u.password,
    email_confirm: true,
  });
  if (e1 || !created.user) return { error: 'Akun login gagal dibuat. Coba lagi.' };
  const id = created.user.id;

  const contactEmail = u.contactEmail?.trim().toLowerCase() || null;
  const { error: e2 } = await db.from('profiles').insert({
    id,
    employee_no: u.employeeNo,
    full_name: u.name,
    login_id: norm.loginId,
    phone: norm.kind === 'phone' ? norm.loginId : null,
    email: norm.kind === 'email' ? norm.loginId : contactEmail,
    role: 'peserta',
    must_change_password: true,
  });
  if (e2) {
    await db.auth.admin.deleteUser(id);
    return { error: 'Profil gagal dibuat. Coba lagi.' };
  }
  const { error: e3 } = await db.from('memberships').insert({
    profile_id: id,
    holding_id: u.holding,
    unit: u.unit || null,
    job_title: u.jobTitle || null,
    manager_id: u.managerId,
  });
  if (e3) {
    await db.auth.admin.deleteUser(id); // profil ikut terhapus (on delete cascade)
    return { error: 'Keanggotaan gagal dibuat. Coba lagi.' };
  }
  return { id };
}
