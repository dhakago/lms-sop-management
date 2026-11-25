'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useForm } from '@/components/use-form';
import { Notice } from '../../../ui';
import { saveCard, type St } from '../../actions';

type Props = {
  id: string; title: string; doc: unknown; published: boolean; version: number | null;
  backHref: string; crumbs: { label: string }[];
};

const I = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
);
const IC = {
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: I('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  more: I('<path d="M4 18L9 5l5 13M5.8 14h6.4"/><path d="M18 6v.01M18 10v.01M18 14v.01"/>'),
  link: I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  ol: I('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5l1.5-1v4M4 14h3l-3 3h3"/>'),
  ul: I('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>'),
  quote: I('<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>'),
  bold: I('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
  italic: I('<path d="M14 5h-4M14 19h-4M15 5l-6 14"/>'),
  underline: I('<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'),
  hr: I('<path d="M4 12h16"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  chev: I('<path d="M6 9l6 6 6-6"/>'),
};

// Menu "Sisipkan" ala Whale: kotak cari lalu daftar. Hanya yang sudah didukung isi card.
function InsertMenu({ items }: { items: { label: string; group: string; icon: ReactNode; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const d = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', d); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', d); document.removeEventListener('keydown', k); };
  }, [open]);
  const shown = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = [...new Set(shown.map((i) => i.group))];
  return (
    <div ref={box} className="ins">
      <button type="button" className="ins-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((o) => !o); setQ(''); }}>
        {IC.plus} Sisipkan {IC.chev}
      </button>
      {open && (
        <div className="ins-pop" role="menu">
          <input className="ins-q" placeholder="Cari, misalnya garis atau kutipan" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Cari" />
          {groups.map((g) => (
            <div key={g}>
              <div className="ins-g">{g}</div>
              {shown.filter((i) => i.group === g).map((i) => (
                <button key={i.label} type="button" role="menuitem" className="ins-i" onClick={() => { i.run(); setOpen(false); }}><span className="ins-ic">{i.icon}</span>{i.label}</button>
              ))}
            </div>
          ))}
          {shown.length === 0 && <p className="muted" style={{ padding: '8px 12px', margin: 0 }}>Tidak ada yang cocok.</p>}
        </div>
      )}
    </div>
  );
}

// Editor satu halaman seperti Whale: bilah atas (lokasi, nama card, Batal, Simpan), toolbar, lalu lembar tulis.
export function CardEditor({ id, title, doc, published, version, backHref, crumbs }: Props) {
  const [json, setJson] = useState(() => JSON.stringify(doc));
  const [dirty, setDirty] = useState(false);
  const [panel, setPanel] = useState(false);
  const [more, setMore] = useState(true); // baris kedua: tebal, miring, garis bawah
  const [intent, setIntent] = useState<'simpan' | 'terbit'>('simpan');
  const [st, onSubmit, pending] = useForm<St>(saveCard, {});

  const editor = useEditor({
    immediatelyRender: false, // hindari beda render server dan klien
    // Hanya yang dikenali RichText: heading 2 dan 3, daftar, kutipan, garis, tebal, miring, tautan.
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        strike: false, code: false, codeBlock: false,
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
      underline: e?.isActive('underline') ?? false,
      ul: e?.isActive('bulletList') ?? false,
      ol: e?.isActive('orderedList') ?? false,
      quote: e?.isActive('blockquote') ?? false,
      link: e?.isActive('link') ?? false,
      undo: e?.can().undo() ?? false,
      redo: e?.can().redo() ?? false,
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

  const c = () => editor!.chain().focus();
  const btn = (icon: ReactNode, active: boolean, run: () => void, title: string, disabled = false) => (
    <button type="button" className={`ib${active ? ' on' : ''}`} aria-pressed={active} aria-label={title} title={title} onClick={run} disabled={!editor || disabled}>{icon}</button>
  );
  const style = on?.h2 ? 'h2' : on?.h3 ? 'h3' : 'p';
  const setStyle = (v: string) => {
    if (v === 'p') c().setParagraph().run();
    else c().setHeading({ level: v === 'h2' ? 2 : 3 }).run();
  };

  return (
    <form
      method="post"
      className="ed"
      onSubmit={(e) => {
        const b = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (b?.value === 'terbit' && !window.confirm('Terbitkan card ini sekarang? Peserta langsung melihat versi baru.')) { e.preventDefault(); return; }
        setDirty(false);
        onSubmit(e);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isi" value={json} />

      <div className="ed-top">
        <nav aria-label="Lokasi" className="ed-crumbs">
          {crumbs.map((x, i) => <span key={i}>{i > 0 && <span aria-hidden="true"> / </span>}{x.label}</span>)}
        </nav>
        <div className="ed-bar">
          <label className="ed-name">
            <span>Nama card *</span>
            <input className="input" name="judul" defaultValue={title} required maxLength={120} onChange={() => setDirty(true)} />
          </label>
          <div className="row" style={{ gap: 10 }}>
            <span className={`chip ${published ? 'ok' : 'warn'}`}>{published ? `Terbit, versi ${version ?? '-'}` : 'Draf'}</span>
            {dirty && <span className="chip warn">Belum disimpan</span>}
            <Link className="btn sec" href={backHref} onClick={(e) => { if (dirty && !window.confirm('Ada perubahan yang belum disimpan. Tetap keluar?')) e.preventDefault(); }}>Batal</Link>
            <button className="btn sec" type="submit" name="aksi" value="simpan" disabled={pending} onClick={() => setIntent('simpan')}>
              {pending && intent === 'simpan' ? 'Menyimpan...' : 'Simpan draf'}
            </button>
            <button className="btn" type="button" aria-expanded={panel} onClick={() => setPanel((v) => !v)}>Terbitkan</button>
          </div>
        </div>
        <Notice error={st.error} ok={st.ok} />

        {panel && (
          <div className="ed-pub glass" role="group" aria-label="Terbitkan card">
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
            <div className="row">
              <button className="btn" type="submit" name="aksi" value="terbit" disabled={pending} onClick={() => setIntent('terbit')}>
                {pending && intent === 'terbit' ? 'Menerbitkan...' : 'Terbitkan sekarang'}
              </button>
              <button className="btn sec" type="button" onClick={() => setPanel(false)}>Tutup</button>
            </div>
          </div>
        )}
      </div>

      <div className="ed-canvas">
        <div className="ed-tools" role="toolbar" aria-label="Format teks">
          <div className="ed-row">
            {btn(IC.undo, false, () => c().undo().run(), 'Urungkan', !on?.undo)}
            {btn(IC.redo, false, () => c().redo().run(), 'Ulangi', !on?.redo)}
            <span className="sep" />
            <select className="ib-select" aria-label="Gaya teks" value={style} onChange={(e) => setStyle(e.target.value)} disabled={!editor}>
              <option value="p">Paragraf</option>
              <option value="h2">Judul bagian</option>
              <option value="h3">Sub judul</option>
            </select>
            {btn(IC.more, more, () => setMore((v) => !v), 'Teks lainnya: tebal, miring, garis bawah')}
            <span className="sep" />
            {btn(IC.link, on?.link ?? false, setLink, 'Tautan')}
            <span className="sep" />
            {btn(IC.ol, on?.ol ?? false, () => c().toggleOrderedList().run(), 'Daftar bernomor')}
            {btn(IC.ul, on?.ul ?? false, () => c().toggleBulletList().run(), 'Daftar berpoin')}
            {btn(IC.quote, on?.quote ?? false, () => c().toggleBlockquote().run(), 'Kutipan atau catatan penting')}
            <span className="grow" />
            <InsertMenu items={[
              { label: 'Garis pemisah', group: 'Struktur', icon: IC.hr, run: () => c().setHorizontalRule().run() },
              { label: 'Kutipan atau catatan penting', group: 'Struktur', icon: IC.quote, run: () => c().toggleBlockquote().run() },
              { label: 'Tautan', group: 'Sisipkan dan simbol', icon: IC.link, run: setLink },
            ]} />
          </div>
          {more && (
            <div className="ed-row">
              {btn(IC.bold, on?.bold ?? false, () => c().toggleBold().run(), 'Tebal')}
              {btn(IC.italic, on?.italic ?? false, () => c().toggleItalic().run(), 'Miring')}
              {btn(IC.underline, on?.underline ?? false, () => c().toggleUnderline().run(), 'Garis bawah')}
            </div>
          )}
        </div>
        <div className="ed-sheet"><EditorContent editor={editor} /></div>
      </div>
    </form>
  );
}
