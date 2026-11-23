'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { passwordProblem } from '@/lib/phone';

export type PwState = { error?: string };

export async function changePassword(_prev: PwState, formData: FormData): Promise<PwState> {
  const a = String(formData.get('baru') ?? '');
  const b = String(formData.get('ulang') ?? '');
  const problem = passwordProblem(a);
  if (problem) return { error: problem };
  if (a !== b) return { error: 'Kata sandi baru dan pengulangannya tidak sama.' };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { error } = await supabase.auth.updateUser({ password: a });
  if (error) {
    return { error: error.message.toLowerCase().includes('different') ? 'Kata sandi baru harus berbeda dari yang lama.' : 'Kata sandi belum bisa diganti. Coba lagi.' };
  }
  // Penanda wajib ganti sandi hanya bisa dicabut oleh server, bukan oleh klien.
  const admin = createAdminClient();
  await admin.from('profiles').update({ must_change_password: false }).eq('id', auth.user.id);
  redirect('/');
}
