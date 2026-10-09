import type { ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '../lib/cn';

// Chart building blocks on Recharts. Colors come from CSS tokens (var(--chart-*), var(--st-*)), so light/dark and the
// brand accent re-theme the charts without touching this file. Text always uses text tokens, never series colors.

const axisTick = { fill: 'var(--muted)', fontSize: 11 };
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
const longDate = (date: string) => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`;

export function ChartTooltipBox({ title, rows }: { title: ReactNode; rows: Array<{ label: ReactNode; value: ReactNode; swatch: ReactNode }> }) {
  return (
    <div className="min-w-44 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-fg">{title}</p>
      {rows.map((row, i) => (
        <p key={i} className="flex items-center justify-between gap-5 py-0.5">
          <span className="inline-flex items-center gap-2 text-fg-2">{row.swatch}{row.label}</span>
          <b className="tabular font-semibold text-fg">{row.value}</b>
        </p>
      ))}
    </div>
  );
}
const lineSwatch = (dashed?: boolean) => <i className={cn('w-3 border-t-2', dashed ? 'border-dashed border-chart-compare' : 'border-chart-primary')} />;

export interface ComparePoint { date: string; prevDate: string; current: number | null; previous: number | null }
// Current period as a brand-colored area, the previous period as a dashed line on the same axis (one unit, one axis).
export function CompareAreaChart({ data, format, height = 260 }: { data: ComparePoint[]; format: (v: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="compare-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="date" tickFormatter={md} tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={28} interval="preserveStartEnd" tickMargin={8} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} allowDecimals={false} tickFormatter={v => format(Number(v))} />
        <Tooltip cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }} isAnimationActive={false}
          content={({ active, payload }) => {
            const point = active && payload?.[0]?.payload as ComparePoint | undefined;
            if (!point) return null;
            const show = (v: number | null) => (v === null ? '—' : format(v));
            return <ChartTooltipBox title={longDate(point.date)} rows={[
              { label: '本期', value: show(point.current), swatch: lineSwatch() },
              { label: `上期 · ${md(point.prevDate)}`, value: show(point.previous), swatch: lineSwatch(true) },
            ]} />;
          }} />
        <Line dataKey="previous" type="monotone" stroke="var(--chart-compare)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
        <Area dataKey="current" type="monotone" stroke="var(--chart-primary)" strokeWidth={2} fill="url(#compare-fill)" connectNulls
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: 'var(--chart-primary)' }} animationDuration={500} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface Slice { key: string; label: string; value: number; color: string }
// Part-to-whole donut; slices are separated by a 2px surface stroke. The center shows the headline number.
export function DonutChart({ slices, unit, center, size = 168 }: { slices: Slice[]; unit: string; center: ReactNode; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const data = total ? slices.filter(s => s.value > 0) : [{ key: 'empty', label: '', value: 1, color: 'var(--chart-track)' }];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270}
            stroke="var(--surface)" strokeWidth={2} animationDuration={500} isAnimationActive={total > 0}>
            {data.map(s => <Cell key={s.key} fill={s.color} />)}
          </Pie>
          {total > 0 && <Tooltip isAnimationActive={false} content={({ active, payload }) => {
            const s = active && payload?.[0]?.payload as Slice | undefined;
            return s ? <ChartTooltipBox title={s.label} rows={[{ label: '数量', value: `${s.value} ${unit} · ${Math.round(s.value / total * 100)}%`, swatch: <i className="size-2 rounded-[2px]" style={{ background: s.color }} /> }]} /> : null;
          }} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">{center}</div>
    </div>
  );
}

// Ranked horizontal bars with the label inside the bar track (Tremor-style bar list): readable without a legend.
export function BarList({ items, format = String }: { items: Array<{ key: string; label: ReactNode; value: number; color: string }>; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map(i => i.value));
  return (
    <ul className="grid gap-1.5">
      {items.map(item => (
        <li key={item.key} className="flex items-center gap-4">
          <span className="relative flex h-8 min-w-0 flex-1 items-center overflow-hidden rounded-md">
            <i className="absolute inset-y-0 left-0 rounded-md opacity-[0.16]" style={{ width: `${Math.max(2, item.value / max * 100)}%`, background: item.color }} />
            <i className="absolute inset-y-1.5 left-0 w-[3px] rounded-full" style={{ background: item.color }} />
            <span className="relative truncate pl-3 text-[13px] text-fg">{item.label}</span>
          </span>
          <b className="tabular w-16 shrink-0 text-right text-[13px] font-semibold">{format(item.value)}</b>
        </li>
      ))}
    </ul>
  );
}
