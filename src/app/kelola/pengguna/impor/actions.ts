'use server';
import { revalidatePath } from 'next/cache';
import { getCtx, type Ctx } from '@/lib/session';
import { audit, canAccess } from '@/lib/authz';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCsv } from '@/lib/csv';
import { normalizeLogin } from '@/lib/phone';
import { tempPassword } from '@/lib/password';
import { createUserAccount, parseHolding } from '@/lib/users';
import { THEMES, type HoldingId } from '@/lib/theme';

const MAX_ROWS = 300;

export type PreviewRow = {
  line: number;
  name: string;
  employeeNo: string;
  login: string;
  holding: string;
  unit: string;
  jobTitle: string;
  managerNo: string;
  problems: string[];
};

type Row = PreviewRow & { holdingId: HoldingId | null; loginId: string | null; contactEmail: string; managerId: string | null };

export type ImportState = {
  error?: string;
  preview?: { rows: PreviewRow[]; valid: number; invalid: number };
  result?: {
    created: { employeeNo: string; name: string; login: string; holding: string; password: string }[];
    failed: { line: number; employeeNo: string; problem: string }[];
  };
};

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

async function analyze(ctx: Ctx, text: string): Promise<{ error: string } | { rows: Row[] }> {
  const table = parseCsv(text);
  if (table.length < 2) return { error: 'File kosong. Isi baris pertama dengan judul kolom, lalu data di bawahnya.' };
  const header = table[0]!.map(norm);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = col('nama');
  const iNo = col('nomor_induk');
  const iHp = col('hp', 'nomor_hp');
  const iEmail = col('email');
  const iHold = col('holding');
  const iUnit = col('unit');
  const iJob = col('jabatan');
  const iMgr = col('atasan_nomor_induk');
  const missing = [
    iName < 0 && 'nama', iNo < 0 && 'nomor_induk', iHold < 0 && 'holding',
    iHp < 0 && iEmail < 0 && 'hp atau email',
  ].filter(Boolean);
  if (missing.length) return { error: `Kolom wajib belum ada: ${missing.join(', ')}.` };
  const body = table.slice(1);
  if (body.length > MAX_ROWS) return { error: `Terlalu banyak baris (${body.length}). Maksimal ${MAX_ROWS} per impor, pecah file Anda.` };

  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const rows: Row[] = body.map((r, k) => {
    const hp = get(r, iHp);
    const email = get(r, iEmail);
    const holdingId = parseHolding(get(r, iHold));
    const login = hp || email;
    const n = normalizeLogin(login);
    return {
      line: k + 2,
      name: get(r, iName),
      employeeNo: get(r, iNo),
      login,
      holding: get(r, iHold),
      unit: get(r, iUnit),
      jobTitle: get(r, iJob),
      managerNo: get(r, iMgr),
      problems: [],
      holdingId,
      loginId: n?.loginId ?? null,
      // Bila ada nomor HP dan email, nomor HP dipakai untuk masuk dan email disimpan sebagai kontak.
      contactEmail: hp && email ? email : '',
      managerId: null,
    };
  });

  const db = createAdminClient();
  const nos = rows.map((r) => r.employeeNo).filter(Boolean);
  const logins = rows.map((r) => r.loginId).filter((x): x is string => !!x);
  const mgrNos = [...new Set(rows.map((r) => r.managerNo).filter(Boolean))];
  const [dupNos, dupLogins, mgrs] = await Promise.all([
    nos.length ? db.from('profiles').select('employee_no').in('employee_no', nos) : { data: [] },
    logins.length ? db.from('profiles').select('login_id').in('login_id', logins) : { data: [] },
    mgrNos.length ? db.from('profiles').select('id, employee_no, active').in('employee_no', mgrNos) : { data: [] },
  ]);
  const takenNo = new Set((dupNos.data ?? []).map((x) => (x as { employee_no: string }).employee_no));
  const takenLogin = new Set((dupLogins.data ?? []).map((x) => (x as { login_id: string }).login_id));
  const mgrRows = (mgrs.data ?? []) as { id: string; employee_no: string; active: boolean }[];
  const { data: mgrMs } = mgrRows.length
    ? await db.from('memberships').select('profile_id, holding_id').in('profile_id', mgrRows.map((m) => m.id)).is('ended_on', null)
    : { data: [] };
  const mgrInHolding = (m: { id: string; active: boolean }, h: string) =>
    m.active && (mgrMs ?? []).some((x) => x.profile_id === m.id && x.holding_id === h);

  const seenNo = new Map<string, number>();
  const seenLogin = new Map<string, number>();
  const inFile = new Map<string, Row>(); // nomor induk -> baris, untuk atasan yang ikut diimpor
  for (const r of rows) if (r.employeeNo && !inFile.has(r.employeeNo)) inFile.set(r.employeeNo, r);

  for (const r of rows) {
    const p = r.problems;
    if (!r.name) p.push('Nama kosong.');
    else if (r.name.length > 100) p.push('Nama lebih dari 100 karakter.');
    if (!r.employeeNo) p.push('Nomor induk kosong.');
    else if (!/^[A-Za-z0-9][A-Za-z0-9\-_.]{1,31}$/.test(r.employeeNo)) p.push('Nomor induk berisi karakter yang tidak diizinkan.');
    else if (takenNo.has(r.employeeNo)) p.push('Nomor induk sudah dipakai.');
    else if (seenNo.has(r.employeeNo)) p.push(`Nomor induk kembar dengan baris ${seenNo.get(r.employeeNo)}.`);
    if (r.employeeNo && !seenNo.has(r.employeeNo)) seenNo.set(r.employeeNo, r.line);

    if (!r.login) p.push('Nomor HP atau email kosong.');
    else if (!r.loginId) p.push('Nomor HP atau email tidak valid.');
    else if (takenLogin.has(r.loginId)) p.push('Nomor HP atau email sudah terdaftar.');
    else if (seenLogin.has(r.loginId)) p.push(`Nomor HP atau email kembar dengan baris ${seenLogin.get(r.loginId)}.`);
    if (r.loginId && !seenLogin.has(r.loginId)) seenLogin.set(r.loginId, r.line);

    if (!r.holdingId) p.push(`Holding "${r.holding}" tidak dikenal. Pakai PPL, SIB, BJO, atau BOS.`);
    else if (!canAccess(ctx, r.holdingId, 'pengguna')) p.push(`Anda tidak punya akses pengguna untuk ${THEMES[r.holdingId].name}.`);
    if (r.contactEmail && !normalizeLogin(r.contactEmail)?.loginId.includes('@')) p.push('Email tidak valid.');
  }

  // Atasan: sudah ada di database, atau ikut diimpor pada baris lain yang valid dan holding-nya sama.
  const baseOk = (r: Row) => r.problems.length === 0;
  for (const r of rows) {
    if (!r.managerNo || !r.holdingId) continue;
    if (r.managerNo === r.employeeNo) { r.problems.push('Atasan tidak boleh diri sendiri.'); continue; }
    const m = mgrRows.find((x) => x.employee_no === r.managerNo);
    if (m) {
      if (mgrInHolding(m, r.holdingId)) r.managerId = m.id;
      else r.problems.push(`Atasan ${r.managerNo} tidak aktif atau tidak terdaftar di ${THEMES[r.holdingId].name}.`);
      continue;
    }
    const f = inFile.get(r.managerNo);
    if (!f) r.problems.push(`Atasan ${r.managerNo} tidak ditemukan.`);
    else if (f.holdingId !== r.holdingId) r.problems.push(`Atasan ${r.managerNo} ada di file tetapi holding-nya berbeda.`);
    else if (!baseOk(f)) r.problems.push(`Atasan ${r.managerNo} ada di file tetapi barisnya bermasalah.`);
  }
  return { rows };
}

