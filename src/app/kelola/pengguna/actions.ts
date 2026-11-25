'use server';
import { revalidatePath } from 'next/cache';
import { getCtx, type Ctx } from '@/lib/session';
import { audit, canAccess, loadTarget } from '@/lib/authz';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeLogin, passwordProblem } from '@/lib/phone';
import { tempPassword } from '@/lib/password';
import { createUserAccount, findManager, parseHolding } from '@/lib/users';
import { THEMES, type HoldingId } from '@/lib/theme';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const NO_ACCESS = 'Anda tidak punya akses pengguna untuk holding ini.';

function holdingOf(ctx: Ctx, raw: string): HoldingId | null {
  const h = parseHolding(raw);
  return h && canAccess(ctx, h, 'pengguna') ? h : null;
}

// ============ Tambah satu pengguna ============
export type CreateState = {
  error?: string;
  done?: { name: string; employeeNo: string; loginId: string; password: string };
};

export async function createUser(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const ctx = await getCtx();
  const holding = holdingOf(ctx, s(fd, 'holding'));
  if (!holding) return { error: NO_ACCESS };

  const name = s(fd, 'nama');
  const employeeNo = s(fd, 'nomor_induk');
  const login = s(fd, 'login');
  if (!name || name.length > 100) return { error: 'Nama wajib diisi, paling banyak 100 karakter.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_.]{1,31}$/.test(employeeNo)) return { error: 'Nomor induk wajib diisi (huruf, angka, tanda hubung), contoh SIB-0142.' };
  if (!normalizeLogin(login)) return { error: 'Isi nomor HP atau email yang valid.' };

  let password = s(fd, 'sandi');
  if (password) {
    const problem = passwordProblem(password);
    if (problem) return { error: problem };
  } else password = tempPassword();

  let managerId: string | null = null;
  const managerNo = s(fd, 'atasan');
  if (managerNo) {
    const m = await findManager(holding, managerNo);
    if ('error' in m) return { error: m.error };
    managerId = m.id;
  }

  const res = await createUserAccount({
    name, employeeNo, login, holding, managerId, password,
    unit: s(fd, 'unit'), jobTitle: s(fd, 'jabatan'),
  });
  if ('error' in res) return { error: res.error };

  const norm = normalizeLogin(login)!;
  await audit(ctx.userId, 'user.create', 'profile', res.id, holding, { employee_no: employeeNo });
  revalidatePath('/kelola/pengguna');
  return { done: { name, employeeNo, loginId: norm.loginId, password } };
}

// ============ Tindakan pada satu pengguna ============
export type ActionState = { error?: string; ok?: string; password?: string };

export async function setActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getCtx();
  const id = s(fd, 'id');
  const active = s(fd, 'aktif') === '1';
  if (id === ctx.userId) return { error: 'Anda tidak bisa menonaktifkan akun sendiri.' };
  const t = await loadTarget(ctx, id);
  if ('error' in t) return { error: t.error };

  const db = createAdminClient();
  const { error } = await db.from('profiles').update({ active }).eq('id', id);
  if (error) return { error: 'Status belum bisa diubah. Coba lagi.' };
  // Nonaktif berarti tidak bisa masuk lagi, bukan hanya disembunyikan.
  await db.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
  for (const h of t.target.holdings) {
    if (canAccess(ctx, h, 'pengguna')) await audit(ctx.userId, active ? 'user.activate' : 'user.deactivate', 'profile', id, h);
  }
  revalidatePath('/kelola/pengguna');
  return { ok: active ? 'Pengguna diaktifkan kembali.' : 'Pengguna dinonaktifkan dan tidak bisa masuk.' };
}

export async function resetPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getCtx();
  const id = s(fd, 'id');
  const t = await loadTarget(ctx, id);
  if ('error' in t) return { error: t.error };

  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('login_id').eq('id', id).maybeSingle();
  const password = tempPassword();
  const { error } = await db.auth.admin.updateUserById(id, { password });
  if (error) return { error: 'Kata sandi belum bisa direset. Coba lagi.' };
  await db.from('profiles').update({ must_change_password: true }).eq('id', id);
  // Orang yang terkunci karena salah ketik langsung bisa masuk lagi dengan kata sandi baru.
  if (p) await db.from('login_attempts').delete().eq('login_id', p.login_id);
  for (const h of t.target.holdings) {
    if (canAccess(ctx, h, 'pengguna')) await audit(ctx.userId, 'user.reset_password', 'profile', id, h);
  }
  return { ok: 'Kata sandi sementara baru dibuat. Tampil sekali saja, salin sekarang.', password };
}

