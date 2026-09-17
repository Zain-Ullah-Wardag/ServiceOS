import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Native modal semantics provide focus containment and make the background inert. */
export default function WorkflowDrawer({ open, title, subtitle, busy, onClose, children }: {
  open: boolean; title: string; subtitle?: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
      else document.querySelector<HTMLElement>('[data-workflow-return-focus]')?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [open, title]);

  if (!open) return null;
  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-busy={busy}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        // Also wrap at the ends rather than letting native dialogs tab into browser chrome.
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
        const index = elements.indexOf(document.activeElement as HTMLElement);
        if (!elements.length) { event.preventDefault(); headingRef.current?.focus(); }
        else if (event.shiftKey ? index <= 0 : index === elements.length - 1 || index === -1) {
          event.preventDefault(); elements[event.shiftKey ? elements.length - 1 : 0].focus();
        }
      }}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget || busy) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-2xl border-0 p-0 bg-white text-slate-800 shadow-2xl open:flex open:flex-col overflow-hidden backdrop:bg-slate-950/40">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-1">Tailoring workspace</p><h2 ref={headingRef} tabIndex={-1} id={titleId} className="font-serif text-2xl break-words outline-none">{title}</h2>{subtitle && <p className="text-sm text-slate-500 mt-1 break-words">{subtitle}</p>}</div>
        <button type="button" autoFocus disabled={busy} onClick={onClose} aria-label="Close drawer" className="shrink-0 rounded-full border border-slate-200 p-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-40"><X size={18} /></button>
      </header>
      <div ref={scrollRef} className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6 [overflow-wrap:anywhere]">{children}</div>
    </dialog>, document.body,
  );
}
