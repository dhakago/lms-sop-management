'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/session';
import { audit, canAccess, HOLDING_IDS } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';

export type St = { error?: string; ok?: string };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const isId = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const DENIED = 'Anda tidak punya akses untuk mengubah ini.';
const refresh = () => revalidatePath('/', 'layout');

// RLS (groups_write, group_members_write) menjaga di database. Pemeriksaan di sini untuk pesan yang jelas.
export async function createGroup(_p: St, fd: FormData): Promise<St> {
  const ctx = await getCtx();
  const holding = s(fd, 'holding');
  const name = s(fd, 'nama');
  if (!(HOLDING_IDS as string[]).includes(holding) || holding === 'people' || !canAccess(ctx, holding, 'pengguna')) return { error: DENIED };
  if (!name || name.length > 60) return { error: 'Nama grup wajib diisi, paling banyak 60 karakter.' };
  const db = await createClient();
  const { data, error } = await db.from('groups').insert({ holding_id: holding, name, created_by: ctx.userId }).select('id').single();
  if (error || !data) return { error: error?.code === '23505' ? 'Nama grup ini sudah dipakai di holding tersebut.' : 'Belum bisa dibuat. Coba lagi.' };
  await audit(ctx.userId, 'group.create', 'group', data.id, holding, { name });
  refresh();
  redirect(`/kelola/grup/${data.id}`);
}

async function groupHolding(id: string) {
  const db = await createClient();
  const { data } = await db.from('groups').select('holding_id, name').eq('id', id).maybeSingle();
  return { db, holding: data?.holding_id as string | undefined, name: data?.name as string | undefined };
}

export async function renameGroup(_p: St, fd: FormData): Promise<St> {
  const ctx = await getCtx();
  const id = s(fd, 'id');
  const name = s(fd, 'nama');
  if (!isId(id)) return { error: DENIED };
  const g = await groupHolding(id);
  if (!g.holding || !canAccess(ctx, g.holding, 'pengguna')) return { error: DENIED };
  if (!name || name.length > 60) return { error: 'Nama grup wajib diisi, paling banyak 60 karakter.' };
  const { error } = await g.db.from('groups').update({ name }).eq('id', id);
  if (error) return { error: error.code === '23505' ? 'Nama grup ini sudah dipakai.' : 'Belum bisa disimpan. Coba lagi.' };
  await audit(ctx.userId, 'group.rename', 'group', id, g.holding, { name });
  refresh();
  return { ok: 'Nama grup tersimpan.' };
}

export async function deleteGroup(_p: St, fd: FormData): Promise<St> {
  const ctx = await getCtx();
  const id = s(fd, 'id');
  if (!isId(id)) return { error: DENIED };
  const g = await groupHolding(id);
  if (!g.holding || !canAccess(ctx, g.holding, 'pengguna')) return { error: DENIED };
  const { data, error } = await g.db.from('groups').delete().eq('id', id).select('id');
  if (error || !data?.length) return { error: 'Belum bisa dihapus. Coba lagi.' };
  await audit(ctx.userId, 'group.delete', 'group', id, g.holding, { name: g.name });
  refresh();
  redirect('/kelola/grup');
}

export async function addMember(_p: St, fd: FormData): Promise<St> {
  const ctx = await getCtx();
  const id = s(fd, 'id');
  const person = s(fd, 'orang');
  if (!isId(id)) return { error: DENIED };
  if (!isId(person)) return { error: 'Pilih orang dari hasil pencarian.' };
  const g = await groupHolding(id);
  if (!g.holding || !canAccess(ctx, g.holding, 'pengguna')) return { error: DENIED };
  const { error } = await g.db.from('group_members').insert({ group_id: id, profile_id: person });
  if (error) return { error: error.code === '23505' ? 'Orang ini sudah ada di grup.' : 'Orang ini bukan anggota aktif holding grup ini.' };
  await audit(ctx.userId, 'group.member.add', 'group', id, g.holding, { profile: person });
  refresh();
  return { ok: 'Anggota ditambahkan.' };
}

export async function removeMember(_p: St, fd: FormData): Promise<St> {
  const ctx = await getCtx();
  const id = s(fd, 'id');
  const person = s(fd, 'orang');
  if (!isId(id) || !isId(person)) return { error: DENIED };
  const g = await groupHolding(id);
  if (!g.holding || !canAccess(ctx, g.holding, 'pengguna')) return { error: DENIED };
  const { data, error } = await g.db.from('group_members').delete().eq('group_id', id).eq('profile_id', person).select('profile_id');
  if (error || !data?.length) return { error: 'Belum bisa dicabut. Coba lagi.' };
  await audit(ctx.userId, 'group.member.remove', 'group', id, g.holding, { profile: person });
  refresh();
  return { ok: 'Anggota dikeluarkan.' };
}
