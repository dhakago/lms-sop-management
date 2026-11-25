-- Hak akses untuk kunci layanan (service_role). Server memakainya untuk membuat pengguna, mengubah profil,
-- dan menulis log audit setelah otorisasi diperiksa di kode. Aman dijalankan ulang.
-- Kunci layanan melewati RLS, tetapi tetap butuh GRANT tingkat tabel dan fungsi.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
