'use client';
import { Form, Field } from '@/app/kelola/sop/forms';
import { TargetPicker, type GroupOpt } from '@/app/kelola/sop/target';
import { PermField } from '@/app/sop/permissions';
import type { PermOptions, PermState } from '@/lib/perm-types';
import {
  addAssignment, addCardItem, addQuizItem, addVideoItem, createCourse, deleteCourse, deleteQuestion, moveItem, removeAssignment,
  removeEnrollment, removeItem, renameItem, saveQuestion, setCourseStatus, setQuizStatus, updateCourse, updateQuiz,
} from './actions';

type Perm = { init: PermState; options: PermOptions };

export const NewCourseForm = ({ perm }: { perm: Perm }) => (
  <Form action={createCourse} submit="Buat kursus" wait="Membuat...">
    <Field label="Judul kursus" name="judul" required max={120} />
    <PermField init={perm.init} options={perm.options} />
  </Form>
);

export function CourseForm({ id, title, description, category, minutes, mode, sequential, perm }: {
  id: string; title: string; description: string; category: string; minutes: number | null; mode: string; sequential: boolean; perm: Perm;
}) {
  return (
    <Form action={updateCourse} hidden={{ id }} submit="Simpan">
      <Field label="Judul" name="judul" defaultValue={title} required max={120} />
      <label className="field"><span>Deskripsi (opsional)</span><textarea className="input" name="deskripsi" rows={3} defaultValue={description} maxLength={1000} /></label>
      <Field label="Kategori (opsional)" name="kategori" defaultValue={category} max={60} />
      <Field label="Perkiraan durasi, menit (opsional)" name="menit" type="number" defaultValue={minutes ? String(minutes) : ''} />
      <label className="field"><span>Pendaftaran</span>
        <select className="input" name="mode" defaultValue={mode}>
          <option value="terbuka">Terbuka: peserta bisa daftar sendiri dari katalog</option>
          <option value="ditugaskan">Ditugaskan: hanya lewat penugasan admin</option>
        </select>
      </label>
      <label className="row" style={{ gap: 10, minHeight: 44 }}>
        <input type="checkbox" name="urut" value="1" defaultChecked={sequential} style={{ width: 22, height: 22 }} />
        <span>Item harus diselesaikan berurutan</span>
      </label>
      <PermField init={perm.init} options={perm.options} />
    </Form>
  );
}

export const StatusForm = ({ id, to, label, variant = 'btn', confirm }: { id: string; to: 'draft' | 'published' | 'archived'; label: string; variant?: 'btn' | 'btn sec'; confirm?: string }) => (
  <Form action={setCourseStatus} hidden={{ id, status: to }} submit={label} variant={variant} confirm={confirm} row />
);
export const DeleteCourseForm = ({ id }: { id: string }) => (
  <Form action={deleteCourse} hidden={{ id }} submit="Hapus kursus" variant="btn sec" confirm="Hapus kursus ini beserta item dan kuisnya? Tidak bisa dibatalkan." row />
);

