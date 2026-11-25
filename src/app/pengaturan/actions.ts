'use server';
import { revalidatePath } from 'next/cache';
import { getCtx } from '@/lib/session';
import { audit, isSuper } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';

export type TermsState = { error?: string; ok?: string };

const KEYS = [['board', 'Board'], ['library', 'Library'], ['playbook', 'Playbook'], ['card', 'Card']] as const;

export async function saveTerms(_prev: TermsState, fd: FormData): Promise<TermsState> {
  const ctx = await getCtx();
  if (!isSuper(ctx)) return { error: 'Hanya superadmin yang boleh mengubah pengaturan.' };

  const value: Record<string, string> = {};
  for (const [k, def] of KEYS) {
    const v = String(fd.get(k) ?? '').trim();
    if (v.length > 32) return { error: `Istilah "${def}" terlalu panjang. Maksimal 32 karakter.` };
    value[k] = v || def;
  }
  const supabase = await createClient();
  const { error } = await supabase.from('app_settings').upsert({ key: 'sop_terms', value, updated_by: ctx.userId, updated_at: new Date().toISOString() });
  if (error) return { error: 'Pengaturan belum bisa disimpan. Coba lagi.' };
  await audit(ctx.userId, 'settings.sop_terms', 'app_settings', 'sop_terms', null, value);
  revalidatePath('/', 'layout');
  return { ok: 'Istilah tersimpan dan langsung dipakai di seluruh aplikasi.' };
}
