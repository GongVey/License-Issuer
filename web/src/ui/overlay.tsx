import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import { IconButton } from './controls';

// Native <dialog> gives focus trapping, Esc handling and top-layer stacking without injecting <style> tags (strict CSP).
function useDialog(open: boolean, onClose: () => void, locked: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const lockedRef = useRef(locked); lockedRef.current = locked;
  useEffect(() => {
    const dialog = ref.current; if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const dialog = ref.current; if (!dialog) return;
    const cancel = (e: Event) => { e.preventDefault(); if (!lockedRef.current) closeRef.current(); };
    const click = (e: MouseEvent) => { if (e.target === dialog && !lockedRef.current) closeRef.current(); };
    dialog.addEventListener('cancel', cancel); dialog.addEventListener('click', click);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('click', click); };
  }, []);
  return ref;
}

interface OverlayProps { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; locked?: boolean; className?: string; label?: string }

// Centered dialog on desktop; on phones it becomes a bottom sheet so actions stay within thumb reach.
export function Modal({ open, onClose, title, description, children, footer, locked = false, className, size = 'md', label }: OverlayProps & { size?: 'sm' | 'md' | 'lg' }) {
  const ref = useDialog(open, onClose, locked);
  return (
    <dialog ref={ref} aria-label={label || (typeof title === 'string' ? title : undefined)}
      className={cn('anim-up md:anim-pop m-0 mt-auto w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl shadow-lg open:flex',
        'md:m-auto md:max-h-[calc(100dvh-48px)] md:rounded-2xl md:border md:border-line',
        size === 'sm' ? 'md:w-[420px]' : size === 'lg' ? 'md:w-[720px]' : 'md:w-[560px]', className)}>
      {open && <>
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden />
        {title && (
          <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3 md:pt-5">
            <div className="min-w-0"><h2 className="text-base font-semibold">{title}</h2>{description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}</div>
            <IconButton label="关闭" size="sm" className="-mr-1.5 -mt-1" disabled={locked} onClick={onClose}><X className="size-4" /></IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="pb-safe border-t border-line bg-surface-2/60"><div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">{footer}</div></div>}
      </>}
    </dialog>
  );
}

// Right-hand drawer on desktop, near full-height bottom sheet on phones.
export function Sheet({ open, onClose, children, footer, header, label, locked = false }: Omit<OverlayProps, 'title'> & { header?: ReactNode }) {
  const ref = useDialog(open, onClose, locked);
  return (
    <dialog ref={ref} aria-label={label}
      className={cn('anim-up md:anim-left m-0 mt-auto h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-lg open:flex',
        'md:mt-0 md:ml-auto md:h-dvh md:w-[540px] md:rounded-none md:border-l md:border-line')}>
      {open && <>
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden />
        {header && <div className="shrink-0 border-b border-line px-5 pt-3 pb-4 md:pt-5">{header}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">{children}</div>
        {footer && <div className="pb-safe shrink-0 border-t border-line bg-surface-2/60"><div className="flex flex-wrap items-center gap-2 px-5 py-3">{footer}</div></div>}
      </>}
    </dialog>
  );
}
