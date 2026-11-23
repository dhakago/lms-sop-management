'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authEmail, normalizeLogin } from '@/lib/phone';

export type LoginState = { error?: string; remaining?: number; value?: string };

const MAX_FAILS = 3;
const LOCK_MINUTES = 15;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = String(formData.get('akun') ?? '');
  const password = String(formData.get('sandi') ?? '');
  const norm = normalizeLogin(raw);
  if (!norm || !password) return { error: 'Isi nomor HP atau email dan kata sandi.', value: raw };

  const admin = createAdminClient();
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();

  // Hitung kegagalan sejak keberhasilan terakhir dalam 15 menit terakhir.
  const { data: recent } = await admin
    .from('login_attempts')
    .select('ok, at')
    .eq('login_id', norm.loginId)
    .gte('at', since)
    .order('at', { ascending: false })
    .limit(20);
  let fails = 0;
  for (const r of recent ?? []) {
    if (r.ok) break;
    fails++;
  }
  if (fails >= MAX_FAILS) {
    const last = new Date(recent![0]!.at).getTime();
    const mins = Math.max(1, Math.ceil((last + LOCK_MINUTES * 60_000 - Date.now()) / 60_000));
    return { error: `Terlalu banyak percobaan. Coba lagi dalam ${mins} menit atau hubungi HRBP.`, value: raw };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: authEmail(norm.loginId), password });
  await admin.from('login_attempts').insert({ login_id: norm.loginId, ok: !error });

  if (error) {
    const remaining = MAX_FAILS - (fails + 1);
    return {
      error:
        remaining > 0
          ? `Nomor HP atau kata sandi tidak cocok. Sisa ${remaining} percobaan sebelum akun dikunci ${LOCK_MINUTES} menit.`
          : `Terlalu banyak percobaan. Akun dikunci ${LOCK_MINUTES} menit. Hubungi HRBP bila perlu direset.`,
      remaining,
      value: raw,
    };
  }
  redirect('/');
}
