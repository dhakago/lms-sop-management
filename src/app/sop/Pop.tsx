'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Menutup dialog yang sedang terbuka. Formulir di dalam dialog memanggilnya setelah berhasil.
const CloseCtx = createContext<(() => void) | null>(null);
export const useDialogClose = () => useContext(CloseCtx);

const Dots = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
);
export const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
export const PencilIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14.5 7.5l3 3" /></svg>
);

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  // Dialog dirender di body, jadi warna tema holding disalin dari .shell.
  const back = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sh = document.querySelector('.shell');
    const st = sh?.getAttribute('style');
    if (st && back.current) back.current.style.cssText += ';' + st;
  }, []);
  return createPortal(
    <div className="dlg-back" ref={back} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dlg-head">
          <h2>{title}</h2>
          <button type="button" className="dlg-x" onClick={onClose} aria-label="Tutup">×</button>
        </div>
        <CloseCtx.Provider value={onClose}>{children}</CloseCtx.Provider>
      </div>
    </div>,
    document.body,
  );
}

// Tombol yang membuka dialog. Dipakai untuk "+ Playbook baru", "+ Card baru", dan sejenisnya.
export function DialogButton({ label, title, children, className = 'pill', plus = true }: { label: string; title: string; children: ReactNode; className?: string; plus?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{plus && <PlusIcon />}{label}</button>
      {open && <Modal title={title} onClose={close}>{children}</Modal>}
    </>
  );
}

const MenuCtx = createContext<(() => void) | null>(null);

// Menu titik tiga. Muncul saat induknya (.has-menu) disorot atau difokus.
export function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const d = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', d);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', d); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div ref={box} className={`hover-menu${open ? ' open' : ''}`} draggable={false} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="dots" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}>
        <Dots />
      </button>
      {/* Tetap terpasang saat tertutup agar dialog di dalamnya tidak hilang. */}
      <div className="menu-list" role="menu" hidden={!open}>
        <MenuCtx.Provider value={() => setOpen(false)}>{children}</MenuCtx.Provider>
      </div>
    </div>
  );
}

// Satu baris menu yang membuka dialog.
export function MenuDialog({ label, title, children, danger }: { label: string; title: string; children: ReactNode; danger?: boolean }) {
  const closeMenu = useContext(MenuCtx);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" role="menuitem" className={`menu-item${danger ? ' danger' : ''}`} onClick={() => { setOpen(true); closeMenu?.(); }}>{label}</button>
      {open && <Modal title={title} onClose={close}>{children}</Modal>}
    </>
  );
}
