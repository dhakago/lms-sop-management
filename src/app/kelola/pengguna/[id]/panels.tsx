'use client';
import { useForm } from '@/components/use-form';
import { Notice, SecretBox } from '../../ui';
import { mutateUser, resetPassword, setActive, updateMembership, type ActionState } from '../actions';

export function ResetPanel({ id }: { id: string }) {
  const [s, action, pending] = useForm<ActionState>(resetPassword, {});
  return (
    <form method="post" onSubmit={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="id" value={id} />
      <p className="muted" style={{ margin: 0 }}>Membuat kata sandi sementara baru. Yang bersangkutan wajib menggantinya saat masuk, dan kunci akibat salah ketik dibuka.</p>
      <Notice error={s.error} ok={s.password ? undefined : s.ok} />
      {s.password && <SecretBox label={s.ok ?? 'Kata sandi sementara'} value={s.password} />}
      <button className="btn sec" type="submit" disabled={pending} style={{ alignSelf: 'flex-start' }}>
        {pending ? 'Membuat...' : 'Reset kata sandi'}
      </button>
    </form>
  );
}

export function ActivePanel({ id, active, self }: { id: string; active: boolean; self: boolean }) {
  const [s, action, pending] = useForm<ActionState>(setActive, {});
  return (
    <form method="post" onSubmit={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="aktif" value={active ? '0' : '1'} />
      <p className="muted" style={{ margin: 0 }}>
        {active ? 'Pengguna nonaktif tidak bisa masuk. Riwayat baca dan datanya tetap tersimpan.' : 'Pengguna ini nonaktif. Aktifkan kembali agar bisa masuk.'}
      </p>
      <Notice error={s.error} ok={s.ok} />
      <button className="btn sec" type="submit" disabled={pending || self} style={{ alignSelf: 'flex-start' }}>
        {active ? 'Nonaktifkan' : 'Aktifkan kembali'}
      </button>
      {self && <span className="muted">Akun sendiri tidak bisa dinonaktifkan.</span>}
    </form>
  );
}

export function EditPanel({ id, holding, holdingName, unit, jobTitle, managerNo }: {
  id: string; holding: string; holdingName: string; unit: string; jobTitle: string; managerNo: string;
}) {
  const [s, action, pending] = useForm<ActionState>(updateMembership, {});
  return (
    <form method="post" onSubmit={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="holding" value={holding} />
      <b>{holdingName}</b>
      <Notice error={s.error} ok={s.ok} />
      <label className="field"><span>Unit</span><input className="input" name="unit" defaultValue={unit} /></label>
      <label className="field"><span>Jabatan</span><input className="input" name="jabatan" defaultValue={jobTitle} /></label>
      <label className="field"><span>Nomor induk atasan langsung (kosongkan bila tidak ada)</span><input className="input" name="atasan" defaultValue={managerNo} /></label>
      <button className="btn" type="submit" disabled={pending} style={{ alignSelf: 'flex-start' }}>{pending ? 'Menyimpan...' : 'Simpan'}</button>
    </form>
  );
}

export function MutatePanel({ id, from, to }: { id: string; from: { id: string; name: string }[]; to: { id: string; name: string }[] }) {
  const [s, action, pending] = useForm<ActionState>(mutateUser, {});
  return (
    <form method="post" onSubmit={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="id" value={id} />
      <p className="muted" style={{ margin: 0 }}>Keanggotaan di holding asal diakhiri hari ini dan dibuat baru di holding tujuan. Riwayat tetap tersimpan.</p>
      <Notice error={s.error} ok={s.ok} />
      <label className="field">
        <span>Dari</span>
        <select className="input" name="dari">{from.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
      </label>
      <label className="field">
        <span>Ke</span>
        <select className="input" name="ke">{to.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
      </label>
      <label className="field"><span>Unit baru</span><input className="input" name="unit" /></label>
      <label className="field"><span>Jabatan baru</span><input className="input" name="jabatan" /></label>
      <label className="field"><span>Nomor induk atasan baru (opsional)</span><input className="input" name="atasan" /></label>
      <button className="btn" type="submit" disabled={pending} style={{ alignSelf: 'flex-start' }}>{pending ? 'Memindahkan...' : 'Pindahkan'}</button>
    </form>
  );
}
