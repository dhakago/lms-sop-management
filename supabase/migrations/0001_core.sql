-- LMS People Excellence, migrasi 0001: fondasi, pemisahan data per holding, dan SOP dasar.
-- Jalankan sekali di Supabase, menu SQL Editor. Aman dijalankan ulang bila dimulai dari database kosong.
-- Aturan utama: semua tabel memakai Row Level Security. Aplikasi memakai kunci anon plus sesi pengguna,
-- sehingga database sendiri yang menolak akses ke data holding lain, bukan hanya tampilan.

-- ============ Tipe ============
create type app_role as enum ('peserta', 'admin', 'superadmin');
create type card_status as enum ('draft', 'published');
create type change_kind as enum ('kecil', 'besar');

-- ============ Holding ============
create table holdings (
  id text primary key,
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

insert into holdings (id, name, code) values
  ('people', 'PEOPLE', 'PPL'),
  ('sib', 'SIBIMA Group', 'SIB'),
  ('bejo', 'BEJO Group', 'BJO'),
  ('bos', 'BOS Group', 'BOS');

-- ============ Pengguna ============
-- id sama dengan id di auth.users. login_id adalah nomor HP (62...) atau email huruf kecil.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employee_no text not null unique,
  full_name text not null,
  login_id text not null unique,
  phone text,
  email text,
  role app_role not null default 'peserta',
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Satu orang bisa punya beberapa keanggotaan (mutasi atau rangkap jabatan). Atasan langsung ada di sini.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  holding_id text not null references holdings (id),
  unit text,
  job_title text,
  manager_id uuid references profiles (id),
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now()
);
create unique index memberships_one_active on memberships (profile_id, holding_id) where ended_on is null;
create index memberships_holding on memberships (holding_id) where ended_on is null;
create index memberships_manager on memberships (manager_id) where ended_on is null;

-- Akses admin per holding dan modul. Hanya superadmin yang boleh mengubahnya.
create table admin_access (
  profile_id uuid not null references profiles (id) on delete cascade,
  holding_id text not null references holdings (id),
  module text not null check (module in ('sop', 'pembelajaran', 'pengguna', 'analitik')),
  granted_by uuid references profiles (id),
  granted_at timestamptz not null default now(),
  primary key (profile_id, holding_id, module)
);

-- ============ Fungsi bantu (SECURITY DEFINER agar tidak berulang di RLS) ============
create or replace function my_holdings() returns setof text
language sql stable security definer set search_path = public as $$
  select m.holding_id
  from memberships m
  join profiles p on p.id = m.profile_id
  where m.profile_id = auth.uid() and m.ended_on is null and p.active
$$;

create or replace function is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'superadmin')
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role in ('admin', 'superadmin'))
$$;

-- Superadmin punya semua akses. Admin hanya yang diberikan per holding dan modul.
create or replace function has_access(h text, m text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin() or exists (
    select 1 from admin_access a
    join profiles p on p.id = a.profile_id
    where a.profile_id = auth.uid() and p.active and p.role = 'admin'
      and a.holding_id = h and a.module = m
  )
$$;

create or replace function is_manager_of(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.profile_id = target and m.manager_id = auth.uid() and m.ended_on is null
  )
$$;

-- ============ Istilah dan pengaturan ============
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('sop_terms', '{"board":"Board","library":"Library","playbook":"Playbook","card":"Card"}');

-- ============ SOP: Board, Library, Playbook, Card ============
create table boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 64),
  description text,
  owner_label text,
  position int not null default 0,
  archived boolean not null default false,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Board bisa dibuka untuk satu, dua, atau ketiga holding.
create table board_holdings (
  board_id uuid not null references boards (id) on delete cascade,
  holding_id text not null references holdings (id),
  primary key (board_id, holding_id)
);

