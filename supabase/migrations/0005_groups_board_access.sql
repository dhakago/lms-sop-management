-- LMS People Excellence, migrasi 0005 (M3): grup pengguna, akses board per unit, grup, atau orang,
-- dan penugasan baca ke grup atau orang. Jalankan sekali di Supabase, menu SQL Editor, setelah 0004.
--
-- Aturan:
-- 1. Holding tetap batas keras. Board hanya terlihat oleh holding yang dibuka untuknya.
-- 2. Di dalam holding yang dibuka, akses bisa dipersempit ke unit, grup, atau orang (peran Pembaca).
--    Bila tidak ada baris pembaca untuk holding itu, seluruh holding boleh membaca (perilaku M2).
-- 3. Peran Editor hanya untuk admin yang punya akses SOP, dan hanya mempersempit siapa yang boleh mengubah.
-- 4. Penugasan baca tidak membuka akses. Penugasan ke orang atau grup hanya berlaku bagi yang juga bisa membaca board.

-- ============ Grup ============
create table groups (
  id uuid primary key default gen_random_uuid(),
  holding_id text not null references holdings (id),
  name text not null check (char_length(name) between 1 and 64),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create unique index groups_name_per_holding on groups (holding_id, lower(name));

create table group_members (
  group_id uuid not null references groups (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index group_members_profile on group_members (profile_id);

create or replace function group_holding(g uuid) returns text
language sql stable security definer set search_path = public as $$
  select holding_id from groups where id = g
$$;

-- Anggota grup harus punya keanggotaan aktif di holding grup itu.
create or replace function check_group_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from memberships m
    where m.profile_id = new.profile_id and m.holding_id = group_holding(new.group_id) and m.ended_on is null
  ) then
    raise exception 'anggota harus punya keanggotaan aktif di holding grup';
  end if;
  return new;
end $$;
create trigger group_members_check before insert on group_members
  for each row execute function check_group_member();

-- ============ Akses board ============
create table board_access (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards (id) on delete cascade,
  holding_id text not null references holdings (id),
  subject_type text not null check (subject_type in ('unit', 'group', 'user')),
  unit text,
  group_id uuid references groups (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  role text not null check (role in ('pembaca', 'editor')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check (
    (subject_type = 'unit'  and unit is not null and group_id is null and profile_id is null) or
    (subject_type = 'group' and group_id is not null and unit is null and profile_id is null) or
    (subject_type = 'user'  and profile_id is not null and unit is null and group_id is null)
  ),
  -- Editor: hanya orang, dicatat di holding PEOPLE. Pembaca: holding peserta, bukan PEOPLE.
  check (
    (role = 'editor' and subject_type = 'user' and holding_id = 'people') or
    (role = 'pembaca' and holding_id <> 'people')
  )
);
create index board_access_board on board_access (board_id);
create unique index board_access_unit on board_access (board_id, holding_id, role, unit) where subject_type = 'unit';
create unique index board_access_group on board_access (board_id, holding_id, role, group_id) where subject_type = 'group';
create unique index board_access_user on board_access (board_id, holding_id, role, profile_id) where subject_type = 'user';

-- ============ Penugasan baca ke grup atau orang ============
alter table playbook_requirements
  add column target_type text not null default 'holding' check (target_type in ('holding', 'group', 'user')),
  add column group_id uuid references groups (id) on delete cascade,
  add column profile_id uuid references profiles (id) on delete cascade,
  add constraint playbook_requirements_target check (
    (target_type = 'holding' and group_id is null and profile_id is null) or
    (target_type = 'group'  and group_id is not null and profile_id is null and unit is null) or
    (target_type = 'user'   and profile_id is not null and group_id is null and unit is null)
  );

-- ============ Fungsi akses ============
-- Apakah pengguna u lolos pembatasan pembaca di holding h untuk board b.
-- Tanpa baris pembaca untuk (b, h), seluruh holding lolos.
create or replace function board_reader_ok(b uuid, h text, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    not exists (select 1 from board_access a where a.board_id = b and a.holding_id = h and a.role = 'pembaca')
    or exists (
      select 1 from board_access a
      where a.board_id = b and a.holding_id = h and a.role = 'pembaca' and (
        (a.subject_type = 'user' and a.profile_id = u)
        or (a.subject_type = 'group' and exists (
              select 1 from group_members gm where gm.group_id = a.group_id and gm.profile_id = u))
        or (a.subject_type = 'unit' and exists (
              select 1 from memberships m
              where m.profile_id = u and m.holding_id = h and m.ended_on is null and m.unit = a.unit))
      )
    )
$$;

create or replace function can_view_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from boards bo
    join board_holdings bh on bh.board_id = bo.id
    where bo.id = b
      and (
        (not bo.archived and bh.holding_id in (select my_holdings()) and board_reader_ok(b, bh.holding_id, auth.uid()))
        or has_access(bh.holding_id, 'sop')
      )
  )
$$;

-- Mengubah board: aturan M2, ditambah daftar Editor. Bila board punya daftar Editor, hanya mereka
-- (dan superadmin) yang boleh mengubah. Daftar Editor hanya mempersempit, tidak menambah hak.
create or replace function can_edit_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    and exists (select 1 from board_holdings where board_id = b)
    and not exists (
      select 1 from board_holdings bh
      where bh.board_id = b and bh.holding_id <> 'people' and not has_access(bh.holding_id, 'sop')
    )
    and (
      is_superadmin()
      or not exists (select 1 from board_access a where a.board_id = b and a.role = 'editor')
      or exists (select 1 from board_access a where a.board_id = b and a.role = 'editor' and a.profile_id = auth.uid())
    )
$$;

-- Apakah pengguna u adalah admin yang boleh jadi Editor board b (admin atau superadmin, punya akses SOP ke semua holding board).
create or replace function can_be_board_editor(b uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = u and p.active and p.role = 'superadmin')
    or (
      exists (select 1 from profiles p where p.id = u and p.active and p.role = 'admin')
      and not exists (
        select 1 from board_holdings bh
        where bh.board_id = b and bh.holding_id <> 'people'
          and not exists (select 1 from admin_access a
                          where a.profile_id = u and a.holding_id = bh.holding_id and a.module = 'sop')
      )
    )
$$;

-- Apakah pengguna u punya keanggotaan aktif di holding h.
create or replace function is_member_of(u uuid, h text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.profile_id = u and m.holding_id = h and m.ended_on is null)
$$;

-- Apakah playbook pb ditugaskan kepada pengguna saat ini sebagai peserta holding h.
create or replace function is_assigned(pb uuid, h text) returns boolean
language sql stable security definer set search_path = public as $$
  select h in (select my_holdings()) and exists (
    select 1 from playbook_requirements r
    where r.playbook_id = pb and r.holding_id = h and (
      (r.target_type = 'holding' and (r.unit is null or exists (
          select 1 from memberships m
          where m.profile_id = auth.uid() and m.holding_id = h and m.ended_on is null and m.unit = r.unit)))
      or (r.target_type = 'group' and exists (
          select 1 from group_members gm where gm.group_id = r.group_id and gm.profile_id = auth.uid()))
      or (r.target_type = 'user' and r.profile_id = auth.uid())
    )
  )
$$;

-- Menandai sudah dibaca: sekarang butuh penugasan, bukan hanya akses. Penolakan terjadi di database.
create or replace function mark_read(p_card uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_board uuid;
  v_ver uuid;
  v_pb uuid;
  v_hold text;
begin
  v_board := board_of_card(p_card);
  if v_board is null or not can_view_board(v_board) then raise exception 'tidak punya akses'; end if;
  select current_version_id, playbook_id into v_ver, v_pb from cards where id = p_card and status = 'published';
  if v_ver is null then raise exception 'card belum terbit'; end if;

  select bh.holding_id into v_hold
  from board_holdings bh
  where bh.board_id = v_board
    and bh.holding_id in (select my_holdings())
    and board_reader_ok(v_board, bh.holding_id, auth.uid())
    and is_assigned(v_pb, bh.holding_id)
  order by bh.holding_id limit 1;
  if v_hold is null then raise exception 'SOP ini tidak ditugaskan kepada Anda'; end if;

  insert into read_receipts (profile_id, card_id, version_id, holding_id)
  values (auth.uid(), p_card, v_ver, v_hold)
  on conflict do nothing;
end $$;

-- ============ Audit ============
create or replace function audit_board_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare r board_access;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  perform log_event(case when tg_op = 'DELETE' then 'board.access.revoke' else 'board.access.grant' end,
    'board', r.board_id::text, case when r.holding_id = 'people' then null else r.holding_id end,
    jsonb_build_object('role', r.role, 'subject', r.subject_type, 'unit', r.unit,
                       'group', r.group_id, 'profile', r.profile_id));
  return r;
end $$;
create trigger board_access_audit after insert or delete on board_access
  for each row execute function audit_board_access();

create or replace function audit_requirement() returns trigger
language plpgsql security definer set search_path = public as $$
declare r playbook_requirements;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  perform log_event(case when tg_op = 'DELETE' then 'sop.assign.revoke' else 'sop.assign' end,
    'playbook', r.playbook_id::text, r.holding_id,
    jsonb_build_object('target', r.target_type, 'unit', r.unit, 'group', r.group_id,
                       'profile', r.profile_id, 'due_on', r.due_on));
  return r;
end $$;
create trigger playbook_requirements_audit after insert or delete on playbook_requirements
  for each row execute function audit_requirement();

-- ============ Row Level Security ============
alter table groups enable row level security;
alter table group_members enable row level security;
alter table board_access enable row level security;

-- groups: admin dengan akses pengguna, SOP, atau pembelajaran di holding itu, dan anggotanya sendiri.
create policy groups_read on groups for select to authenticated using (
  has_access(holding_id, 'pengguna') or has_access(holding_id, 'sop') or has_access(holding_id, 'pembelajaran')
  or exists (select 1 from group_members gm where gm.group_id = groups.id and gm.profile_id = auth.uid())
);
create policy groups_write on groups for all to authenticated
  using (has_access(holding_id, 'pengguna')) with check (has_access(holding_id, 'pengguna'));

create policy group_members_read on group_members for select to authenticated using (
  profile_id = auth.uid()
  or has_access(group_holding(group_id), 'pengguna') or has_access(group_holding(group_id), 'sop')
  or has_access(group_holding(group_id), 'pembelajaran')
);
create policy group_members_write on group_members for all to authenticated
  using (has_access(group_holding(group_id), 'pengguna'))
  with check (has_access(group_holding(group_id), 'pengguna'));

-- board_access: hanya yang boleh mengubah board yang melihat dan menulisnya.
create policy board_access_read on board_access for select to authenticated using (can_edit_board(board_id));
create policy board_access_write on board_access for all to authenticated
  using (can_edit_board(board_id))
  with check (
    can_edit_board(board_id)
    and (
      (role = 'editor' and can_be_board_editor(board_id, profile_id))
      or (
        role = 'pembaca'
        and has_access(holding_id, 'sop')
        and exists (select 1 from board_holdings bh where bh.board_id = board_access.board_id and bh.holding_id = board_access.holding_id)
        and (subject_type = 'unit'
             or (subject_type = 'group' and group_holding(group_id) = holding_id)
             or (subject_type = 'user' and is_member_of(profile_id, holding_id)))
      )
    )
  );

-- Penugasan baca: peserta hanya melihat baris yang menyasar dirinya. Pengubah board melihat semuanya.
drop policy if exists requirements_read on playbook_requirements;
create policy requirements_read on playbook_requirements for select to authenticated using (
  can_edit_board(board_of_playbook(playbook_id))
  or (
    can_view_board(board_of_playbook(playbook_id)) and (
      (target_type = 'holding' and holding_id in (select my_holdings()))
      or (target_type = 'group' and exists (
            select 1 from group_members gm where gm.group_id = playbook_requirements.group_id and gm.profile_id = auth.uid()))
      or (target_type = 'user' and profile_id = auth.uid())
    )
  )
);

drop policy if exists requirements_write on playbook_requirements;
create policy requirements_write on playbook_requirements for all to authenticated
  using (can_edit_board(board_of_playbook(playbook_id)) and has_access(holding_id, 'sop'))
  with check (
    can_edit_board(board_of_playbook(playbook_id)) and has_access(holding_id, 'sop')
    and exists (select 1 from board_holdings bh
                where bh.board_id = board_of_playbook(playbook_id) and bh.holding_id = playbook_requirements.holding_id)
    and (
      target_type = 'holding'
      or (target_type = 'group' and group_holding(group_id) = holding_id)
      or (target_type = 'user' and is_member_of(profile_id, holding_id)
          and board_reader_ok(board_of_playbook(playbook_id), holding_id, profile_id))
    )
  );

-- ============ Hak akses tingkat tabel ============
grant select on groups, group_members, board_access to authenticated;
grant insert, update, delete on groups, group_members, board_access to authenticated;
grant execute on function group_holding(uuid), board_reader_ok(uuid, text, uuid), can_be_board_editor(uuid, uuid),
  is_member_of(uuid, text), is_assigned(uuid, text) to authenticated;
grant execute on function can_view_board(uuid), can_edit_board(uuid), mark_read(uuid) to authenticated;
