'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function markRead(formData: FormData) {
  const card = String(formData.get('card') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(card)) return;
  const supabase = await createClient();
  // mark_read memeriksa hak akses di database: board harus dibuka untuk holding pengguna dan card harus terbit.
  const { error } = await supabase.rpc('mark_read', { p_card: card });
  if (error) throw new Error('Belum bisa menandai sudah dibaca');
  revalidatePath(`/sop/c/${card}`);
  revalidatePath('/');
}
