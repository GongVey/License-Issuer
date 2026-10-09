import { useLayoutEffect, useRef, useState } from 'react';
import type { TrendDay } from '../lib/types';

// Daily stacked columns: new activations (blue) under failed requests (orange), one axis, per-day hover/tap tooltip
// with a soft column highlight. Series colors are validated for light/dark + CVD; text never uses them.
// The SVG is drawn at its measured width so axis text stays 10.5px on phones as well as desktops.
const LEFT = 32, BOTTOM = 24, TOP = 12;
function niceStep(max: number) {
  const raw = max / 4; const pow = 10 ** Math.floor(Math.log10(raw));
  return Math.max(1, [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw)!);
}
const rounded = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
const dayLabel = (date: string) => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`;

export function TrendChart({ trend }: { trend: TrendDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el); return () => observer.disconnect();
  }, []);
  const H = W < 560 ? 200 : 290;
  const max = Math.max(1, ...trend.map(d => d.activated + d.failed));
  const step = niceStep(max); const yMax = Math.ceil(max / step) * step;
  const plotH = H - BOTTOM - TOP; const band = (W - LEFT) / trend.length; const barW = Math.min(trend.length <= 7 ? 36 : 16, band * 0.62);
  const y = (v: number) => TOP + plotH - (v / yMax) * plotH;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(trend.length / Math.max(2, Math.floor((W - LEFT) / 56))));
  const day = hover === null ? null : trend[hover];
  const total = trend.reduce((s, d) => s + d.activated, 0);
  return (
    <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block overflow-visible" role="img" aria-label={`近 ${trend.length} 天共 ${total} 次新激活`}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={LEFT} x2={W} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} strokeDasharray={v === 0 ? undefined : '3 4'} />
            <text x={LEFT - 8} y={y(v) + 3.5} textAnchor="end" className="fill-muted text-[10.5px]">{v}</text>
          </g>
        ))}
        {trend.map((d, i) => {
          const x = LEFT + i * band + (band - barW) / 2; const base = TOP + plotH;
          const okH = (d.activated / yMax) * plotH; const failH = (d.failed / yMax) * plotH; const gap = okH > 0 && failH > 0 ? 2 : 0;
          return (
            <g key={d.date}>
              {hover === i && <rect x={LEFT + i * band + 1} y={TOP} width={band - 2} height={plotH} rx={6} className="fill-surface-2" />}
              {okH > 0 && (failH > 0 ? <rect x={x} y={base - okH} width={barW} height={okH} className="fill-chart-ok" /> : <path d={rounded(x, base - okH, barW, okH)} className="fill-chart-ok" />)}
              {failH > 0 && <path d={rounded(x, base - okH - gap - failH, barW, failH)} className="fill-chart-fail" />}
              <rect x={LEFT + i * band} y={TOP} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              {((trend.length - 1 - i) % labelEvery === 0) && <text x={LEFT + (i + 0.5) * band} y={H - 6} textAnchor="middle" className="fill-muted text-[10.5px]">{d.date.slice(5).replace('-', '/')}</text>}
            </g>
          );
        })}
      </svg>
      {day && hover !== null && (
        <div className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, ((LEFT + (hover + 0.5) * band) / W) * 100))}%`, top: `calc(${(y(day.activated + day.failed) / H) * 100}% - 10px)` }}>
          <p className="mb-1.5 font-semibold">{dayLabel(day.date)}</p>
          {([['新激活', day.activated, 'bg-chart-ok'], ['失败请求', day.failed, 'bg-chart-fail'], ['重复激活', day.renewed, 'bg-surface-3']] as const).map(([label, value, color]) => (
            <p key={label} className="flex items-center justify-between gap-4 py-px"><span className="inline-flex items-center gap-1.5 text-fg-2"><i className={`size-2 rounded-[2px] ${color}`} />{label}</span><b className="tabular">{value}</b></p>
          ))}
        </div>
      )}
    </div>
  );
}
