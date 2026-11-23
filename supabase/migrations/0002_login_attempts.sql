-- Pembatasan percobaan masuk. Hanya diakses server dengan kunci layanan (tanpa kebijakan RLS untuk klien).
create table login_attempts (
  id bigint generated always as identity primary key,
  login_id text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index login_attempts_lookup on login_attempts (login_id, at desc);
alter table login_attempts enable row level security;
revoke all on login_attempts from anon, authenticated;
