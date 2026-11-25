import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { getCtx } from '@/lib/session';
import { HOLDING_IDS, isSuper, MODULES, MODULE_LABEL } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { THEMES } from '@/lib/theme';
import { AccessForm } from '../form';

export const metadata = { title: 'Atur akses admin' };

export default async function AturAkses({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!isSuper(ctx)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: p } = await supabase.from('profiles').select('id, full_name, employee_no, role, active').eq('id', id).maybeSingle();
  if (!p || p.role === 'superadmin') notFound();
  const { data: acc } = await supabase.from('admin_access').select('holding_id, module').eq('profile_id', id);

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Akses admin', href: '/kelola/akses' }, { label: p.full_name }]} />
      <h1 className="page-title">{p.full_name}</h1>
      <p className="sub">{p.employee_no}</p>
      {!p.active && <div className="alert err">Pengguna ini nonaktif. Aktifkan dulu sebelum memberi akses.</div>}
      <section className="glass card">
        <AccessForm
          id={p.id}
          holdings={HOLDING_IDS.map((h) => ({ id: h, name: THEMES[h].name }))}
          modules={MODULES.map((m) => ({ id: m, label: MODULE_LABEL[m] }))}
          granted={(acc ?? []).map((a) => `${a.holding_id}|${a.module}`)}
        />
      </section>
    </Shell>
  );
}
