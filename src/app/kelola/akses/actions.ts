'use server';
import { revalidatePath } from 'next/cache';
import { getCtx } from '@/lib/session';
import { audit, HOLDING_IDS, isSuper, MODULES } from '@/lib/authz';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type AccessState = { error?: string; ok?: string };

// Hanya superadmin. Tulis admin_access lewat sesi pengguna supaya RLS dan trigger audit ikut bekerja.
// Peran profil (peserta atau admin) hanya bisa diubah server, jadi disesuaikan dengan kunci layanan.
export async function saveAccess(_prev: AccessState, fd: FormData): Promise<AccessState> {
  const ctx = await getCtx();
  if (!isSuper(ctx)) return { error: 'Hanya superadmin yang boleh mengatur akses admin.' };
  const id = String(fd.get('id') ?? '');

  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('id, role, active').eq('id', id).maybeSingle();
  if (!p) return { error: 'Pengguna tidak ditemukan.' };
  if (p.role === 'superadmin') return { error: 'Superadmin sudah punya semua akses.' };
  if (!p.active) return { error: 'Pengguna nonaktif. Aktifkan dulu sebelum diberi akses.' };

  const want = new Set<string>();
  for (const h of HOLDING_IDS) for (const m of MODULES) if (fd.get(`a_${h}_${m}`) === 'on') want.add(`${h}|${m}`);

  const supabase = await createClient();
  const { data: cur, error: eRead } = await supabase.from('admin_access').select('holding_id, module').eq('profile_id', id);
  if (eRead) return { error: 'Akses saat ini belum bisa dibaca. Coba lagi.' };
  const have = new Set((cur ?? []).map((r) => `${r.holding_id}|${r.module}`));

  for (const key of have) {
    if (want.has(key)) continue;
    const [h, m] = key.split('|');
    const { error } = await supabase.from('admin_access').delete().eq('profile_id', id).eq('holding_id', h!).eq('module', m!);
    if (error) return { error: 'Sebagian akses belum bisa dicabut. Coba lagi.' };
  }
  const add = [...want].filter((k) => !have.has(k)).map((k) => {
    const [h, m] = k.split('|');
    return { profile_id: id, holding_id: h!, module: m!, granted_by: ctx.userId };
  });
  if (add.length) {
    const { error } = await supabase.from('admin_access').insert(add);
    if (error) return { error: 'Sebagian akses belum bisa diberikan. Coba lagi.' };
  }

  const role = want.size > 0 ? 'admin' : 'peserta';
  if (role !== p.role) {
    await db.from('profiles').update({ role }).eq('id', id);
    await audit(ctx.userId, role === 'admin' ? 'role.admin' : 'role.peserta', 'profile', id, null);
  }
  revalidatePath('/kelola/akses');
  return { ok: want.size > 0 ? 'Akses tersimpan.' : 'Semua akses dicabut. Pengguna kembali menjadi peserta biasa.' };
}
