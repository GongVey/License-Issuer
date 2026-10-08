import type { CSSProperties, ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { RESULT, STATE_HINT, STATE_LABEL } from '../lib/format';
import type { CardState } from '../lib/types';
import { IconButton } from './controls';
import { useToast } from './feedback';

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-xl border border-line bg-surface shadow-xs', className)} {...rest}>{children}</section>;
}
export function PanelHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 md:px-5', className)}>
      <div className="min-w-0"><h2 className="text-sm font-semibold tracking-tight">{title}</h2>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>
      {actions}
    </div>
  );
}

const TONES = {
  neutral: 'bg-neutral-soft text-fg-2', ok: 'bg-ok-soft text-ok', fail: 'bg-danger-soft text-danger', warn: 'bg-warn-soft text-warn', info: 'bg-info-soft text-info', primary: 'bg-primary-soft text-primary-strong',
};
export function Badge({ tone = 'neutral', dot = true, children, title, className }: { tone?: keyof typeof TONES; dot?: boolean; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn('inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}{children}
    </span>
  );
}
const STATE_TONE: Record<CardState, keyof typeof TONES> = { unused: 'info', partial: 'warn', full: 'ok', disabled: 'neutral' };
export const StateBadge = ({ state }: { state: CardState }) => <Badge tone={STATE_TONE[state]} title={STATE_HINT[state]}>{STATE_LABEL[state]}</Badge>;
export function ResultBadge({ result }: { result: string }) {
  const [label, tone] = RESULT[result] || [result, 'fail'];
  return <Badge tone={tone}>{label}</Badge>;
}

// Product identity: a colored monogram tile driven by the product's own hex color (works for any number of products).
// The monogram comes from the stable product ID (e.g. "W"), which stays legible where a Chinese name's first glyph
// would not (「一池锦鲤」 → 「一」 reads as a minus sign).
export const productStyle = (color: string) => ({ '--product': color }) as CSSProperties;
const monogram = (id: string | undefined, name: string) => (id ? id.replace(/[^a-z0-9]/gi, '')[0] : Array.from(name.trim())[0])?.toUpperCase() || '?';
export function ProductAvatar({ id, name, color, size = 'md', className }: { id?: string; name: string; color: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'size-[18px] rounded-[5px] text-[10px]' : size === 'lg' ? 'size-9 rounded-[10px] text-sm' : 'size-[22px] rounded-md text-[11px]';
  return (
    <span aria-hidden style={productStyle(color)}
      className={cn('grid shrink-0 place-items-center bg-product font-semibold text-white shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.2)]', box, className)}>
      {monogram(id, name)}
    </span>
  );
}
export function ProductChip({ product, className, size = 'sm' }: { product?: { id?: string; name: string; color: string }; className?: string; size?: 'sm' | 'md' }) {
  if (!product) return <span className={className}>—</span>;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 font-medium', className)} title={product.id}>
      <ProductAvatar id={product.id} name={product.name} color={product.color} size={size} />
      <span className="truncate">{product.name}</span>
    </span>
  );
}

export function Meter({ used, max }: { used: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-2 tabular whitespace-nowrap" title={`已激活 ${used} 台，上限 ${max} 台`}>
      {max <= 5
        ? <span className="flex gap-[3px]" aria-hidden>{Array.from({ length: max }, (_, i) => <i key={i} className={cn('h-3 w-1.5 rounded-[2px]', i < used ? 'bg-primary' : 'bg-surface-3')} />)}</span>
        : <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3" aria-hidden><i className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, used / max * 100)}%` }} /></span>}
      <span className="text-[13px] text-fg-2">{used}<span className="text-muted">/{max}</span></span>
    </span>
  );
}

export function Empty({ icon, title, description, action, className }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('grid justify-items-center gap-1.5 px-6 py-16 text-center', className)}>
      <div className="mb-2 grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted shadow-xs [&>svg]:size-5">{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton rounded-md', className)} />;
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return <div className="grid gap-3 p-4">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>;
}

export function Pagination({ offset, limit, total, onChange, sizes, onSize }: { offset: number; limit: number; total: number; onChange: (offset: number) => void; sizes?: number[]; onSize?: (n: number) => void }) {
  const page = Math.floor(offset / limit) + 1; const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
      <span className="tabular">{total ? `第 ${offset + 1}–${Math.min(offset + limit, total)} 条，共 ${total} 条` : '共 0 条'}</span>
      <div className="flex items-center gap-1.5">
        {sizes && onSize && (
          <select aria-label="每页条数" value={limit} onChange={e => onSize(Number(e.target.value))} className="hidden h-7 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-fg md:block">
            {sizes.map(n => <option key={n} value={n}>{n} 条/页</option>)}
          </select>
        )}
        <IconButton label="上一页" size="sm" variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}><ChevronLeft /></IconButton>
        <span className="tabular min-w-12 text-center text-fg-2">{page} / {pages}</span>
        <IconButton label="下一页" size="sm" variant="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}><ChevronRight /></IconButton>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = '复制', toastText = '已复制', className }: { text: string | (() => Promise<string> | string); label?: string; toastText?: string; className?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <IconButton label={label} size="sm" className={className} onClick={async e => {
      e.stopPropagation();
      try {
        const value = typeof text === 'function' ? await text() : text;
        if (await copyText(value)) { toast(toastText); setDone(true); setTimeout(() => setDone(false), 1200); } else toast('复制失败，请手动复制', 'error');
      } catch (error) { toast((error as Error).message, 'error'); }
    }}>
      {done ? <Check className="text-ok" /> : <Copy />}
    </IconButton>
  );
}
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    // Clipboard API needs a secure context (HTTPS); fall back to a temporary selection.
    const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly', '');
    area.className = 'fixed -left-[9999px]'; document.body.append(area); area.select();
    const ok = document.execCommand('copy'); area.remove(); return ok;
  }
}
export function downloadFile(name: string, content: BlobPart, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
