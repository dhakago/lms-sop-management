import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { themeFor, type HoldingId, type Theme } from '@/lib/theme';

export type Role = 'peserta' | 'admin' | 'superadmin';

export type Membership = {
  holding_id: HoldingId;
  unit: string | null;
  job_title: string | null;
  manager_id: string | null;
};

export type Ctx = {
  userId: string;
  profile: {
    id: string;
    employee_no: string;
    full_name: string;
    role: Role;
    must_change_password: boolean;
    phone: string | null;
    email: string | null;
  };
  memberships: Membership[];
  holding: HoldingId; // holding yang sedang dipakai (menentukan tema)
  holdings: HoldingId[]; // holding yang boleh dipilih
  theme: Theme;
  manager: { full_name: string } | null;
  nav: { tim: boolean; analitik: boolean; kelola: boolean; editor: boolean; pengaturan: boolean; ganti: boolean };
  initials: string;
};

const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

// Memuat pengguna, keanggotaan, dan holding aktif. Dipakai oleh semua halaman yang butuh login.
export const getCtx = cache(async (opts: { allowPasswordChange?: boolean } = {}): Promise<Ctx> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, employee_no, full_name, role, must_change_password, phone, email')
    .eq('id', auth.user.id)
    .maybeSingle();
  // Akun ada di Supabase Auth tetapi profil tidak ada atau dinonaktifkan: RLS mengembalikan kosong.
  if (!profile) {
    await supabase.auth.signOut();
    redirect('/login?e=nonaktif');
  }
  if (profile.must_change_password && !opts.allowPasswordChange) redirect('/ganti-sandi');

  const { data: ms } = await supabase
    .from('memberships')
    .select('holding_id, unit, job_title, manager_id')
    .eq('profile_id', profile.id)
    .is('ended_on', null)
    .order('created_at', { ascending: true });
  const memberships = (ms ?? []) as Membership[];

  // Peserta memilih di antara holding keanggotaannya. Admin juga bisa memilih holding yang diberi aksesnya.
  const all: HoldingId[] = ['people', 'sib', 'bejo', 'bos'];
  let holdings = memberships.map((m) => m.holding_id);
  if (profile.role === 'superadmin') holdings = all;
  else if (profile.role === 'admin') {
    const { data: acc } = await supabase.from('admin_access').select('holding_id').eq('profile_id', profile.id);
    holdings = all.filter((h) => holdings.includes(h) || (acc ?? []).some((a) => a.holding_id === h));
  }
  if (holdings.length === 0) holdings = ['people'];

  const store = await cookies();
  const wanted = store.get('holding')?.value as HoldingId | undefined;
  const holding: HoldingId = wanted && holdings.includes(wanted) ? wanted : holdings[0]!;

  const active = memberships.find((m) => m.holding_id === holding);
  let manager: { full_name: string } | null = null;
  if (active?.manager_id) {
    const { data } = await supabase.from('profiles').select('full_name').eq('id', active.manager_id).maybeSingle();
    manager = data;
  }

  // Atasan ditentukan otomatis: siapa pun yang tercantum sebagai atasan langsung seseorang.
  const { count } = await supabase
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', profile.id)
    .is('ended_on', null);

  const admin = profile.role === 'admin' || profile.role === 'superadmin';
  return {
    userId: profile.id,
    profile: profile as Ctx['profile'],
    memberships,
    holding,
    holdings,
    theme: themeFor(holding),
    manager,
    nav: {
      tim: admin || (count ?? 0) > 0,
      analitik: admin,
      kelola: admin,
      editor: admin,
      pengaturan: admin,
      ganti: holdings.length > 1,
    },
    initials: initials(profile.full_name),
  };
});

export type Terms = { board: string; library: string; playbook: string; card: string };
const DEFAULT_TERMS: Terms = { board: 'Board', library: 'Library', playbook: 'Playbook', card: 'Card' };

export const getTerms = cache(async (): Promise<Terms> => {
  const supabase = await createClient();
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'sop_terms').maybeSingle();
  return { ...DEFAULT_TERMS, ...((data?.value as Partial<Terms> | undefined) ?? {}) };
});
