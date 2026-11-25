'use client';
import { useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useForm } from '@/components/use-form';
import { Notice } from '../../../ui';
import { saveCard, type St } from '../../actions';

type Props = { id: string; title: string; doc: unknown; published: boolean; version: number | null };

export function CardEditor({ id, title, doc, published, version }: Props) {
  const [json, setJson] = useState(() => JSON.stringify(doc));
  const [dirty, setDirty] = useState(false);
  const [intent, setIntent] = useState<'simpan' | 'terbit'>('simpan');
  const [st, onSubmit, pending] = useForm<St>(saveCard, {});

  const editor = useEditor({
    immediatelyRender: false, // hindari beda render server dan klien
    // Hanya yang dikenali RichText: heading 2 dan 3, daftar, kutipan, garis, tebal, miring, tautan.
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        underline: false, strike: false, code: false, codeBlock: false,
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
    ],
    content: doc as object,
    editorProps: { attributes: { class: 'prose editor-body', 'aria-label': 'Isi card', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => { setJson(JSON.stringify(e.getJSON())); setDirty(true); },
  });

  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e?.isActive('heading', { level: 2 }) ?? false,
      h3: e?.isActive('heading', { level: 3 }) ?? false,
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      ul: e?.isActive('bulletList') ?? false,
      ol: e?.isActive('orderedList') ?? false,
      quote: e?.isActive('blockquote') ?? false,
      link: e?.isActive('link') ?? false,
    }),
  });

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Alamat tautan (https://...). Kosongkan untuk menghapus tautan.', prev ?? 'https://');
    if (url === null) return;
    if (url.trim() === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    if (!/^(https?:|mailto:|\/)/i.test(url.trim())) { window.alert('Tautan harus diawali https://, http://, atau mailto:'); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  const btn = (label: string, active: boolean, run: () => void, title?: string) => (
    <button type="button" className={`tb${active ? ' on' : ''}`} aria-pressed={active} title={title ?? label} onClick={run} disabled={!editor}>{label}</button>
  );
  const c = () => editor!.chain().focus();

  return (
    <form
      onSubmit={(e) => {
        const b = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (b?.value === 'terbit' && !window.confirm('Terbitkan card ini sekarang? Peserta langsung melihat versi baru.')) { e.preventDefault(); return; }
        setDirty(false);
        onSubmit(e);
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isi" value={json} />
      <label className="field"><span>Judul</span><input className="input" name="judul" defaultValue={title} required maxLength={120} onChange={() => setDirty(true)} /></label>

      <div>
        <div className="toolbar" role="toolbar" aria-label="Format teks">
          {btn('Judul', on?.h2 ?? false, () => c().toggleHeading({ level: 2 }).run(), 'Judul bagian')}
          {btn('Sub', on?.h3 ?? false, () => c().toggleHeading({ level: 3 }).run(), 'Sub judul')}
          {btn('Tebal', on?.bold ?? false, () => c().toggleBold().run())}
          {btn('Miring', on?.italic ?? false, () => c().toggleItalic().run())}
          {btn('Daftar', on?.ul ?? false, () => c().toggleBulletList().run(), 'Daftar berpoin')}
          {btn('Nomor', on?.ol ?? false, () => c().toggleOrderedList().run(), 'Daftar bernomor')}
          {btn('Kutipan', on?.quote ?? false, () => c().toggleBlockquote().run(), 'Kutipan atau catatan penting')}
          {btn('Garis', false, () => c().setHorizontalRule().run(), 'Garis pemisah')}
          {btn('Tautan', on?.link ?? false, setLink)}
        </div>
        <div className="editor-wrap"><EditorContent editor={editor} /></div>
      </div>

      <Notice error={st.error} ok={st.ok} />
      <div className="row">
        <button className="btn sec" type="submit" name="aksi" value="simpan" disabled={pending} onClick={() => setIntent('simpan')}>
          {pending && intent === 'simpan' ? 'Menyimpan...' : 'Simpan draf'}
        </button>
        {dirty && <span className="chip warn">Belum disimpan</span>}
      </div>

      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <legend style={{ fontWeight: 600, padding: '0 6px' }}>Terbitkan</legend>
        <p className="muted" style={{ margin: 0 }}>{published ? `Versi terbit sekarang: ${version}. Menerbitkan membuat versi baru.` : 'Card ini belum pernah terbit, jadi belum terlihat oleh peserta.'} Draf ikut disimpan saat diterbitkan.</p>
        <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <input type="radio" name="jenis" value="kecil" defaultChecked style={{ width: 22, height: 22, marginTop: 2 }} />
          <span><b>Perubahan kecil</b><br /><span className="muted">Salah ketik atau perbaikan redaksi. Peserta yang sudah membaca tidak perlu membaca ulang.</span></span>
        </label>
        <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <input type="radio" name="jenis" value="besar" style={{ width: 22, height: 22, marginTop: 2 }} />
          <span><b>Perubahan besar</b><br /><span className="muted">Isi prosedur berubah. Semua peserta wajib membaca ulang.</span></span>
        </label>
        <label className="field"><span>Catatan perubahan (opsional)</span><input className="input" name="catatan" maxLength={300} /></label>
        <button className="btn" type="submit" name="aksi" value="terbit" disabled={pending} onClick={() => setIntent('terbit')} style={{ alignSelf: 'flex-start' }}>
          {pending && intent === 'terbit' ? 'Menerbitkan...' : 'Terbitkan'}
        </button>
      </fieldset>
    </form>
  );
}
