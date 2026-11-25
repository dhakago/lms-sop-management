-- LMS People Excellence, migrasi 0006 (M3): izin tingkat library dan playbook (seperti dialog Permissions di Whale),
-- ahli, interval review, dan saklar terbit atau sembunyikan playbook. Jalankan sekali di Supabase setelah 0005.
--
-- Aturan:
-- 1. Izin library dan playbook hanya mempersempit apa yang dibolehkan induknya. Board membuka, library dan playbook mempersempit.
-- 2. Per holding: tanpa baris pembaca berarti semua orang holding itu boleh membaca. Ada baris pembaca berarti hanya yang tercantum.
--    Baris "Semua pengguna, Tanpa akses" menyembunyikan node dari seluruh holding itu.
-- 3. Penulis (editor) hanya untuk admin PEOPLE dengan akses SOP, dan hanya mempersempit siapa yang boleh mengubah.
-- 4. Playbook yang disembunyikan tidak terlihat peserta dan tidak bisa menerima bacaan. Pengubah tetap melihatnya.

alter table playbooks
  add column expert_id uuid references profiles (id) on delete set null,
  add column review_interval text not null default '3m' check (review_interval in ('never', '1w', '2w', '1m', '3m', '6m', '1y', '3y')),
  add column reviewed_at timestamptz not null default now(),
  add column hidden boolean not null default false;

