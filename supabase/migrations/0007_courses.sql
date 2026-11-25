-- LMS People Excellence, migrasi 0007 (M3b): kursus dari card SOP dan video, kuis dengan ulang otomatis,
-- katalog dan daftar mandiri, penugasan kursus, dan kemajuan belajar. Jalankan sekali di Supabase setelah 0006.
--
-- Aturan:
-- 1. Kursus dibuka untuk holding (course_holdings) dan bisa dipersempit ke unit, grup, atau orang (course_access), sama seperti SOP.
-- 2. Cara masuk: 'terbuka' (member daftar sendiri dari katalog) atau 'ditugaskan' (admin menugaskan ke holding, unit, grup, atau orang).
--    "Terbatas" berarti terbuka yang dipersempit lewat course_access.
-- 3. Item kursus: card SOP yang terbit, video YouTube, atau kuis. Urutan bisa dikunci (item berikutnya terbuka setelah yang sebelumnya selesai).
-- 4. Kuis dinilai di database (submit_quiz_attempt). Peserta tidak pernah membaca kunci jawaban lewat tabel.
-- 5. Ulang otomatis: gagal tidak butuh admin menugaskan ulang. Batas percobaan dan jeda diatur per kuis; setelah batas habis
--    pendaftaran ditandai escalated_at agar atasan dan HC ditindaklanjuti.

-- ============ Tabel ============
create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text,
  category text check (category is null or char_length(category) <= 60),
  est_minutes int check (est_minutes is null or est_minutes between 1 and 6000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  enroll_mode text not null default 'ditugaskan' check (enroll_mode in ('terbuka', 'ditugaskan')),
  sequential boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger courses_touch before update on courses for each row execute function touch_updated_at();

create table course_holdings (
  course_id uuid not null references courses (id) on delete cascade,
  holding_id text not null references holdings (id),
  primary key (course_id, holding_id),
  check (holding_id <> 'people')
);

create table course_access (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  holding_id text not null references holdings (id),
  subject_type text not null check (subject_type in ('all', 'unit', 'group', 'user')),
  unit text,
  group_id uuid references groups (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check (
    (subject_type = 'all'   and unit is null and group_id is null and profile_id is null)
    or (subject_type = 'unit'  and unit is not null and group_id is null and profile_id is null)
    or (subject_type = 'group' and group_id is not null and unit is null and profile_id is null)
    or (subject_type = 'user'  and profile_id is not null and unit is null and group_id is null)
  ),
  check (holding_id <> 'people')
);
create index course_access_course on course_access (course_id);
create unique index course_access_uq_all on course_access (course_id, holding_id) where subject_type = 'all';
create unique index course_access_uq_unit on course_access (course_id, holding_id, unit) where subject_type = 'unit';
create unique index course_access_uq_group on course_access (course_id, group_id) where subject_type = 'group';
create unique index course_access_uq_user on course_access (course_id, holding_id, profile_id) where subject_type = 'user';

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'live')),
  pass_percent int not null default 50 check (pass_percent between 1 and 100),
  show_answers text not null default 'end' check (show_answers in ('end', 'never')),
  shuffle_questions boolean not null default false,
  shuffle_answers boolean not null default false,
  max_attempts int check (max_attempts is null or max_attempts between 1 and 50),
  cooldown_minutes int not null default 0 check (cooldown_minutes between 0 and 43200),
  score_rule text not null default 'best' check (score_rule in ('best', 'last')),
  created_at timestamptz not null default now()
);
create index quizzes_course on quizzes (course_id);

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  position int not null default 0,
  prompt text not null check (char_length(prompt) between 1 and 600),
  explanation text
);
create index quiz_questions_quiz on quiz_questions (quiz_id);

create table quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions (id) on delete cascade,
  position int not null default 0,
  text text not null check (char_length(text) between 1 and 300),
  is_correct boolean not null default false
);
create index quiz_options_question on quiz_options (question_id);

create table course_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  position int not null default 0,
  kind text not null check (kind in ('card', 'video', 'quiz')),
  title text not null check (char_length(title) between 1 and 120),
  card_id uuid references cards (id) on delete restrict,
  video_url text check (video_url is null or char_length(video_url) <= 300),
  quiz_id uuid references quizzes (id) on delete restrict,
  check (
    (kind = 'card' and card_id is not null and video_url is null and quiz_id is null)
    or (kind = 'video' and video_url is not null and card_id is null and quiz_id is null)
    or (kind = 'quiz' and quiz_id is not null and card_id is null and video_url is null)
  )
);
create index course_items_course on course_items (course_id, position);

