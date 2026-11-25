import { createClient } from '@/lib/supabase/server';
import { canAccess } from '@/lib/authz';
import { fmtDate } from '@/lib/sop';
import { groupsOf, peopleByIds, unitsOf } from '@/lib/people';
import { THEMES, type HoldingId } from '@/lib/theme';
import type { Ctx } from '@/lib/session';
import { Menu, MenuDialog } from './Pop';
import { AddRequirementForm, PlaybookForm, RemoveNodeForm, RemoveRequirementForm } from '@/app/kelola/sop/forms';
import { loadBoardPerms } from '@/lib/perm';

type Terms = { board: string; library: string; playbook: string; card: string };

// Pengaturan playbook untuk admin: target wajib baca, ubah nama, hapus. Tampil di panel kiri halaman card.
export async function PlaybookAdmin({ ctx, terms, id, name, description, boardId }: {
  ctx: Ctx; terms: Terms; id: string; name: string; description: string | null; boardId: string;
}) {
  const supabase = await createClient();
  const { data: bh } = await supabase.from('board_holdings').select('holding_id').eq('board_id', boardId);
  const boardHoldings = (bh ?? []).map((h) => h.holding_id as HoldingId);
  const targetHoldings = boardHoldings.filter((h) => h !== 'people' && canAccess(ctx, h, 'sop'));
  const { data: self } = await supabase.from('playbooks').select('expert_id, review_interval, hidden').eq('id', id).maybeSingle();
  const perms = await loadBoardPerms(ctx, boardId, { board: terms.board, library: terms.library, playbook: terms.playbook }, [], [id]);
  const { data: reqRows } = await supabase.from('playbook_requirements').select('id, holding_id, due_on, unit, target_type, group_id, profile_id').eq('playbook_id', id);
  const reqs = [...(reqRows ?? [])].sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));
  const unitMap = await unitsOf(targetHoldings);
  const units = [...new Set(Object.values(unitMap).flat())].sort((a, b) => a.localeCompare(b, 'id'));
  const groups = (await groupsOf(boardHoldings.filter((h) => h !== 'people'))).map((g) => ({ id: g.id, name: g.name, holding: g.holding_id, holdingName: THEMES[g.holding_id].name }));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const who = await peopleByIds(reqs.map((r) => r.profile_id as string | null).filter((x): x is string => !!x));
  const label = (r: (typeof reqs)[number]) =>
    r.target_type === 'group' ? `Grup ${groupName.get(r.group_id as string) ?? ''}`
    : r.target_type === 'user' ? (who.get(r.profile_id as string)?.name ?? 'Orang')
    : `${THEMES[r.holding_id as HoldingId].name}${r.unit ? `, unit ${r.unit}` : ', semua unit'}`;

  return (
    <Menu label={`Menu ${terms.playbook.toLowerCase()}`}>
      <MenuDialog label="Tugaskan baca" title="Tugaskan baca">
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>Siapa yang ditugaskan (holding atau unit, grup, atau orang) dan batas waktunya. Penugasan tidak membuka akses: sasaran harus sudah bisa membaca board ini. Penugasan muncul di Beranda mereka dan hanya mereka yang bisa menandai sudah dibaca. Hanya {terms.card.toLowerCase()} yang terbit yang dihitung.</p>
        <div className="list">
          {reqs.map((r) => (
            <div key={r.id} className="list-row">
              <div className="grow">
                <b>{label(r)}</b>
                <span className="muted">Batas {fmtDate(r.due_on)}</span>
              </div>
              {canAccess(ctx, r.holding_id as HoldingId, 'sop') && <RemoveRequirementForm id={r.id} />}
            </div>
          ))}
          {reqs.length === 0 && <p className="muted" style={{ padding: '8px 0' }}>Belum ada penugasan. Tanpa penugasan, {terms.playbook.toLowerCase()} ini hanya bisa dibaca.</p>}
        </div>
        {targetHoldings.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <AddRequirementForm playbook={id} holdings={targetHoldings.map((h) => ({ id: h, name: THEMES[h].name }))} units={units} groups={groups} />
          </div>
        )}
      </MenuDialog>
      <MenuDialog label="Ubah" title={`Ubah ${terms.playbook.toLowerCase()}`}>
        <PlaybookForm id={id} name={name} description={description ?? ''} label={terms.playbook} expert={self?.expert_id ?? null} interval={self?.review_interval ?? '3m'} published={!(self?.hidden ?? false)}
          admins={perms.options.playbook.admins} perm={{ init: perms.playbooks[id]!, options: perms.options.playbook }} />
      </MenuDialog>
      <MenuDialog label="Hapus" title={`Hapus ${terms.playbook.toLowerCase()}`} danger><RemoveNodeForm kind="playbook" id={id} what={terms.playbook.toLowerCase()} /></MenuDialog>
    </Menu>
  );
}