// Ubah unit, jabatan, dan atasan langsung pada keanggotaan aktif.
export async function updateMembership(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getCtx();
  const id = s(fd, 'id');
  const holding = holdingOf(ctx, s(fd, 'holding'));
  if (!holding) return { error: NO_ACCESS };
  const t = await loadTarget(ctx, id);
  if ('error' in t) return { error: t.error };
  if (!t.target.holdings.includes(holding)) return { error: 'Pengguna ini tidak terdaftar di holding tersebut.' };

  let managerId: string | null = null;
  const managerNo = s(fd, 'atasan');
  if (managerNo) {
    const m = await findManager(holding, managerNo);
    if ('error' in m) return { error: m.error };
    if (m.id === id) return { error: 'Atasan tidak boleh orang yang sama.' };
    managerId = m.id;
  }
  const db = createAdminClient();
  const { error } = await db
    .from('memberships')
    .update({ unit: s(fd, 'unit') || null, job_title: s(fd, 'jabatan') || null, manager_id: managerId })
    .eq('profile_id', id)
    .eq('holding_id', holding)
    .is('ended_on', null);
  if (error) return { error: 'Data belum bisa disimpan. Coba lagi.' };
  await audit(ctx.userId, 'user.update', 'profile', id, holding, { manager_no: managerNo || null });
  revalidatePath('/kelola/pengguna');
  return { ok: 'Data tersimpan.' };
}

// Mutasi antar holding: keanggotaan lama diakhiri, keanggotaan baru dibuat. Riwayat lama tetap ada.
export async function mutateUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getCtx();
  const id = s(fd, 'id');
  const from = holdingOf(ctx, s(fd, 'dari'));
  const to = holdingOf(ctx, s(fd, 'ke'));
  if (!from || !to) return { error: 'Mutasi butuh akses pengguna di holding asal dan holding tujuan.' };
  if (from === to) return { error: 'Holding tujuan harus berbeda dari holding asal.' };
  const t = await loadTarget(ctx, id);
  if ('error' in t) return { error: t.error };
  if (!t.target.holdings.includes(from)) return { error: 'Pengguna ini tidak terdaftar di holding asal.' };
  if (t.target.holdings.includes(to)) return { error: `Pengguna ini sudah terdaftar di ${THEMES[to].name}.` };

  let managerId: string | null = null;
  const managerNo = s(fd, 'atasan');
  if (managerNo) {
    const m = await findManager(to, managerNo);
    if ('error' in m) return { error: m.error };
    managerId = m.id;
  }

  const db = createAdminClient();
  const { data: created, error: e1 } = await db
    .from('memberships')
    .insert({ profile_id: id, holding_id: to, unit: s(fd, 'unit') || null, job_title: s(fd, 'jabatan') || null, manager_id: managerId })
    .select('id')
    .single();
  if (e1 || !created) return { error: 'Mutasi gagal. Coba lagi.' };
  const { error: e2 } = await db
    .from('memberships')
    .update({ ended_on: today() })
    .eq('profile_id', id)
    .eq('holding_id', from)
    .is('ended_on', null);
  if (e2) {
    await db.from('memberships').delete().eq('id', created.id);
    return { error: 'Mutasi gagal. Coba lagi.' };
  }

  const { count } = await db
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', id)
    .eq('holding_id', from)
    .is('ended_on', null);
  await audit(ctx.userId, 'user.mutate', 'profile', id, from, { dari: from, ke: to });
  await audit(ctx.userId, 'user.mutate', 'profile', id, to, { dari: from, ke: to });
  revalidatePath('/kelola/pengguna');
  const bawahan = count ?? 0;
  return {
    ok:
      `Dipindahkan ke ${THEMES[to].name}.` +
      (bawahan > 0 ? ` Perhatian: ${bawahan} orang di ${THEMES[from].name} masih tercatat memakai orang ini sebagai atasan. Beri mereka atasan baru.` : ''),
  };
}
