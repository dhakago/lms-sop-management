import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Crumbs } from '@/components/Crumbs';
import { DialogButton, Menu, MenuDialog } from '@/app/sop/Pop';
import { getCtx } from '@/lib/session';
import { holdingsWith } from '@/lib/authz';
import { createClient } from '@/lib/supabase/server';
import { loadCoursePerm } from '@/lib/perm';
import { groupsOf, unitsOf } from '@/lib/people';
import { THEMES, type HoldingId } from '@/lib/theme';
import { fmtDate } from '@/lib/sop';
import {
  AddCardItemForm, AddQuizForm, AddVideoForm, AssignForm, CourseForm, DeleteCourseForm, MoveItemButtons, RemoveAssignmentForm,
  RemoveEnrollmentForm, RemoveItemForm, RenameItemForm, StatusForm, type CardOpt,
} from '../forms';

export const metadata = { title: 'Kursus' };
const KIND: Record<string, string> = { card: 'Bacaan', video: 'Video', quiz: 'Kuis' };
const STATUS: Record<string, [string, string]> = { draft: ['Draf', 'grey'], published: ['Terbit', 'ok'], archived: ['Arsip', 'warn'] };

export default async function EditKursus({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getCtx();
  if (holdingsWith(ctx, 'pembelajaran').length === 0) notFound();
  const db = await createClient();

  const { data: course } = await db.from('courses').select('id, title, description, category, est_minutes, status, enroll_mode, sequential').eq('id', id).maybeSingle();
  if (!course) notFound();
  const { data: ch } = await db.from('course_holdings').select('holding_id').eq('course_id', id);
  const holdingIds = (ch ?? []).map((h) => h.holding_id as HoldingId);

  const [{ data: itemRows }, { data: asg }, { data: enr }, perm] = await Promise.all([
    db.from('course_items').select('id, position, kind, title, video_url, quiz_id, card_id').eq('course_id', id).order('position'),
    db.from('course_assignments').select('id, target_type, holding_id, unit, group_id, profile_id, due_days').eq('course_id', id).order('created_at'),
    db.from('enrollments').select('id, profile_id, status, due_on, escalated_at, source, profiles(full_name, employee_no)').eq('course_id', id).order('enrolled_at', { ascending: false }).limit(500),
    loadCoursePerm(ctx, id),
  ]);
  const items = (itemRows ?? []) as { id: string; kind: string; title: string; video_url: string | null; quiz_id: string | null }[];
  const enrollments = (enr ?? []) as unknown as { id: string; status: string; due_on: string | null; escalated_at: string | null; source: string; profiles: { full_name: string; employee_no: string } | null }[];
  const assignments = (asg ?? []) as { id: string; target_type: string; holding_id: string; unit: string | null; group_id: string | null; profile_id: string | null; due_days: number | null }[];

  // Progres per peserta.
  const eIds = enrollments.map((e) => e.id);
  const { data: prog } = eIds.length ? await db.from('item_progress').select('enrollment_id').in('enrollment_id', eIds) : { data: [] };
  const done = new Map<string, number>();
  for (const p of prog ?? []) done.set(p.enrollment_id as string, (done.get(p.enrollment_id as string) ?? 0) + 1);

  // Card terbit yang bisa dipakai: board-nya harus terbuka untuk semua holding kursus.
  const { data: cardRows } = await db.from('cards')
    .select('id, title, current_version_id, playbooks(name, libraries(name, boards(id, name, board_holdings(holding_id))))')
    .not('current_version_id', 'is', null).limit(600);
  type CardRow = { id: string; title: string; playbooks: { name: string; libraries: { name: string; boards: { id: string; name: string; board_holdings: { holding_id: string }[] } | null } | null } | null };
  const used = new Set((itemRows ?? []).map((i) => i.card_id as string | null).filter(Boolean));
  const cards: CardOpt[] = ((cardRows ?? []) as unknown as CardRow[])
    .filter((c) => {
      const bh = c.playbooks?.libraries?.boards?.board_holdings.map((h) => h.holding_id) ?? [];
      return !used.has(c.id) && holdingIds.every((h) => bh.includes(h));
    })
    .map((c) => ({ id: c.id, label: `${c.playbooks?.libraries?.boards?.name ?? ''} / ${c.playbooks?.name ?? ''} / ${c.title}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'id'));

  const targetHoldings = holdingIds.filter((h) => h !== 'people' && holdingsWith(ctx, 'pembelajaran').includes(h));
  const unitMap = await unitsOf(targetHoldings);
  const units = [...new Set(Object.values(unitMap).flat())].sort((a, b) => a.localeCompare(b, 'id'));
  const groups = (await groupsOf(targetHoldings)).map((g) => ({ id: g.id, name: g.name, holding: g.holding_id, holdingName: THEMES[g.holding_id].name }));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const pIds = assignments.map((a) => a.profile_id).filter((x): x is string => !!x);
  const { data: pn } = pIds.length ? await db.from('profiles').select('id, full_name').in('id', pIds) : { data: [] };
  const personName = new Map((pn ?? []).map((p) => [p.id as string, p.full_name as string]));
  const today = new Date().toISOString().slice(0, 10);
  const [label, tone] = STATUS[course.status] ?? STATUS.draft!;

  const target = (a: (typeof assignments)[number]) =>
    a.target_type === 'group' ? `Grup ${groupName.get(a.group_id!) ?? ''}`
    : a.target_type === 'user' ? `${personName.get(a.profile_id!) ?? 'Orang'}`
    : `${THEMES[a.holding_id as HoldingId]?.name ?? a.holding_id}${a.unit ? `, unit ${a.unit}` : ', semua unit'}`;

  return (
    <Shell ctx={ctx} active="kelola">
      <Crumbs items={[{ label: 'Kelola', href: '/kelola' }, { label: 'Pembelajaran', href: '/kelola/belajar' }, { label: course.title }]} />
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{course.title}</h1>
          <span className={`chip ${tone}`}>{label}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {course.status !== 'published' && <StatusForm id={id} to="published" label="Terbitkan" />}
          {course.status === 'published' && <StatusForm id={id} to="draft" label="Tarik ke draf" variant="btn sec" />}
          <Menu label="Aksi kursus">
            <MenuDialog label="Ubah detail dan izin" title="Detail kursus">
              <CourseForm id={id} title={course.title} description={course.description ?? ''} category={course.category ?? ''} minutes={course.est_minutes}
                mode={course.enroll_mode} sequential={course.sequential} perm={perm} />
            </MenuDialog>
            {course.status !== 'archived' && <MenuDialog label="Arsipkan" title="Arsipkan kursus"><StatusForm id={id} to="archived" label="Arsipkan kursus" /></MenuDialog>}
            <MenuDialog label="Hapus" title="Hapus kursus" danger><DeleteCourseForm id={id} /></MenuDialog>
          </Menu>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {course.enroll_mode === 'terbuka' ? 'Pendaftaran terbuka dari katalog' : 'Hanya lewat penugasan'}
        {course.category ? `, ${course.category}` : ''}{course.est_minutes ? `, sekitar ${course.est_minutes} menit` : ''}
        {holdingIds.length ? `. Holding: ${holdingIds.map((h) => THEMES[h]?.name ?? h).join(', ')}` : ''}
      </p>

      <section className="glass card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>Isi kursus</h2>
          <div className="row" style={{ gap: 8 }}>
            <DialogButton label="Card" title="Tambah card SOP"><AddCardItemForm course={id} cards={cards} /></DialogButton>
            <DialogButton label="Video" title="Tambah video"><AddVideoForm course={id} /></DialogButton>
            <DialogButton label="Kuis" title="Tambah kuis"><AddQuizForm course={id} /></DialogButton>
          </div>
        </div>
        {items.length === 0 ? <p className="muted">Belum ada item. Tambahkan card SOP terbit, video, atau kuis.</p> : (
          <div className="list">
            {items.map((it, i) => (
              <div key={it.id} className="list-row">
                <div className="grow">
                  <b>{i + 1}. {it.title}</b>
                  <div className="muted" style={{ fontSize: 13 }}>{KIND[it.kind]}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {it.kind === 'quiz' && <Link className="btn sec" href={`/kelola/belajar/q/${it.quiz_id}`} style={{ minHeight: 36, padding: '0 12px' }}>Atur kuis</Link>}
                  <MoveItemButtons id={it.id} />
                  <Menu label="Item">
                    <MenuDialog label="Ubah judul" title="Judul item"><RenameItemForm id={it.id} title={it.title} /></MenuDialog>
                    <MenuDialog label="Hapus" title="Hapus item" danger><RemoveItemForm id={it.id} /></MenuDialog>
                  </Menu>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>Penugasan</h2>
          {targetHoldings.length > 0 && <DialogButton label="Tugaskan" title="Tugaskan kursus"><AssignForm course={id} holdings={targetHoldings.map((h) => ({ id: h, name: THEMES[h].name }))} units={units} groups={groups} /></DialogButton>}
        </div>
        {assignments.length === 0 ? <p className="muted">Belum ada penugasan. Peserta tetap bisa mendaftar sendiri bila pendaftaran terbuka.</p> : (
          <div className="list">
            {assignments.map((a) => (
              <div key={a.id} className="list-row">
                <div className="grow"><b>{target(a)}</b><div className="muted" style={{ fontSize: 13 }}>{a.due_days ? `Batas ${a.due_days} hari sejak terdaftar` : 'Tanpa batas waktu'}</div></div>
                <RemoveAssignmentForm id={a.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass card">
        <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>Peserta ({enrollments.length})</h2>
        {enrollments.length === 0 ? <p className="muted">Belum ada peserta.</p> : (
          <div className="list">
            {enrollments.map((e) => (
              <div key={e.id} className="list-row">
                <div className="grow">
                  <b>{e.profiles?.full_name ?? 'Peserta'}</b>
                  <div className="muted" style={{ fontSize: 13 }}>{e.profiles?.employee_no}, {done.get(e.id) ?? 0} dari {items.length} item, {e.source === 'ditugaskan' ? 'ditugaskan' : 'daftar sendiri'}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {e.escalated_at && <span className="chip bad">Perlu tindak lanjut</span>}
                  {e.due_on && e.status !== 'selesai' && <span className={`chip ${e.due_on < today ? 'bad' : 'warn'}`}>Batas {fmtDate(e.due_on)}</span>}
                  <span className={`chip ${e.status === 'selesai' ? 'ok' : 'grey'}`}>{e.status === 'selesai' ? 'Selesai' : 'Berjalan'}</span>
                  <RemoveEnrollmentForm id={e.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}
