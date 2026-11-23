import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Klien untuk pengguna yang sedang masuk. Semua kueri tunduk pada Row Level Security.
export async function createClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // dipanggil dari Server Component: sesi disegarkan oleh middleware
        }
      },
    },
  });
}