// ---- Item ----
export type CardOpt = { id: string; label: string };
export const AddCardItemForm = ({ course, cards }: { course: string; cards: CardOpt[] }) => (
  <Form action={addCardItem} hidden={{ course }} submit="Tambahkan card" resetOnOk>
    <label className="field"><span>Card terbit</span>
      <select className="input" name="card" required defaultValue="">
        <option value="" disabled>{cards.length ? 'Pilih card' : 'Tidak ada card terbit yang cocok'}</option>
        {cards.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
    </label>
    <Field label="Judul di kursus (kosongkan untuk memakai judul card)" name="judul" max={120} />
  </Form>
);
export const AddVideoForm = ({ course }: { course: string }) => (
  <Form action={addVideoItem} hidden={{ course }} submit="Tambahkan video" resetOnOk>
    <Field label="Judul" name="judul" required max={120} />
    <Field label="Tautan video (YouTube, https://)" name="url" required max={300} />
  </Form>
);
export const AddQuizForm = ({ course }: { course: string }) => (
  <Form action={addQuizItem} hidden={{ course }} submit="Buat kuis" wait="Membuat...">
    <Field label="Judul kuis" name="judul" required max={120} />
  </Form>
);
export const RenameItemForm = ({ id, title }: { id: string; title: string }) => (
  <Form action={renameItem} hidden={{ id }} submit="Simpan">
    <Field label="Judul item" name="judul" defaultValue={title} required max={120} />
  </Form>
);
export const RemoveItemForm = ({ id }: { id: string }) => (
  <Form action={removeItem} hidden={{ id }} submit="Hapus" variant="btn sec" confirm="Hapus item ini dari kursus?" row />
);
export const MoveItemButtons = ({ id }: { id: string }) => (
  <span className="row" style={{ gap: 4 }}>
    <Form action={moveItem} hidden={{ id, arah: 'naik' }} submit="Naik" variant="btn sec" row />
    <Form action={moveItem} hidden={{ id, arah: 'turun' }} submit="Turun" variant="btn sec" row />
  </span>
);

// ---- Kuis ----
export function QuizSettingsForm({ q }: { q: { id: string; title: string; pass: number; max: number | null; cooldown: number; show: string; shuffleQ: boolean; shuffleA: boolean } }) {
  return (
    <Form action={updateQuiz} hidden={{ id: q.id }} submit="Simpan pengaturan">
      <Field label="Judul" name="judul" defaultValue={q.title} required max={120} />
      <Field label="Nilai lulus (%)" name="lulus" type="number" defaultValue={String(q.pass)} required />
      <Field label="Batas percobaan (kosongkan untuk tanpa batas)" name="maks" type="number" defaultValue={q.max ? String(q.max) : ''} />
      <Field label="Jeda sebelum mengulang, menit (0 untuk tanpa jeda)" name="jeda" type="number" defaultValue={String(q.cooldown)} />
      <label className="field"><span>Tinjauan jawaban</span>
        <select className="input" name="tinjau" defaultValue={q.show}>
          <option value="end">Tampilkan jawaban benar setelah mengirim</option>
          <option value="never">Jangan tampilkan jawaban benar</option>
        </select>
      </label>
      <label className="row" style={{ gap: 10, minHeight: 44 }}><input type="checkbox" name="acak_soal" value="1" defaultChecked={q.shuffleQ} style={{ width: 22, height: 22 }} /><span>Acak urutan soal</span></label>
      <label className="row" style={{ gap: 10, minHeight: 44 }}><input type="checkbox" name="acak_jawab" value="1" defaultChecked={q.shuffleA} style={{ width: 22, height: 22 }} /><span>Acak urutan pilihan</span></label>
    </Form>
  );
}
export const QuizStatusForm = ({ id, live }: { id: string; live: boolean }) => (
  <Form action={setQuizStatus} hidden={{ id, status: live ? 'draft' : 'live' }} submit={live ? 'Kembalikan ke draf' : 'Aktifkan kuis'} variant={live ? 'btn sec' : 'btn'} row />
);

export function QuestionForm({ quiz, q }: { quiz: string; q?: { id: string; prompt: string; explanation: string; options: { text: string; correct: boolean }[] } }) {
  return (
    <Form action={saveQuestion} hidden={{ quiz, ...(q ? { id: q.id } : {}) }} submit={q ? 'Simpan soal' : 'Tambah soal'} resetOnOk={!q}>
      <label className="field"><span>Soal</span><textarea className="input" name="soal" rows={2} required maxLength={600} defaultValue={q?.prompt} /></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <legend style={{ fontWeight: 600, marginBottom: 4 }}>Pilihan jawaban (centang yang benar, boleh lebih dari satu)</legend>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div key={n} className="row" style={{ gap: 10, alignItems: 'center' }}>
            <input type="checkbox" name={`benar_${n}`} value="1" defaultChecked={q?.options[n - 1]?.correct} aria-label={`Pilihan ${n} benar`} style={{ width: 22, height: 22 }} />
            <input className="input" name={`opsi_${n}`} placeholder={`Pilihan ${n}${n > 2 ? ' (opsional)' : ''}`} defaultValue={q?.options[n - 1]?.text} maxLength={300} style={{ flex: 1 }} aria-label={`Teks pilihan ${n}`} />
          </div>
        ))}
      </fieldset>
      <label className="field"><span>Penjelasan (opsional, tampil di tinjauan)</span><textarea className="input" name="penjelasan" rows={2} maxLength={1000} defaultValue={q?.explanation} /></label>
    </Form>
  );
}
export const DeleteQuestionForm = ({ quiz, id }: { quiz: string; id: string }) => (
  <Form action={deleteQuestion} hidden={{ quiz, id }} submit="Hapus soal" variant="btn sec" confirm="Hapus soal ini?" row />
);

// ---- Penugasan dan peserta ----
export const AssignForm = ({ course, holdings, units, groups }: { course: string; holdings: { id: string; name: string }[]; units: string[]; groups: GroupOpt[] }) => (
  <Form action={addAssignment} hidden={{ course }} submit="Tugaskan" resetOnOk>
    <TargetPicker holdings={holdings} units={units} groups={groups} kinds={['holding', 'group', 'user']} />
    <Field label="Batas penyelesaian, hari sejak terdaftar (opsional)" name="hari" type="number" />
  </Form>
);
export const RemoveAssignmentForm = ({ id }: { id: string }) => (
  <Form action={removeAssignment} hidden={{ id }} submit="Cabut" variant="btn sec" confirm="Cabut penugasan ini? Peserta yang sudah terdaftar tetap ada." row />
);
export const RemoveEnrollmentForm = ({ id }: { id: string }) => (
  <Form action={removeEnrollment} hidden={{ id }} submit="Keluarkan" variant="btn sec" confirm="Keluarkan peserta ini? Progres dan nilainya ikut terhapus." row />
);
