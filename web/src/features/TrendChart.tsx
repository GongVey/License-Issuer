import { useState } from 'react';
import type { TrendDay } from '../lib/types';

// Daily stacked columns: new activations (blue) under failed requests (orange), one axis, per-day hover/tap tooltip.
// Palette validated for light/dark + CVD; text never uses series colors.
const W = 640, H = 200, LEFT = 30, BOTTOM = 22, TOP = 10;
function niceStep(max: number) {
  const raw = max / 4; const pow = 10 ** Math.floor(Math.log10(raw));
  return Math.max(1, [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw)!);
}
const rounded = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

export function TrendChart({ trend }: { trend: TrendDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...trend.map(d => d.activated + d.failed));
  const step = niceStep(max); const yMax = Math.ceil(max / step) * step;
  const plotH = H - BOTTOM - TOP; const band = (W - LEFT) / trend.length; const barW = Math.min(14, band - 4);
  const y = (v: number) => TOP + plotH - (v / yMax) * plotH;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const day = hover === null ? null : trend[hover];
  const total = trend.reduce((s, d) => s + d.activated, 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-chart-ok" />新激活</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-chart-fail" />失败请求</span>
      </div>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`近 30 天共 ${total} 次新激活`}>
          {ticks.map(v => (
            <g key={v}>
              <line x1={LEFT} x2={W} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
              <text x={LEFT - 8} y={y(v) + 3.5} textAnchor="end" className="fill-muted text-[10.5px]">{v}</text>
            </g>
          ))}
          {trend.map((d, i) => {
            const x = LEFT + i * band + (band - barW) / 2; const base = TOP + plotH;
            const okH = (d.activated / yMax) * plotH; const failH = (d.failed / yMax) * plotH; const gap = okH > 0 && failH > 0 ? 2 : 0;
            const dim = hover !== null && hover !== i;
            return (
              <g key={d.date} opacity={dim ? 0.4 : 1}>
                {okH > 0 && (failH > 0 ? <rect x={x} y={base - okH} width={barW} height={okH} className="fill-chart-ok" /> : <path d={rounded(x, base - okH, barW, okH)} className="fill-chart-ok" />)}
                {failH > 0 && <path d={rounded(x, base - okH - gap - failH, barW, failH)} className="fill-chart-fail" />}
                <rect x={LEFT + i * band} y={TOP} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
                {(i % 5 === 4 || i === trend.length - 1) && <text x={LEFT + (i + 0.5) * band} y={H - 5} textAnchor="middle" className="fill-muted text-[10.5px]">{d.date.slice(5)}</text>}
              </g>
            );
          })}
        </svg>
        {day && hover !== null && (
          <div className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-lg"
            style={{ left: `${((LEFT + (hover + 0.5) * band) / W) * 100}%`, top: `calc(${(y(day.activated + day.failed) / H) * 100}% - 10px)` }}>
            <p className="mb-1.5 font-semibold">{Number(day.date.slice(5, 7))} 月 {Number(day.date.slice(8))} 日</p>
            {([['新激活', day.activated, 'bg-chart-ok'], ['失败', day.failed, 'bg-chart-fail'], ['重复激活', day.renewed, 'bg-surface-3']] as const).map(([label, value, color]) => (
              <p key={label} className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5 text-fg-2"><i className={`size-2 rounded-[2px] ${color}`} />{label}</span><b className="tabular">{value}</b></p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
