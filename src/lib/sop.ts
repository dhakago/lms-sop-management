import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Ctx } from '@/lib/session';

export type MandatoryItem = {
  playbookId: string;
  playbook: string;
  dueOn: string;
  total: number;
  read: number;
  late: boolean;
};

// SOP wajib dibaca untuk holding aktif: target dan batas waktu ada di tingkat playbook.
export async function getMandatory(ctx: Ctx): Promise<MandatoryItem[]> {
  const supabase = await createClient();
  const unit = ctx.memberships.find((m) => m.holding_id === ctx.holding)?.unit ?? null;

  const { data: reqs } = await supabase
    .from('playbook_requirements')
    .select('playbook_id, due_on, unit, playbooks(id, name, cards(id, status, current_version_id))')
    .eq('holding_id', ctx.holding);

  const { data: receipts } = await supabase.from('read_receipts').select('version_id').eq('profile_id', ctx.userId);
  const done = new Set((receipts ?? []).map((r) => r.version_id));
  const today = new Date().toISOString().slice(0, 10);

  const out: MandatoryItem[] = [];
  for (const r of reqs ?? []) {
    if (r.unit && r.unit !== unit) continue;
    const pb = r.playbooks as unknown as { id: string; name: string; cards: { id: string; status: string; current_version_id: string | null }[] } | null;
    if (!pb) continue;
    const cards = pb.cards.filter((c) => c.status === 'published' && c.current_version_id);
    const read = cards.filter((c) => done.has(c.current_version_id!)).length;
    if (cards.length === 0) continue;
    out.push({ playbookId: pb.id, playbook: pb.name, dueOn: r.due_on, total: cards.length, read, late: read < cards.length && r.due_on < today });
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
