-- PEOPLE bukan holding yang dipilih: ia selalu ikut membuka setiap board.
-- Karena itu PEOPLE tidak dihitung sebagai syarat akses admin, dan admin boleh menambahkannya otomatis.

-- 1. Semua board yang sudah ada otomatis dibuka juga untuk PEOPLE.
insert into board_holdings (board_id, holding_id)
select b.id, 'people' from boards b
where not exists (select 1 from board_holdings bh where bh.board_id = b.id and bh.holding_id = 'people');

-- 2. Mengubah board: admin harus punya akses SOP ke semua holding board, kecuali PEOPLE.
create or replace function can_edit_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    and exists (select 1 from board_holdings where board_id = b)
    and not exists (
      select 1 from board_holdings bh
      where bh.board_id = b and bh.holding_id <> 'people' and not has_access(bh.holding_id, 'sop')
    )
$$;

-- 3. Menambah holding ke board: PEOPLE boleh ditambahkan oleh admin yang berhak mengubah board.
drop policy if exists board_holdings_insert on board_holdings;
create policy board_holdings_insert on board_holdings for insert to authenticated with check (
  is_admin()
  and (holding_id = 'people' or has_access(holding_id, 'sop'))
  and (can_edit_board(board_id) or board_creator_open(board_id))
);
