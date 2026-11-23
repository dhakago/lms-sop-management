import type { ReactNode } from 'react';

// Menampilkan isi card (format ProseMirror JSON). Hanya simpul dan tanda yang dikenal yang dirender,
// sehingga isi tidak bisa menyisipkan HTML atau skrip.
type Mark = { type: string; attrs?: { href?: string } };
type Node = { type: string; text?: string; marks?: Mark[]; content?: Node[]; attrs?: { level?: number; src?: string; alt?: string } };

function safeHref(h?: string) {
  return h && /^(https?:|mailto:|\/)/i.test(h) ? h : undefined;
}

function leaf(n: Node, key: number): ReactNode {
  let out: ReactNode = n.text ?? '';
  for (const m of n.marks ?? []) {
    if (m.type === 'bold') out = <strong>{out}</strong>;
    else if (m.type === 'italic') out = <em>{out}</em>;
    else if (m.type === 'link' && safeHref(m.attrs?.href)) out = <a href={safeHref(m.attrs?.href)} rel="noopener noreferrer" target="_blank">{out}</a>;
  }
  return <span key={key} style={{ display: 'contents' }}>{out}</span>;
}

function kids(n: Node): ReactNode[] {
  return (n.content ?? []).map((c, i) => render(c, i));
}

function render(n: Node, key: number): ReactNode {
  switch (n.type) {
    case 'text': return leaf(n, key);
    case 'paragraph': return <p key={key}>{kids(n)}</p>;
    case 'heading': return n.attrs?.level === 3 ? <h3 key={key}>{kids(n)}</h3> : <h2 key={key}>{kids(n)}</h2>;
    case 'bulletList': return <ul key={key}>{kids(n)}</ul>;
    case 'orderedList': return <ol key={key}>{kids(n)}</ol>;
    case 'listItem': return <li key={key}>{kids(n)}</li>;
    case 'blockquote': return <blockquote key={key}>{kids(n)}</blockquote>;
    case 'horizontalRule': return <hr key={key} />;
    case 'hardBreak': return <br key={key} />;
    default: return null;
  }
}

export function RichText({ doc }: { doc: unknown }) {
  const root = doc as Node | null;
  if (!root || root.type !== 'doc' || !root.content?.length) {
    return <p className="muted">Card ini belum punya isi.</p>;
  }
  return <div className="prose">{kids(root)}</div>;
}
