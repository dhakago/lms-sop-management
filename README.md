# LMS People Excellence

Aplikasi SOP, pembelajaran, dan kepatuhan untuk BOS, SIBIMA (SIB), dan BEJO. Next.js 15, Supabase (Postgres + Auth + RLS), dijalankan di Railway.

Isolasi data antar holding dijaga di database (Row Level Security), bukan di tampilan.

## Pemasangan pertama

### 1. Supabase
1. Buka SQL Editor, jalankan isi `supabase/migrations/0001_core.sql`, lalu `0002_login_attempts.sql`, berurutan.
2. Authentication, Providers, Email: matikan "Confirm email". Authentication, Sign In / Providers: matikan "Allow new users to sign up" (akun hanya dibuat admin).
3. Project Settings, API: catat Project URL, anon key, dan service role key.

### 2. Railway
Buat service dari repositori ini, lalu isi Variables di Railway (jangan di kode atau chat):

| Variabel | Isi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (rahasia, hanya di server) |
| `NEXT_PUBLIC_APP_URL` | `https://lms.peopleexcellence.co.id` |
| `AUTH_PHONE_DOMAIN` | opsional, bawaan `login.lms.peopleexcellence.co.id` |

Build command `npm run build`, start command `npm start`, health check path `/api/health`. Variabel `NEXT_PUBLIC_*` harus ada sebelum build.

### 3. Superadmin pertama
Di shell Railway (atau lokal dengan variabel yang sama):

```
SUPERADMIN_LOGIN=0812xxxxxxxx SUPERADMIN_NAME="Nama Lengkap" SUPERADMIN_PASSWORD='sementara123' npm run bootstrap
```

Masuk dengan kata sandi sementara itu, sistem akan meminta kata sandi baru.

## Pengembangan lokal
```
cp .env.example .env.local   # isi nilainya
npm install
npm run dev
```
Uji aturan akses database: `supabase/tests/run.py` (butuh Postgres lokal).

## Status
M1: masuk, ganti sandi, Beranda, baca SOP dan tandai sudah dibaca, profil, mode hemat.
Berikutnya M2: editor SOP, pengelolaan pengguna dan akses admin. M3: kursus dan kuis. M4: notifikasi dan PWA.