const strip = (r: Row): PreviewRow => ({
  line: r.line, name: r.name, employeeNo: r.employeeNo, login: r.login, holding: r.holding,
  unit: r.unit, jobTitle: r.jobTitle, managerNo: r.managerNo, problems: r.problems,
});

export async function previewImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await getCtx();
  const text = String(fd.get('csv') ?? '');
  if (!text.trim()) return { error: 'Pilih file CSV dulu.' };
  const res = await analyze(ctx, text);
  if ('error' in res) return { error: res.error };
  const valid = res.rows.filter((r) => r.problems.length === 0).length;
  return { preview: { rows: res.rows.map(strip), valid, invalid: res.rows.length - valid } };
}

export async function commitImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await getCtx();
  const text = String(fd.get('csv') ?? '');
  // Diperiksa ulang di server. Isi pratinjau dari klien tidak dipercaya.
  const res = await analyze(ctx, text);
  if ('error' in res) return { error: res.error };
  const rows = res.rows.filter((r) => r.problems.length === 0);
  if (rows.length === 0) return { error: 'Tidak ada baris yang bisa disimpan.' };

  const db = createAdminClient();
  const created: NonNullable<ImportState['result']>['created'] = [];
  const failed: NonNullable<ImportState['result']>['failed'] = [];
  const idByNo = new Map<string, string>();

  for (const r of rows) {
    const password = tempPassword();
    const out = await createUserAccount({
      name: r.name, employeeNo: r.employeeNo, login: r.login, contactEmail: r.contactEmail,
      holding: r.holdingId!, unit: r.unit, jobTitle: r.jobTitle, managerId: r.managerId, password,
    });
    if ('error' in out) { failed.push({ line: r.line, employeeNo: r.employeeNo, problem: out.error }); continue; }
    idByNo.set(r.employeeNo, out.id);
    created.push({ employeeNo: r.employeeNo, name: r.name, login: r.loginId!, holding: THEMES[r.holdingId!].code, password });
    await audit(ctx.userId, 'user.create', 'profile', out.id, r.holdingId, { employee_no: r.employeeNo, via: 'impor' });
  }

  // Atasan yang ikut diimpor baru punya id setelah semua akun dibuat.
  for (const r of rows) {
    if (!r.managerNo || r.managerId) continue;
    const me = idByNo.get(r.employeeNo);
    const boss = idByNo.get(r.managerNo);
    if (!me) continue;
    if (!boss) { failed.push({ line: r.line, employeeNo: r.employeeNo, problem: 'Akun dibuat, tetapi atasan gagal dibuat. Atur atasan secara manual.' }); continue; }
    await db.from('memberships').update({ manager_id: boss }).eq('profile_id', me).eq('holding_id', r.holdingId!).is('ended_on', null);
  }

  revalidatePath('/kelola/pengguna');
  return { result: { created, failed } };
}
