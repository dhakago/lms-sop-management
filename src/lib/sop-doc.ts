// Membersihkan isi card sebelum disimpan: hanya simpul dan tanda yang dikenal RichText yang lolos.
// Dipakai server, jadi isi yang dikirim langsung ke API pun tidak bisa menyisipkan jenis simpul lain.
type Mark = { type: string; attrs?: { href?: string } };
export type DocNode = { type: string; text?: string; marks?: Mark[]; content?: DocNode[]; attrs?: { level?: number } };

const SAFE_HREF = /^(https?:|mailto:|\/)/i;
const MAX_DEPTH = 12;

function cleanMarks(marks: Mark[] | undefined): Mark[] | undefined {
  const out: Mark[] = [];
  for (const m of marks ?? []) {
    if (m.type === 'bold' || m.type === 'italic') out.push({ type: m.type });
    else if (m.type === 'link' && m.attrs?.href && SAFE_HREF.test(m.attrs.href)) out.push({ type: 'link', attrs: { href: m.attrs.href } });
  }
  return out.length ? out : undefined;
}

function cleanNode(n: DocNode, depth: number): DocNode[] {
  if (depth > MAX_DEPTH || !n || typeof n.type !== 'string') return [];
  const kids = () => (n.content ?? []).flatMap((c) => cleanNode(c, depth + 1));
  switch (n.type) {
    case 'text': {
      if (typeof n.text !== 'string' || n.text === '') return [];
      const marks = cleanMarks(n.marks);
      return [{ type: 'text', text: n.text, ...(marks ? { marks } : {}) }];
    }
    case 'paragraph': { const c = kids(); return [{ type: 'paragraph', ...(c.length ? { content: c } : {}) }]; }
    case 'heading': { const c = kids(); return [{ type: 'heading', attrs: { level: n.attrs?.level === 3 ? 3 : 2 }, ...(c.length ? { content: c } : {}) }]; }
    case 'bulletList':
    case 'orderedList': { const c = kids().filter((x) => x.type === 'listItem'); return c.length ? [{ type: n.type, content: c }] : []; }
    case 'listItem': { const c = kids(); return [{ type: 'listItem', content: c.length ? c : [{ type: 'paragraph' }] }]; }
    case 'blockquote': { const c = kids(); return c.length ? [{ type: 'blockquote', content: c }] : []; }
    case 'horizontalRule': return [{ type: 'horizontalRule' }];
    case 'hardBreak': return [{ type: 'hardBreak' }];
    default: return kids(); // jenis tak dikenal dibuang, isinya dipertahankan
  }
}

export function sanitizeDoc(raw: unknown): DocNode | null {
  const root = raw as DocNode | null;
  if (!root || root.type !== 'doc') return null;
  const content = (root.content ?? []).flatMap((c) => cleanNode(c, 1));
  return { type: 'doc', content };
}