-- Penugasan kursus: target holding (dengan unit opsional), grup, atau orang. Pendaftaran dibuat otomatis.
create table course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  holding_id text not null references holdings (id),
  target_type text not null check (target_type in ('holding', 'group', 'user')),
  unit text,
  group_id uuid references groups (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  due_days int check (due_days is null or due_days between 1 and 1000),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check (holding_id <> 'people'),
  constraint course_assignments_target check (
    (target_type = 'holding' and group_id is null and profile_id is null)
    or (target_type = 'group' and group_id is not null and unit is null and profile_id is null)
    or (target_type = 'user' and profile_id is not null and unit is null and group_id is null)
  )
);
create index course_assignments_course on course_assignments (course_id);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  holding_id text not null references holdings (id),
  source text not null check (source in ('ditugaskan', 'mandiri')),
  due_on date,
  status text not null default 'berjalan' check (status in ('berjalan', 'selesai')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  escalated_at timestamptz,
  unique (course_id, profile_id)
);
create index enrollments_profile on enrollments (profile_id);

create table item_progress (
  enrollment_id uuid not null references enrollments (id) on delete cascade,
  item_id uuid not null references course_items (id) on delete cascade,
  version_id uuid references card_versions (id),
  completed_at timestamptz not null default now(),
  primary key (enrollment_id, item_id)
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments (id) on delete cascade,
  item_id uuid not null references course_items (id) on delete cascade,
  attempt_no int not null,
  score_percent int not null,
  passed boolean not null,
  answers jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  unique (enrollment_id, item_id, attempt_no)
);

-- ============ Fungsi izin ============
create or replace function course_reader_ok(c uuid, h text, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from course_access a where a.course_id = c and a.holding_id = h)
    or exists (
      select 1 from course_access a
      where a.course_id = c and a.holding_id = h and (
        (a.subject_type = 'user' and a.profile_id = u)
        or (a.subject_type = 'group' and exists (select 1 from group_members gm where gm.group_id = a.group_id and gm.profile_id = u))
        or (a.subject_type = 'unit' and exists (
              select 1 from memberships m where m.profile_id = u and m.holding_id = h and m.ended_on is null and m.unit = a.unit))
      )
    )
$$;

-- Terlihat di katalog: terbit, holding dibuka, dan lolos pembatasan. Admin pembelajaran melihat semua status.
create or replace function can_view_course(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses co join course_holdings ch on ch.course_id = co.id
    where co.id = c and (
      (co.status = 'published' and ch.holding_id in (select my_holdings()) and course_reader_ok(c, ch.holding_id, auth.uid()))
      or has_access(ch.holding_id, 'pembelajaran')
    )
  )
$$;

