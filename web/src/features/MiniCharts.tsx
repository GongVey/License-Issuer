import { useId, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

// Tiny trend line for a stat tile: a 2px line over a faint area, no axes. Decorative — the tile states the number.
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId();
  const W = 120, H = 36, max = Math.max(1, ...values);
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W / 2, H - 2 - (v / max) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={cn('block h-9 w-full overflow-visible', className)}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--chart-ok)" stopOpacity="0.22" /><stop offset="1" stopColor="var(--chart-ok)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--chart-ok)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Progress ring for a single ratio (0–1). The caller prints the value next to or inside it.
export function Ring({ value, size = 44, stroke = 5, color = 'var(--primary)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.min(1, Math.max(0, value));
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={stroke} />
        {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} />}
      </svg>
      {children && <span className="relative">{children}</span>}
    </span>
  );
}

export interface DonutSlice { key: string; label: string; value: number; color: string; href?: string }
// Part-to-whole donut with a 2px surface gap between slices. Hovering a slice or its legend row puts that slice in the
// center; the legend always carries label, count and share, so identity never rests on color alone.
export function Donut({ slices, total, unit, centerLabel }: { slices: DonutSlice[]; total: number; unit: string; centerLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  const S = 168, R = 72, T = 18, C = 2 * Math.PI * R;
  const visible = slices.filter(s => s.value > 0);
  const gap = visible.length > 1 ? 2.5 : 0;
  let offset = 0;
  const focus = slices.find(s => s.key === active);
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-1 2xl:grid-cols-[auto_minmax(0,1fr)]">
      <div className="relative mx-auto size-[168px]" onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${S} ${S}`} className="size-full -rotate-90" role="img" aria-label={slices.map(s => `${s.label} ${s.value}`).join('，')}>
          <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="var(--chart-track)" strokeWidth={T} />
          {total > 0 && visible.map(s => {
            const len = (s.value / total) * C;
            const dash = Math.max(0.5, len - gap);
            const el = (
              <circle key={s.key} cx={S / 2} cy={S / 2} r={R} fill="none" stroke={s.color} strokeWidth={active === s.key ? T + 4 : T}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} opacity={active && active !== s.key ? 0.35 : 1}
                className="cursor-pointer transition-[opacity,stroke-width]" onMouseEnter={() => setActive(s.key)} onClick={() => setActive(s.key)} />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <b className="tabular font-display text-[28px] leading-none font-bold">{focus ? focus.value : total}</b>
          <span className="mt-1.5 text-xs text-muted">{focus ? focus.label : centerLabel}</span>
          {focus && total > 0 && <span className="tabular mt-0.5 text-[11px] text-muted">{Math.round((focus.value / total) * 100)}%</span>}
        </div>
      </div>
      <ul className="grid gap-1">
        {slices.map(s => {
          const row = <>
            <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <span className="flex-1 truncate text-fg-2">{s.label}</span>
            <b className="tabular font-semibold">{s.value}<span className="ml-0.5 text-xs font-normal text-muted">{unit}</span></b>
            <span className="tabular w-10 text-right text-xs text-muted">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </>;
          const cls = cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors', active === s.key && 'bg-surface-2');
          return (
            <li key={s.key} onMouseEnter={() => setActive(s.key)} onMouseLeave={() => setActive(null)}>
              {s.href ? <a href={s.href} className={cn(cls, 'hover:bg-surface-2')}>{row}</a> : <div className={cls}>{row}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