create table libraries (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  description text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index libraries_board on libraries (board_id);

create table playbooks (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  description text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playbooks_library on playbooks (library_id);

-- Wajib dibaca: target dan batas waktu diatur di tingkat playbook.
create table playbook_requirements (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references playbooks (id) on delete cascade,
  holding_id text not null references holdings (id),
  unit text,
  due_on date not null,
  created_at timestamptz not null default now()
);
create index playbook_requirements_playbook on playbook_requirements (playbook_id);

create table cards (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references playbooks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  position int not null default 0,
  status card_status not null default 'draft',
  draft_content jsonb not null default '{"type":"doc","content":[]}',
  current_version_id uuid,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cards_playbook on cards (playbook_id);

create table card_versions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards (id) on delete cascade,
  version int not null,
  title text not null,
  content jsonb not null,
  change change_kind not null default 'kecil',
  note text,
  published_by uuid not null references profiles (id),
  published_at timestamptz not null default now(),
  unique (card_id, version)
);

alter table cards
  add constraint cards_current_version_fk
  foreign key (current_version_id) references card_versions (id) deferrable initially deferred;

-- Jejak baca. Perubahan besar membuat versi baru, sehingga peserta harus membaca ulang.
create table read_receipts (
  profile_id uuid not null references profiles (id) on delete cascade,
  card_id uuid not null references cards (id) on delete cascade,
  version_id uuid not null references card_versions (id) on delete cascade,
  holding_id text not null references holdings (id),
  read_at timestamptz not null default now(),
  primary key (profile_id, version_id)
);
create index read_receipts_card on read_receipts (card_id);
create index read_receipts_holding on read_receipts (holding_id);

-- ============ Log audit (tidak bisa diubah) ============
create table audit_log (
  id bigint generated always as identity primary key,
  actor uuid references profiles (id),
  action text not null,
  entity text,
  entity_id text,
  holding_id text references holdings (id),
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index audit_log_at on audit_log (at desc);
create index audit_log_holding on audit_log (holding_id);

create or replace function audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log tidak bisa diubah atau dihapus';
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

create or replace function log_event(p_action text, p_entity text, p_entity_id text, p_holding text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor, action, entity, entity_id, holding_id, detail)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_holding, coalesce(p_detail, '{}'));
$$;

-- ============ Fungsi akses SOP ============
-- Karyawan melihat board jika holding-nya termasuk yang dibuka. Admin melihat board holding yang punya akses SOP.
create or replace function can_view_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from boards bo
    join board_holdings bh on bh.board_id = bo.id
    where bo.id = b
      and (
        (not bo.archived and bh.holding_id in (select my_holdings()))
        or has_access(bh.holding_id, 'sop')
      )
  )
$$;

-- Mengubah isi board: admin yang punya akses SOP ke SEMUA holding board itu (superadmin selalu bisa).
create or replace function can_edit_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    and exists (select 1 from board_holdings where board_id = b)
    and not exists (select 1 from board_holdings bh where bh.board_id = b and not has_access(bh.holding_id, 'sop'))
$$;

create or replace function board_of_library(l uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select board_id from libraries where id = l
$$;

create or replace function board_of_playbook(pbid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select l.board_id from playbooks pb join libraries l on l.id = pb.library_id where pb.id = pbid
$$;

create or replace function board_of_card(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select l.board_id from cards c
  join playbooks pb on pb.id = c.playbook_id
  join libraries l on l.id = pb.library_id
  where c.id = cid
$$;

create or replace function board_creator_open(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from boards where id = b and created_by = auth.uid())
    and not exists (select 1 from board_holdings where board_id = b)
$$;

-- ============ Trigger ============
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();
create trigger boards_touch before update on boards for each row execute function touch_updated_at();
create trigger libraries_touch before update on libraries for each row execute function touch_updated_at();
create trigger playbooks_touch before update on playbooks for each row execute function touch_updated_at();
create trigger cards_touch before update on cards for each row execute function touch_updated_at();

-- Menerbitkan card: nomor versi otomatis, card menunjuk ke versi terbaru, dan tercatat di audit.
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
  if not can_edit_board(v_board) then raise exception 'tidak punya akses menerbitkan card ini'; end if;

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

-- Menandai sudah dibaca untuk versi terbaru card yang boleh dilihat pengguna.
create or replace function mark_read(p_card uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_board uuid;
  v_ver uuid;
  v_hold text;
begin
  v_board := board_of_card(p_card);
  if v_board is null or not can_view_board(v_board) then raise exception 'tidak punya akses'; end if;
  select current_version_id into v_ver from cards where id = p_card and status = 'published';
  if v_ver is null then raise exception 'card belum terbit'; end if;

  -- holding dipakai untuk laporan: holding peserta yang termasuk daftar board
  select bh.holding_id into v_hold
  from board_holdings bh
  where bh.board_id = v_board and bh.holding_id in (select my_holdings())
  order by bh.holding_id limit 1;
  if v_hold is null then raise exception 'holding peserta tidak termasuk board ini'; end if;

  insert into read_receipts (profile_id, card_id, version_id, holding_id)
  values (auth.uid(), p_card, v_ver, v_hold)
  on conflict do nothing;
end $$;

-- Rekam audit saat akses admin diberikan atau dicabut.
create or replace function audit_admin_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform log_event('access.revoke', 'admin_access', old.profile_id::text, old.holding_id, jsonb_build_object('module', old.module));
    return old;
  else
    perform log_event('access.grant', 'admin_access', new.profile_id::text, new.holding_id, jsonb_build_object('module', new.module));
    return new;
  end if;
end $$;
create trigger admin_access_audit after insert or delete on admin_access
  for each row execute function audit_admin_access();

-- ============ Row Level Security ============
alter table holdings enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table admin_access enable row level security;
alter table app_settings enable row level security;
alter table boards enable row level security;
alter table board_holdings enable row level security;
alter table libraries enable row level security;
alter table playbooks enable row level security;
alter table playbook_requirements enable row level security;
alter table cards enable row level security;
alter table card_versions enable row level security;
alter table read_receipts enable row level security;
alter table audit_log enable row level security;

-- holdings: semua pengguna masuk boleh membaca daftar (hanya nama dan kode).
create policy holdings_read on holdings for select to authenticated using (true);

-- profiles
create policy profiles_self on profiles for select to authenticated using (id = auth.uid());
create policy profiles_admin on profiles for select to authenticated using (
  exists (select 1 from memberships m where m.profile_id = profiles.id and has_access(m.holding_id, 'pengguna'))
);
create policy profiles_manager on profiles for select to authenticated using (is_manager_of(profiles.id));
create policy profiles_my_manager on profiles for select to authenticated using (
  exists (select 1 from memberships m where m.profile_id = auth.uid() and m.manager_id = profiles.id and m.ended_on is null)
);
create policy profiles_super on profiles for select to authenticated using (is_superadmin());
-- Tulis profil: hanya lewat server (kunci layanan), tidak ada kebijakan tulis untuk klien.

-- memberships
create policy memberships_self on memberships for select to authenticated using (profile_id = auth.uid());
create policy memberships_admin on memberships for select to authenticated using (has_access(holding_id, 'pengguna'));
create policy memberships_manager on memberships for select to authenticated using (manager_id = auth.uid());
create policy memberships_super on memberships for select to authenticated using (is_superadmin());

-- admin_access: dibaca diri sendiri dan superadmin, ditulis hanya superadmin.
create policy admin_access_self on admin_access for select to authenticated using (profile_id = auth.uid());
create policy admin_access_super_read on admin_access for select to authenticated using (is_superadmin());
create policy admin_access_super_write on admin_access for all to authenticated
  using (is_superadmin()) with check (is_superadmin());

-- pengaturan
create policy settings_read on app_settings for select to authenticated using (true);
create policy settings_write on app_settings for all to authenticated
  using (is_superadmin()) with check (is_superadmin());

-- boards
create policy boards_read on boards for select to authenticated using (can_view_board(id) or created_by = auth.uid());
create policy boards_insert on boards for insert to authenticated
  with check (is_admin() and created_by = auth.uid());
create policy boards_update on boards for update to authenticated
  using (can_edit_board(id) or board_creator_open(id))
  with check (can_edit_board(id) or board_creator_open(id));
create policy boards_delete on boards for delete to authenticated using (can_edit_board(id));

create policy board_holdings_read on board_holdings for select to authenticated using (can_view_board(board_id) or board_creator_open(board_id));
create policy board_holdings_insert on board_holdings for insert to authenticated with check (
  is_admin() and has_access(holding_id, 'sop') and (can_edit_board(board_id) or board_creator_open(board_id))
);
create policy board_holdings_delete on board_holdings for delete to authenticated using (
  is_admin() and has_access(holding_id, 'sop') and can_edit_board(board_id)
);

-- libraries, playbooks
create policy libraries_read on libraries for select to authenticated using (can_view_board(board_id));
create policy libraries_write on libraries for all to authenticated
  using (can_edit_board(board_id)) with check (can_edit_board(board_id));

create policy playbooks_read on playbooks for select to authenticated using (can_view_board(board_of_library(library_id)));
create policy playbooks_write on playbooks for all to authenticated
  using (can_edit_board(board_of_library(library_id))) with check (can_edit_board(board_of_library(library_id)));

create policy requirements_read on playbook_requirements for select to authenticated
  using (can_view_board(board_of_playbook(playbook_id)));
create policy requirements_write on playbook_requirements for all to authenticated
  using (can_edit_board(board_of_playbook(playbook_id)) and has_access(holding_id, 'sop'))
  with check (can_edit_board(board_of_playbook(playbook_id)) and has_access(holding_id, 'sop'));

-- cards: peserta hanya melihat yang terbit. Editor melihat draf juga.
create policy cards_read on cards for select to authenticated using (
  can_edit_board(board_of_playbook(playbook_id))
  or (status = 'published' and can_view_board(board_of_playbook(playbook_id)))
);
create policy cards_write on cards for all to authenticated
  using (can_edit_board(board_of_playbook(playbook_id)))
  with check (can_edit_board(board_of_playbook(playbook_id)));

-- Versi terbit dibaca siapa saja yang boleh melihat board. Dibuat hanya lewat publish_card().
create policy versions_read on card_versions for select to authenticated using (can_view_board(board_of_card(card_id)));

-- read_receipts: dibuat lewat mark_read(). Dibaca diri sendiri, atasan langsung, dan admin dengan akses analitik.
create policy receipts_self on read_receipts for select to authenticated using (profile_id = auth.uid());
create policy receipts_manager on read_receipts for select to authenticated using (is_manager_of(profile_id));
create policy receipts_admin on read_receipts for select to authenticated using (has_access(holding_id, 'analitik'));

-- audit_log: superadmin semua, admin hanya holding dengan akses analitik.
create policy audit_super on audit_log for select to authenticated using (is_superadmin());
create policy audit_admin on audit_log for select to authenticated using (holding_id is not null and has_access(holding_id, 'analitik'));

-- ============ Hak akses tingkat tabel ============
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on boards, board_holdings, libraries, playbooks, playbook_requirements,
  admin_access, app_settings to authenticated;
-- cards: kolom status dan current_version_id hanya berubah lewat publish_card()
grant delete on cards to authenticated;
grant insert (playbook_id, title, position, draft_content, created_by) on cards to authenticated;
grant update (playbook_id, title, position, draft_content) on cards to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function my_holdings(), is_superadmin(), is_admin(), has_access(text, text), is_manager_of(uuid),
  can_view_board(uuid), can_edit_board(uuid), board_of_library(uuid), board_of_playbook(uuid), board_of_card(uuid),
  board_creator_open(uuid), publish_card(uuid, change_kind, text), mark_read(uuid) to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;