create or replace function can_edit_course(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    and exists (select 1 from course_holdings where course_id = c)
    and not exists (select 1 from course_holdings ch where ch.course_id = c and not has_access(ch.holding_id, 'pembelajaran'))
$$;

create or replace function is_enrolled(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments e where e.course_id = c and e.profile_id = auth.uid())
$$;

create or replace function course_of_quiz(q uuid) returns uuid
language sql stable security definer set search_path = public as $$ select course_id from quizzes where id = q $$;

create or replace function course_of_question(qq uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select z.course_id from quiz_questions q join quizzes z on z.id = q.quiz_id where q.id = qq
$$;

-- Card yang dipakai kursus harus bisa dilihat pembuat kursus dan terbuka untuk semua holding kursus.
create or replace function check_course_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pb uuid; v_board uuid;
begin
  if new.kind = 'card' then
    select playbook_id into v_pb from cards where id = new.card_id;
    if v_pb is null or not can_view_playbook(v_pb) then raise exception 'card tidak bisa dipakai'; end if;
    v_board := board_of_playbook(v_pb);
    if exists (select 1 from course_holdings ch where ch.course_id = new.course_id
               and not exists (select 1 from board_holdings bh where bh.board_id = v_board and bh.holding_id = ch.holding_id)) then
      raise exception 'board card ini belum dibuka untuk semua holding kursus';
    end if;
  end if;
  if new.kind = 'quiz' and course_of_quiz(new.quiz_id) is distinct from new.course_id then
    raise exception 'kuis milik kursus lain';
  end if;
  return new;
end $$;
create trigger course_items_check before insert or update on course_items for each row execute function check_course_item();

-- ============ Pendaftaran ============
create or replace function enroll_user(p_course uuid, p_user uuid, p_holding text, p_source text, p_due date)
returns void language sql security definer set search_path = public as $$
  insert into enrollments (course_id, profile_id, holding_id, source, due_on)
  values (p_course, p_user, p_holding, p_source, p_due)
  on conflict (course_id, profile_id) do nothing
$$;

-- Mendaftarkan semua orang yang cocok dengan satu penugasan. Orang yang tidak lolos pembatasan kursus dilewati.
create or replace function materialize_course_assignment(a course_assignments) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_due date;
begin
  v_due := case when a.due_days is null then null else (current_date + a.due_days) end;
  for r in
    select m.profile_id from memberships m join profiles p on p.id = m.profile_id and p.active
    where a.target_type = 'holding' and m.holding_id = a.holding_id and m.ended_on is null and (a.unit is null or m.unit = a.unit)
    union
    select gm.profile_id from group_members gm join profiles p on p.id = gm.profile_id and p.active
    where a.target_type = 'group' and gm.group_id = a.group_id
    union
    select a.profile_id where a.target_type = 'user'
  loop
    if is_member_of(r.profile_id, a.holding_id) and course_reader_ok(a.course_id, a.holding_id, r.profile_id) then
      perform enroll_user(a.course_id, r.profile_id, a.holding_id, 'ditugaskan', v_due);
    end if;
  end loop;
end $$;

create or replace function course_assignment_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform materialize_course_assignment(new);
  perform log_event('course.assign', 'course', new.course_id::text, new.holding_id,
    jsonb_build_object('target', new.target_type, 'unit', new.unit, 'group', new.group_id, 'profile', new.profile_id));
  return new;
end $$;
create trigger course_assignments_after after insert on course_assignments for each row execute function course_assignment_after_insert();

-- Anggota baru grup ikut terdaftar di kursus yang ditugaskan ke grup itu.
create or replace function group_member_enroll() returns trigger
language plpgsql security definer set search_path = public as $$
declare a course_assignments;
begin
  for a in select * from course_assignments where target_type = 'group' and group_id = new.group_id loop
    if course_reader_ok(a.course_id, a.holding_id, new.profile_id) then
      perform enroll_user(a.course_id, new.profile_id, a.holding_id, 'ditugaskan',
        case when a.due_days is null then null else current_date + a.due_days end);
    end if;
  end loop;
  return new;
end $$;
create trigger group_members_enroll after insert on group_members for each row execute function group_member_enroll();

-- Daftar mandiri dari katalog.
create or replace function self_enroll(p_course uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_h text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'harus masuk'; end if;
  if not exists (select 1 from courses where id = p_course and status = 'published' and enroll_mode = 'terbuka') then
    raise exception 'kursus ini tidak bisa diikuti sendiri';
  end if;
  select ch.holding_id into v_h from course_holdings ch
  where ch.course_id = p_course and ch.holding_id in (select my_holdings()) and course_reader_ok(p_course, ch.holding_id, auth.uid())
  order by ch.holding_id limit 1;
  if v_h is null then raise exception 'kursus ini tidak dibuka untuk Anda'; end if;
  perform enroll_user(p_course, auth.uid(), v_h, 'mandiri', null);
  select id into v_id from enrollments where course_id = p_course and profile_id = auth.uid();
  perform log_event('course.enroll', 'course', p_course::text, v_h, '{}');
  return v_id;
end $$;

-- ============ Kemajuan ============
create or replace function recompute_enrollment(p_enrollment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e enrollments; v_total int; v_done int;
begin
  select * into e from enrollments where id = p_enrollment;
  if e.status = 'selesai' then return; end if;
  select count(*) into v_total from course_items where course_id = e.course_id;
  select count(*) into v_done from item_progress ip join course_items ci on ci.id = ip.item_id where ip.enrollment_id = p_enrollment;
  if v_total > 0 and v_done >= v_total then
    update enrollments set status = 'selesai', completed_at = now() where id = p_enrollment;
    perform log_event('course.complete', 'course', e.course_id::text, e.holding_id, jsonb_build_object('profile', e.profile_id));
  end if;
end $$;

-- Item sebelumnya harus selesai bila kursus berurutan.
create or replace function items_before_done(p_enrollment uuid, p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from enrollments e
    join courses co on co.id = e.course_id and co.sequential
    join course_items cur on cur.id = p_item and cur.course_id = co.id
    join course_items prev on prev.course_id = co.id and prev.position < cur.position
    where e.id = p_enrollment
      and not exists (select 1 from item_progress ip where ip.enrollment_id = e.id and ip.item_id = prev.id)
  )
$$;

create or replace function complete_item(p_enrollment uuid, p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e enrollments; it course_items; v_ver uuid;
begin
  select * into e from enrollments where id = p_enrollment and profile_id = auth.uid();
  if not found then raise exception 'tidak punya akses'; end if;
  if not exists (select 1 from courses where id = e.course_id and status = 'published') then raise exception 'kursus belum terbit'; end if;
  select * into it from course_items where id = p_item and course_id = e.course_id;
  if not found or it.kind not in ('card', 'video') then raise exception 'item tidak valid'; end if;
  if not items_before_done(p_enrollment, p_item) then raise exception 'selesaikan item sebelumnya dulu'; end if;
  if it.kind = 'card' then
    select current_version_id into v_ver from cards where id = it.card_id and status = 'published';
    if v_ver is null then raise exception 'card belum terbit'; end if;
  end if;
  insert into item_progress (enrollment_id, item_id, version_id) values (p_enrollment, p_item, v_ver)
  on conflict do nothing;
  perform recompute_enrollment(p_enrollment);
end $$;

-- Menilai kuis di database. p_answers: {"<question_id>": ["<option_id>", ...]}.
create or replace function submit_quiz_attempt(p_enrollment uuid, p_item uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e enrollments; it course_items; qz quizzes;
  v_no int; v_total int; v_ok int; v_score int; v_pass boolean; v_last timestamptz; v_left int; v_esc boolean := false;
  v_q record; v_sel uuid[]; v_cor uuid[]; v_review jsonb := '[]'; v_next timestamptz;
begin
  select * into e from enrollments where id = p_enrollment and profile_id = auth.uid();
  if not found then raise exception 'tidak punya akses'; end if;
  if not exists (select 1 from courses where id = e.course_id and status = 'published') then raise exception 'kursus belum terbit'; end if;
  select * into it from course_items where id = p_item and course_id = e.course_id and kind = 'quiz';
  if not found then raise exception 'item tidak valid'; end if;
  select * into qz from quizzes where id = it.quiz_id;
  if qz.status <> 'live' then raise exception 'kuis belum aktif'; end if;
  if not items_before_done(p_enrollment, p_item) then raise exception 'selesaikan item sebelumnya dulu'; end if;
  if exists (select 1 from item_progress where enrollment_id = p_enrollment and item_id = p_item) then raise exception 'kuis ini sudah lulus'; end if;

  select coalesce(max(attempt_no), 0), max(submitted_at) into v_no, v_last from quiz_attempts where enrollment_id = p_enrollment and item_id = p_item;
  if qz.max_attempts is not null and v_no >= qz.max_attempts then raise exception 'batas percobaan sudah habis'; end if;
  if v_last is not null and qz.cooldown_minutes > 0 and v_last + make_interval(mins => qz.cooldown_minutes) > now() then
    raise exception 'tunggu jeda antar percobaan sampai %', to_char((v_last + make_interval(mins => qz.cooldown_minutes)) at time zone 'Asia/Jakarta', 'DD Mon HH24:MI');
  end if;

  select count(*) into v_total from quiz_questions where quiz_id = qz.id;
  if v_total = 0 then raise exception 'kuis belum punya soal'; end if;
  v_ok := 0;
  for v_q in select id, prompt, explanation from quiz_questions where quiz_id = qz.id order by position loop
    select coalesce(array_agg(x::uuid order by x), '{}') into v_sel
      from jsonb_array_elements_text(coalesce(p_answers -> v_q.id::text, '[]'::jsonb)) x
      where x::uuid in (select id from quiz_options where question_id = v_q.id);
    select coalesce(array_agg(id order by id), '{}') into v_cor from quiz_options where question_id = v_q.id and is_correct;
    if v_sel = v_cor and array_length(v_cor, 1) > 0 then v_ok := v_ok + 1; end if;
    if qz.show_answers = 'end' then
      v_review := v_review || jsonb_build_array(jsonb_build_object('question', v_q.id, 'correct', to_jsonb(v_cor), 'explanation', v_q.explanation, 'right', v_sel = v_cor));
    end if;
  end loop;
  v_score := round(100.0 * v_ok / v_total);
  v_pass := v_score >= qz.pass_percent;
  v_no := v_no + 1;

  insert into quiz_attempts (enrollment_id, item_id, attempt_no, score_percent, passed, answers)
  values (p_enrollment, p_item, v_no, v_score, v_pass, coalesce(p_answers, '{}'));

  if v_pass then
    insert into item_progress (enrollment_id, item_id) values (p_enrollment, p_item) on conflict do nothing;
    perform recompute_enrollment(p_enrollment);
  elsif qz.max_attempts is not null and v_no >= qz.max_attempts then
    update enrollments set escalated_at = coalesce(escalated_at, now()) where id = p_enrollment;
    perform log_event('course.quiz.escalate', 'course', e.course_id::text, e.holding_id, jsonb_build_object('profile', e.profile_id, 'quiz', qz.id, 'attempts', v_no));
    v_esc := true;
  end if;
  perform log_event(case when v_pass then 'course.quiz.pass' else 'course.quiz.fail' end, 'course', e.course_id::text, e.holding_id,
    jsonb_build_object('profile', e.profile_id, 'quiz', qz.id, 'score', v_score, 'attempt', v_no));

  v_left := case when qz.max_attempts is null then null else greatest(qz.max_attempts - v_no, 0) end;
  v_next := case when v_pass or qz.cooldown_minutes = 0 or v_esc then null else now() + make_interval(mins => qz.cooldown_minutes) end;
  return jsonb_build_object('attempt', v_no, 'score', v_score, 'passed', v_pass, 'pass_percent', qz.pass_percent,
    'attempts_left', v_left, 'escalated', v_esc, 'next_retry_at', v_next, 'review', case when qz.show_answers = 'end' then v_review else null end);
end $$;

-- ============ Audit kursus ============
create or replace function audit_course() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event('course.create', 'course', new.id::text, null, jsonb_build_object('title', new.title));
  elsif new.status is distinct from old.status then
    perform log_event('course.' || new.status, 'course', new.id::text, null, jsonb_build_object('title', new.title));
  end if;
  return new;
end $$;
create trigger courses_audit after insert or update on courses for each row execute function audit_course();

-- ============ Row Level Security ============
alter table courses enable row level security;
alter table course_holdings enable row level security;
alter table course_access enable row level security;
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_options enable row level security;
alter table course_items enable row level security;
alter table course_assignments enable row level security;
alter table enrollments enable row level security;
alter table item_progress enable row level security;
alter table quiz_attempts enable row level security;

-- Kursus: terlihat bila dibuka untuk Anda, atau Anda sudah terdaftar di kursus yang terbit. Admin pembelajaran mengelola.
create policy courses_read on courses for select to authenticated using (
  can_view_course(id) or can_edit_course(id) or created_by = auth.uid() or (status = 'published' and is_enrolled(id))
);
create policy courses_insert on courses for insert to authenticated with check (is_admin() and created_by = auth.uid());
create policy courses_update on courses for update to authenticated using (can_edit_course(id) or created_by = auth.uid()) with check (can_edit_course(id) or created_by = auth.uid());
create policy courses_delete on courses for delete to authenticated using (can_edit_course(id) or (created_by = auth.uid() and not exists (select 1 from course_holdings where course_id = courses.id)));

create policy course_holdings_read on course_holdings for select to authenticated using (can_view_course(course_id) or can_edit_course(course_id) or is_enrolled(course_id) or exists (select 1 from courses c where c.id = course_id and c.created_by = auth.uid()));
create policy course_holdings_insert on course_holdings for insert to authenticated with check (
  is_admin() and has_access(holding_id, 'pembelajaran')
  and (can_edit_course(course_id) or exists (select 1 from courses c where c.id = course_id and c.created_by = auth.uid()))
);
create policy course_holdings_delete on course_holdings for delete to authenticated using (is_admin() and has_access(holding_id, 'pembelajaran') and can_edit_course(course_id));

create policy course_access_read on course_access for select to authenticated using (can_edit_course(course_id));
create policy course_access_write on course_access for all to authenticated
  using (can_edit_course(course_id))
  with check (
    can_edit_course(course_id) and has_access(holding_id, 'pembelajaran')
    and exists (select 1 from course_holdings ch where ch.course_id = course_access.course_id and ch.holding_id = course_access.holding_id)
    and (subject_type in ('all', 'unit')
         or (subject_type = 'group' and group_holding(group_id) = holding_id)
         or (subject_type = 'user' and is_member_of(profile_id, holding_id)))
  );

-- Kuis, soal, dan opsi (termasuk kunci jawaban) hanya untuk pengelola kursus. Peserta dilayani lewat server dan submit_quiz_attempt.
create policy quizzes_all on quizzes for all to authenticated using (can_edit_course(course_id)) with check (can_edit_course(course_id));
create policy quiz_questions_all on quiz_questions for all to authenticated
  using (can_edit_course(course_of_quiz(quiz_id))) with check (can_edit_course(course_of_quiz(quiz_id)));
create policy quiz_options_all on quiz_options for all to authenticated
  using (can_edit_course(course_of_question(question_id))) with check (can_edit_course(course_of_question(question_id)));

create policy course_items_read on course_items for select to authenticated using (
  can_edit_course(course_id) or can_view_course(course_id) or (is_enrolled(course_id) and exists (select 1 from courses c where c.id = course_id and c.status = 'published'))
);
create policy course_items_write on course_items for all to authenticated using (can_edit_course(course_id)) with check (can_edit_course(course_id));

create policy course_assignments_read on course_assignments for select to authenticated using (can_edit_course(course_id));
create policy course_assignments_write on course_assignments for all to authenticated
  using (can_edit_course(course_id) and has_access(holding_id, 'pembelajaran'))
  with check (
    can_edit_course(course_id) and has_access(holding_id, 'pembelajaran')
    and exists (select 1 from course_holdings ch where ch.course_id = course_assignments.course_id and ch.holding_id = course_assignments.holding_id)
    and (target_type = 'holding'
         or (target_type = 'group' and group_holding(group_id) = holding_id)
         or (target_type = 'user' and is_member_of(profile_id, holding_id) and course_reader_ok(course_id, holding_id, profile_id)))
  );

-- Pendaftaran dan kemajuan: dibaca diri sendiri, atasan langsung, pengelola kursus, dan admin analitik. Ditulis hanya lewat fungsi.
create policy enrollments_read on enrollments for select to authenticated using (
  profile_id = auth.uid() or is_manager_of(profile_id) or can_edit_course(course_id) or has_access(holding_id, 'analitik')
);
create policy enrollments_delete on enrollments for delete to authenticated using (can_edit_course(course_id) and has_access(holding_id, 'pembelajaran'));
create policy progress_read on item_progress for select to authenticated using (
  exists (select 1 from enrollments e where e.id = enrollment_id and (e.profile_id = auth.uid() or is_manager_of(e.profile_id) or can_edit_course(e.course_id) or has_access(e.holding_id, 'analitik')))
);
create policy attempts_read on quiz_attempts for select to authenticated using (
  exists (select 1 from enrollments e where e.id = enrollment_id and (e.profile_id = auth.uid() or is_manager_of(e.profile_id) or can_edit_course(e.course_id) or has_access(e.holding_id, 'analitik')))
);

-- ============ Hak akses tingkat tabel ============
grant select on courses, course_holdings, course_access, quizzes, quiz_questions, quiz_options, course_items, course_assignments, enrollments, item_progress, quiz_attempts to authenticated;
grant insert, update, delete on courses, course_holdings, course_access, quizzes, quiz_questions, quiz_options, course_items, course_assignments to authenticated;
grant delete on enrollments to authenticated;
grant execute on function course_reader_ok(uuid, text, uuid), can_view_course(uuid), can_edit_course(uuid), is_enrolled(uuid),
  course_of_quiz(uuid), course_of_question(uuid), self_enroll(uuid), complete_item(uuid, uuid),
  submit_quiz_attempt(uuid, uuid, jsonb), items_before_done(uuid, uuid) to authenticated;
