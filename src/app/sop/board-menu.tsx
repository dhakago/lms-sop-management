import { Menu, MenuDialog } from './Pop';
import { ArchiveForm, BoardForm } from '@/app/kelola/sop/forms';
import { loadBoardPerms } from '@/lib/perm';
import type { PermOptions, PermState } from '@/lib/perm-types';
import type { Ctx } from '@/lib/session';

// Menu titik tiga board: ubah (termasuk Permissions) dan arsipkan. Hanya dirender untuk admin yang berhak.
// perm bisa dikirim dari halaman yang sudah memuatnya, bila tidak dimuat di sini.
export async function BoardMenu({ id, name, description, owner, archived, boardLabel, ctx, perm }: {
  id: string; name: string; description: string | null; owner: string | null; archived: boolean; boardLabel: string; ctx: Ctx;
  perm?: { init: PermState; options: PermOptions };
}) {
  const p = perm ?? await (async () => {
    const all = await loadBoardPerms(ctx, id, { board: boardLabel, library: 'Library', playbook: 'Playbook' }, [], []);
    return { init: all.board, options: all.options.board };
  })();
  return (
    <Menu label={`Menu ${boardLabel.toLowerCase()}`}>
      <MenuDialog label="Ubah" title={`Ubah ${boardLabel.toLowerCase()}`}>
        <BoardForm id={id} name={name} description={description ?? ''} owner={owner ?? ''} labels={{ board: boardLabel }} perm={p} />
      </MenuDialog>
      <MenuDialog label={archived ? 'Buka kembali' : 'Arsipkan'} title={archived ? `Buka kembali ${boardLabel.toLowerCase()}` : `Arsipkan ${boardLabel.toLowerCase()}`} danger={!archived}>
        <ArchiveForm id={id} archived={archived} />
      </MenuDialog>
    </Menu>
  );
}