-- ============ Izin library ============
create table library_access (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries (id) on delete cascade,
  holding_id text not null references holdings (id),
  subject_type text not null check (subject_type in ('all', 'unit', 'group', 'user')),
  unit text,
  group_id uuid references groups (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  role text not null check (role in ('pembaca', 'editor')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check (
    (subject_type = 'all'   and unit is null and group_id is null and profile_id is null and role = 'pembaca')
    or (subject_type = 'unit'  and unit is not null and group_id is null and profile_id is null)
    or (subject_type = 'group' and group_id is not null and unit is null and profile_id is null)
    or (subject_type = 'user'  and profile_id is not null and unit is null and group_id is null)
  ),
  check (role <> 'editor' or (subject_type = 'user' and holding_id = 'people')),
  check (role <> 'pembaca' or holding_id <> 'people')
);
-- subject_type 'all' berarti baris "Semua pengguna" holding itu diatur ke Tanpa akses (menyembunyikan dari seluruh holding).
create index library_access_node on library_access (library_id);
create unique index library_access_uq_all on library_access (library_id, holding_id) where subject_type = 'all';
create unique index library_access_uq_unit on library_access (library_id, holding_id, unit) where subject_type = 'unit';
create unique index library_access_uq_group on library_access (library_id, group_id) where subject_type = 'group';
create unique index library_access_uq_user on library_access (library_id, holding_id, profile_id) where subject_type = 'user' and role = 'pembaca';
create unique index library_access_uq_editor on library_access (library_id, profile_id) where role = 'editor';

-- Aturan sama dengan board: tanpa baris pembaca di holding itu, semua orang holding boleh membaca.
-- Baris 'all' (Tanpa akses) tidak cocok dengan siapa pun, jadi hanya baris lain yang membuka.
create or replace function library_reader_ok(n uuid, h text, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from library_access a where a.library_id = n and a.holding_id = h and a.role = 'pembaca')
    or exists (
      select 1 from library_access a
      where a.library_id = n and a.holding_id = h and a.role = 'pembaca' and (
        (a.subject_type = 'user' and a.profile_id = u)
        or (a.subject_type = 'group' and exists (select 1 from group_members gm where gm.group_id = a.group_id and gm.profile_id = u))
        or (a.subject_type = 'unit' and exists (
              select 1 from memberships m where m.profile_id = u and m.holding_id = h and m.ended_on is null and m.unit = a.unit))
      )
    )
$$;

create or replace function library_editor_ok(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin()
    or not exists (select 1 from library_access a where a.library_id = n and a.role = 'editor')
    or exists (select 1 from library_access a where a.library_id = n and a.role = 'editor' and a.profile_id = auth.uid())
$$;

create or replace function audit_library_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare r library_access;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  perform log_event(case when tg_op = 'DELETE' then 'library.access.revoke' else 'library.access.grant' end,
    'library', r.library_id::text, case when r.holding_id = 'people' then null else r.holding_id end,
    jsonb_build_object('role', r.role, 'subject', r.subject_type, 'unit', r.unit, 'group', r.group_id, 'profile', r.profile_id));
  return r;
end $$;
create trigger library_access_audit after insert or delete on library_access for each row execute function audit_library_access();
alter table library_access enable row level security;
grant select, insert, update, delete on library_access to authenticated;

-- ============ Izin playbook ============
create table playbook_access (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references playbooks (id) on delete cascade,
  holding_id text not null references holdings (id),
  subject_type text not null check (subject_type in ('all', 'unit', 'group', 'user')),
  unit text,
  group_id uuid references groups (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  role text not null check (role in ('pembaca', 'editor')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check (
    (subject_type = 'all'   and unit is null and group_id is null and profile_id is null and role = 'pembaca')
    or (subject_type = 'unit'  and unit is not null and group_id is null and profile_id is null)
    or (subject_type = 'group' and group_id is not null and unit is null and profile_id is null)
    or (subject_type = 'user'  and profile_id is not null and unit is null and group_id is null)
  ),
  check (role <> 'editor' or (subject_type = 'user' and holding_id = 'people')),
  check (role <> 'pembaca' or holding_id <> 'people')
);
-- subject_type 'all' berarti baris "Semua pengguna" holding itu diatur ke Tanpa akses (menyembunyikan dari seluruh holding).
create index playbook_access_node on playbook_access (playbook_id);
create unique index playbook_access_uq_all on playbook_access (playbook_id, holding_id) where subject_type = 'all';
create unique index playbook_access_uq_unit on playbook_access (playbook_id, holding_id, unit) where subject_type = 'unit';
create unique index playbook_access_uq_group on playbook_access (playbook_id, group_id) where subject_type = 'group';
create unique index playbook_access_uq_user on playbook_access (playbook_id, holding_id, profile_id) where subject_type = 'user' and role = 'pembaca';
create unique index playbook_access_uq_editor on playbook_access (playbook_id, profile_id) where role = 'editor';

-- Aturan sama dengan board: tanpa baris pembaca di holding itu, semua orang holding boleh membaca.
-- Baris 'all' (Tanpa akses) tidak cocok dengan siapa pun, jadi hanya baris lain yang membuka.
create or replace function playbook_reader_ok(n uuid, h text, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from playbook_access a where a.playbook_id = n and a.holding_id = h and a.role = 'pembaca')
    or exists (
      select 1 from playbook_access a
      where a.playbook_id = n and a.holding_id = h and a.role = 'pembaca' and (
        (a.subject_type = 'user' and a.profile_id = u)
        or (a.subject_type = 'group' and exists (select 1 from group_members gm where gm.group_id = a.group_id and gm.profile_id = u))
        or (a.subject_type = 'unit' and exists (
              select 1 from memberships m where m.profile_id = u and m.holding_id = h and m.ended_on is null and m.unit = a.unit))
      )
    )
$$;

create or replace function playbook_editor_ok(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin()
    or not exists (select 1 from playbook_access a where a.playbook_id = n and a.role = 'editor')
    or exists (select 1 from playbook_access a where a.playbook_id = n and a.role = 'editor' and a.profile_id = auth.uid())
$$;

create or replace function audit_playbook_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare r playbook_access;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  perform log_event(case when tg_op = 'DELETE' then 'playbook.access.revoke' else 'playbook.access.grant' end,
    'playbook', r.playbook_id::text, case when r.holding_id = 'people' then null else r.holding_id end,
    jsonb_build_object('role', r.role, 'subject', r.subject_type, 'unit', r.unit, 'group', r.group_id, 'profile', r.profile_id));
  return r;
end $$;
create trigger playbook_access_audit after insert or delete on playbook_access for each row execute function audit_playbook_access();
alter table playbook_access enable row level security;
grant select, insert, update, delete on playbook_access to authenticated;

-- ============ Fungsi gabungan ============
create or replace function playbook_of_card(c uuid) returns uuid
language sql stable security definer set search_path = public as $$ select playbook_id from cards where id = c $$;

create or replace function library_of_playbook(p uuid) returns uuid
language sql stable security definer set search_path = public as $$ select library_id from playbooks where id = p $$;

-- Apakah pengguna u, sebagai peserta holding h, boleh membaca playbook p (rantai board, library, playbook, dan tidak disembunyikan).
create or replace function playbook_member_ok(p uuid, h text, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from playbooks pb
    join libraries li on li.id = pb.library_id
    join boards bo on bo.id = li.board_id
    join board_holdings bh on bh.board_id = bo.id and bh.holding_id = h
    where pb.id = p and not pb.hidden and not bo.archived
      and board_reader_ok(bo.id, h, u) and library_reader_ok(li.id, h, u) and playbook_reader_ok(p, h, u)
  )
$$;

create or replace function can_view_library(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from libraries li
    join boards bo on bo.id = li.board_id
    join board_holdings bh on bh.board_id = bo.id
    where li.id = l and (
      (not bo.archived and bh.holding_id in (select my_holdings())
         and board_reader_ok(bo.id, bh.holding_id, auth.uid()) and library_reader_ok(l, bh.holding_id, auth.uid()))
      or has_access(bh.holding_id, 'sop')
    )
  )
$$;

create or replace function can_view_playbook(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from playbooks pb
    join libraries li on li.id = pb.library_id
    join board_holdings bh on bh.board_id = li.board_id
    where pb.id = p and (
      (bh.holding_id in (select my_holdings()) and playbook_member_ok(p, bh.holding_id, auth.uid()))
      or has_access(bh.holding_id, 'sop')
    )
  )
$$;

create or replace function can_edit_library(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_edit_board(board_of_library(l)) and library_editor_ok(l)
$$;

create or replace function can_edit_playbook(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_edit_board(board_of_playbook(p)) and library_editor_ok(library_of_playbook(p)) and playbook_editor_ok(p)
$$;

-- Admin yang boleh jadi Penulis library atau playbook: admin PEOPLE (atau superadmin) yang boleh mengubah boardnya.
create or replace function can_be_node_editor(b uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$ select can_be_board_editor(b, u) $$;

-- ============ Kebijakan baris ============
drop policy libraries_read on libraries;
drop policy libraries_write on libraries;
create policy libraries_read on libraries for select to authenticated using (can_view_library(id));
create policy libraries_insert on libraries for insert to authenticated with check (can_edit_board(board_id));
create policy libraries_update on libraries for update to authenticated using (can_edit_library(id)) with check (can_edit_library(id));
create policy libraries_delete on libraries for delete to authenticated using (can_edit_library(id));

drop policy playbooks_read on playbooks;
drop policy playbooks_write on playbooks;
create policy playbooks_read on playbooks for select to authenticated using (can_view_playbook(id));
create policy playbooks_insert on playbooks for insert to authenticated with check (can_edit_library(library_id));
create policy playbooks_update on playbooks for update to authenticated using (can_edit_playbook(id)) with check (can_edit_playbook(id));
create policy playbooks_delete on playbooks for delete to authenticated using (can_edit_playbook(id));

drop policy cards_read on cards;
drop policy cards_write on cards;
create policy cards_read on cards for select to authenticated using (
  can_edit_playbook(playbook_id) or (status = 'published' and can_view_playbook(playbook_id))
);
create policy cards_insert on cards for insert to authenticated with check (can_edit_playbook(playbook_id));
create policy cards_update on cards for update to authenticated using (can_edit_playbook(playbook_id)) with check (can_edit_playbook(playbook_id));
create policy cards_delete on cards for delete to authenticated using (can_edit_playbook(playbook_id));

drop policy versions_read on card_versions;
create policy versions_read on card_versions for select to authenticated using (can_view_playbook(playbook_of_card(card_id)));

drop policy requirements_read on playbook_requirements;
create policy requirements_read on playbook_requirements for select to authenticated using (
  can_edit_playbook(playbook_id)
  or (
    can_view_playbook(playbook_id) and (
      (target_type = 'holding' and holding_id in (select my_holdings()))
      or (target_type = 'group' and exists (
            select 1 from group_members gm where gm.group_id = playbook_requirements.group_id and gm.profile_id = auth.uid()))
      or (target_type = 'user' and profile_id = auth.uid())
    )
  )
);
drop policy requirements_write on playbook_requirements;
create policy requirements_write on playbook_requirements for all to authenticated
  using (can_edit_playbook(playbook_id) and has_access(holding_id, 'sop'))
  with check (
    can_edit_playbook(playbook_id) and has_access(holding_id, 'sop')
    and exists (select 1 from board_holdings bh
                where bh.board_id = board_of_playbook(playbook_id) and bh.holding_id = playbook_requirements.holding_id)
    and (
      target_type = 'holding'
      or (target_type = 'group' and group_holding(group_id) = holding_id)
      or (target_type = 'user' and is_member_of(profile_id, holding_id) and playbook_member_ok(playbook_id, holding_id, profile_id))
    )
  );

-- Siapa yang boleh menulis izin library dan playbook: pengubah node itu.
create policy library_access_read on library_access for select to authenticated using (can_edit_library(library_id));
create policy library_access_write on library_access for all to authenticated
  using (can_edit_library(library_id))
  with check (
    can_edit_library(library_id)
    and (
      (role = 'editor' and can_be_board_editor(board_of_library(library_id), profile_id))
      or (
        role = 'pembaca'
        and has_access(holding_id, 'sop')
        and exists (select 1 from board_holdings bh where bh.board_id = board_of_library(library_id) and bh.holding_id = library_access.holding_id)
        and (subject_type in ('all', 'unit')
             or (subject_type = 'group' and group_holding(group_id) = holding_id)
             or (subject_type = 'user' and is_member_of(profile_id, holding_id)))
      )
    )
  );
create policy playbook_access_read on playbook_access for select to authenticated using (can_edit_playbook(playbook_id));
create policy playbook_access_write on playbook_access for all to authenticated
  using (can_edit_playbook(playbook_id))
  with check (
    can_edit_playbook(playbook_id)
    and (
      (role = 'editor' and can_be_board_editor(board_of_playbook(playbook_id), profile_id))
      or (
        role = 'pembaca'
        and has_access(holding_id, 'sop')
        and exists (select 1 from board_holdings bh where bh.board_id = board_of_playbook(playbook_id) and bh.holding_id = playbook_access.holding_id)
        and (subject_type in ('all', 'unit')
             or (subject_type = 'group' and group_holding(group_id) = holding_id)
             or (subject_type = 'user' and is_member_of(profile_id, holding_id)))
      )
    )
  );

-- ============ Menerbitkan dan menandai baca ============
create or replace function publish_card(p_card uuid, p_change change_kind default 'kecil', p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_board uuid;
  v_card cards;
  v_ver int;
  v_id uuid;
  v_h text;
begin
  select * into v_card from cards where id = p_card;
  if not found then raise exception 'card tidak ditemukan'; end if;
  v_board := board_of_card(p_card);
  if not can_edit_playbook(v_card.playbook_id) then raise exception 'tidak punya akses menerbitkan card ini'; end if;

  select coalesce(max(version), 0) + 1 into v_ver from card_versions where card_id = p_card;
  insert into card_versions (card_id, version, title, content, change, note, published_by)
  values (p_card, v_ver, v_card.title, v_card.draft_content, p_change, p_note, auth.uid())
  returning id into v_id;

  update cards set status = 'published', current_version_id = v_id where id = p_card;

  for v_h in select holding_id from board_holdings where board_id = v_board loop
    perform log_event('card.publish', 'card', p_card::text, v_h,
      jsonb_build_object('version', v_ver, 'change', p_change, 'board', v_board));
  end loop;
  return v_id;
end $$;

create or replace function mark_read(p_card uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_board uuid;
  v_ver uuid;
  v_pb uuid;
  v_hold text;
begin
  v_board := board_of_card(p_card);
  select playbook_id into v_pb from cards where id = p_card;
  if v_board is null or v_pb is null or not can_view_playbook(v_pb) then raise exception 'tidak punya akses'; end if;
  select current_version_id into v_ver from cards where id = p_card and status = 'published';
  if v_ver is null then raise exception 'card belum terbit'; end if;

  select bh.holding_id into v_hold
  from board_holdings bh
  where bh.board_id = v_board
    and bh.holding_id in (select my_holdings())
    and playbook_member_ok(v_pb, bh.holding_id, auth.uid())
    and is_assigned(v_pb, bh.holding_id)
  order by bh.holding_id limit 1;
  if v_hold is null then raise exception 'SOP ini tidak ditugaskan kepada Anda'; end if;

  insert into read_receipts (profile_id, card_id, version_id, holding_id)
  values (auth.uid(), p_card, v_ver, v_hold)
  on conflict do nothing;
end $$;

grant execute on function playbook_of_card(uuid), library_of_playbook(uuid), playbook_member_ok(uuid, text, uuid),
  library_reader_ok(uuid, text, uuid), playbook_reader_ok(uuid, text, uuid), library_editor_ok(uuid), playbook_editor_ok(uuid),
  can_view_library(uuid), can_view_playbook(uuid), can_edit_library(uuid), can_edit_playbook(uuid), can_be_node_editor(uuid, uuid),
  publish_card(uuid, change_kind, text), mark_read(uuid) to authenticated;
