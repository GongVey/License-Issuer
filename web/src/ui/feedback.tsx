import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button, Input } from './controls';
import { Modal } from './overlay';

type ToastKind = 'success' | 'error';
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export interface ConfirmOptions {
  title: string; message: ReactNode; detail?: ReactNode; confirmText?: string; danger?: boolean;
  typeToConfirm?: string; action: () => Promise<unknown>;
}
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: ToastKind }>>([]);
  const nextId = useRef(0);
  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++nextId.current;
    setToasts(list => [...list.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);

  // The stack is a manual popover: re-showing it moves it above any open <dialog> in the top layer.
  const stack = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stack.current; if (!el || !('showPopover' in el)) return;
    try { if (el.matches(':popover-open')) el.hidePopover(); if (toasts.length) el.showPopover(); } catch { /* unsupported */ }
  }, [toasts]);

  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => setPending({ ...options, resolve })), []);

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        {pending && <ConfirmDialog key={pending.title + pending.confirmText} options={pending} onDone={ok => { pending.resolve(ok); setPending(null); }} />}
        {/* Sits above the phone tab bar; bottom-right on desktop. */}
        <div ref={stack} popover="manual" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-auto bottom-[calc(76px+env(safe-area-inset-bottom))] z-[100] m-0 flex w-auto flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4 md:left-auto md:right-5 md:bottom-5 md:items-end">
          {toasts.map(t => (
            <div key={t.id} className={cn('anim-toast pointer-events-auto flex max-w-[min(440px,100%)] items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] shadow-lg',
              t.kind === 'error' ? 'bg-danger text-white' : 'bg-fg text-bg')}>
              {t.kind === 'error' ? <XCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}<span>{t.message}</span>
            </div>
          ))}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ConfirmDialog({ options, onDone }: { options: ConfirmOptions; onDone: (ok: boolean) => void }) {
  const { title, message, detail, confirmText = '确认', danger = true, typeToConfirm, action } = options;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(true);
  const blocked = Boolean(typeToConfirm) && typed.trim() !== typeToConfirm;
  const close = (ok: boolean) => { setOpen(false); onDone(ok); };
  return (
    <Modal open={open} size="sm" locked={running} onClose={() => close(false)} label={title}
      footer={<>
        <Button className="max-md:flex-1" disabled={running} onClick={() => close(false)}>取消</Button>
        <Button className="max-md:flex-1" variant={danger ? 'danger' : 'primary'} loading={running} disabled={blocked} onClick={async () => {
          setRunning(true); setError('');
          try { await action(); close(true); } catch (e) { setError((e as Error).message); } finally { setRunning(false); }
        }}>{confirmText}</Button>
      </>}>
      <div className="grid gap-4 pt-4 md:pt-5">
        <div className="flex gap-3.5">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', danger ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>
            {danger ? <AlertTriangle className="size-5" /> : <Info className="size-5" />}
          </span>
          <div className="min-w-0"><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-[13px] leading-relaxed text-fg-2">{message}</p></div>
        </div>
        {detail && <div className="flex gap-2 rounded-xl bg-warn-soft px-3.5 py-3 text-[13px] text-warn"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{detail}</span></div>}
        {typeToConfirm && <Input autoFocus placeholder={`输入 ${typeToConfirm} 以确认`} aria-label="确认内容" value={typed} onChange={e => setTyped(e.target.value)} />}
        {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
