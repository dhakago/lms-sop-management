'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const HOLDINGS = ['people', 'sib', 'bejo', 'bos'];

// Holding aktif hanya mengatur tema dan daftar yang tampil. Hak akses tetap diputuskan database.
export async function setHolding(formData: FormData) {
  const h = String(formData.get('holding') ?? '');
  if (!HOLDINGS.includes(h)) return;
  (await cookies()).set('holding', h, { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}

export async function setLite(formData: FormData) {
  const on = formData.get('lite') === '1';
  (await cookies()).set('lite', on ? '1' : '0', { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
