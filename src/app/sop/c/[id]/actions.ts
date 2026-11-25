'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCtx } from '@/lib/session';
import { assignedReq, getMyGroupIds } from '@/lib/sop';

export async function markRead(formData: FormData) {
  const card = String(formData.get('card') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(card)) return;
  const ctx = await getCtx();
  const supabase = await createClient();
  // Hanya yang ditugaskan yang menandai dibaca. Tanpa penugasan, SOP cukup dibaca.
  const { data: c } = await supabase.from('cards').select('playbook_id').eq('id', card).maybeSingle();
  if (!c) return;
  const { data: reqs } = await supabase.from('playbook_requirements').select('holding_id, unit, due_on, target_type, group_id, profile_id').eq('playbook_id', c.playbook_id);
  if (!assignedReq(ctx, reqs ?? [], await getMyGroupIds(ctx.userId))) throw new Error('SOP ini tidak ditugaskan kepada Anda');
  // mark_read memeriksa di database: akses board, penugasan, dan card terbit. Pemeriksaan di atas hanya untuk pesan yang jelas.
  const { error } = await supabase.rpc('mark_read', { p_card: card });
  if (error) throw new Error('Belum bisa menandai sudah dibaca');
  revalidatePath(`/sop/c/${card}`);
  revalidatePath('/');
}
