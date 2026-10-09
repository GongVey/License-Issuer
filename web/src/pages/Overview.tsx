import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CheckCircle2, MonitorSmartphone, PackageOpen, Plus, TrendingUp } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { dateTime, relative, RESULT, shortFingerprint, STATE_LABEL } from '../lib/format';
import { useNow } from '../lib/hooks';
import { href } from '../lib/router';
import type { ActivationLogItem, CardState, Dashboard, Page, ProductStats } from '../lib/types';
import { Donut, Ring, Sparkline } from '../features/MiniCharts';
import { TrendChart } from '../features/TrendChart';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Button, Segmented } from '../ui/controls';
import { Empty, Panel, ProductAvatar, Skeleton } from '../ui/display';
import { PageHeader } from './PageHeader';

const SEGMENTS: CardState[] = ['unused', 'partial', 'full', 'disabled'];
const SEGMENT_COLOR: Record<CardState, string> = { unused: 'var(--st-unused)', partial: 'var(--st-partial)', full: 'var(--st-full)', disabled: 'var(--st-disabled)' };
const RANGES = [{ value: '7', label: '7 天' }, { value: '14', label: '14 天' }, { value: '30', label: '30 天' }] as const;
type Range = (typeof RANGES)[number]['value'];

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function ChartPanel({ title, description, aside, children, className }: { title: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Panel className={cn('flex min-w-0 flex-col p-4 md:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold">{title}</h2>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>
        {aside}
      </div>
      {children}
    </Panel>
  );
}

export function OverviewPage() {
  const { session } = useSession();
  const { openGenerate } = useOverlays();
  const [range, setRange] = useState<Range>('30');
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>(`/api/dashboard${qs({ tz: new Date().getTimezoneOffset() })}`), refetchInterval: 60000 });
  const log = useQuery({ queryKey: ['activation-log', { limit: 8 }], queryFn: () => api<Page<ActivationLogItem>>('/api/activation-log?limit=8'), refetchInterval: 60000 });
  const data = dashboard.data;
  const trend = data?.trend ?? [];
  const sumDays = (days: typeof trend, key: 'activated' | 'failed' | 'renewed') => days.reduce((s, d) => s + d[key], 0);
  const week = sumDays(trend.slice(-7), 'activated'), prevWeek = sumDays(trend.slice(-14, -7), 'activated');
  const shown = trend.slice(-Number(range));
  const shownActivated = sumDays(shown, 'activated');
  const peak = shown.reduce<(typeof trend)[number] | null>((best, d) => (d.activated > (best?.activated ?? 0) ? d : best), null);

  const states = Object.fromEntries(SEGMENTS.map(s => [s, data?.products.reduce((sum, p) => sum + p[s], 0) ?? 0])) as Record<CardState, number>;
  const capacity = data?.products.reduce((s, p) => s + (p.capacity ?? 0), 0) ?? 0;
  const outcomes = data?.outcomes ?? {};
  const requests = Object.values(outcomes).reduce((s, n) => s + n, 0);
  const succeeded = (outcomes.activated ?? 0) + (outcomes.renewed ?? 0);
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <>
      <PageHeader eyebrow={today} title={`${greeting()}，${session.username}`}
        description={data ? `共有 ${states.unused} 张可售卡密，近 7 天新增 ${week} 台设备激活。` : '正在汇总各产品的库存与激活情况…'}
        actions={<Button variant="primary" className="max-md:hidden" icon={<Plus />} onClick={() => openGenerate()}>生成卡密</Button>} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Kpi icon={<PackageOpen />} label="可售库存" to={href('/cards', { state: 'unused' })} value={data ? states.unused : null}
          sub={data && `占有效卡密 ${pct(states.unused, data.totals.active)}% · 共 ${data.totals.total} 张`}
          visual={data && <StateBar stats={states} />} />
        <Kpi icon={<TrendingUp />} label="近 7 天新激活" to={href('/logs')} value={data ? week : null}
          sub={data && <Delta current={week} previous={prevWeek} />} visual={data && <Sparkline values={trend.slice(-14).map(d => d.activated)} />} />
        <Kpi icon={<CheckCircle2 />} label="激活成功率 · 30 天" value={data ? (requests ? pct(succeeded, requests) : null) : null} suffix="%" empty={data && !requests ? '暂无请求' : undefined}
          sub={data && `${requests} 次请求 · ${requests - succeeded} 次失败`}
          visual={data && <Progress value={requests ? succeeded / requests : 0} color="var(--st-full)" />} />
        <Kpi icon={<MonitorSmartphone />} label="已绑定设备" value={data?.totals.activations ?? null}
          sub={data && `名额占用 ${pct(data.totals.activations, capacity)}% · 共 ${capacity} 个`}
          visual={data && <Progress value={capacity ? data.totals.activations / capacity : 0} color="var(--chart-ok)" />} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:mt-4 md:gap-4 lg:grid-cols-3">
        <ChartPanel className="lg:col-span-2" title="激活趋势" description={data ? `近 ${range} 天新激活 ${shownActivated} 台 · 日均 ${(shownActivated / Number(range)).toFixed(1)}${peak ? ` · 峰值 ${peak.activated}（${peak.date.slice(5).replace('-', '/')}）` : ''}` : '重复激活不计入柱高'}
          aside={<Segmented label="时间范围" value={range} onChange={setRange} options={[...RANGES]} />}>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-chart-ok" />新激活</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-chart-fail" />失败请求</span>
          </div>
          {data ? <TrendChart key={range} trend={shown} /> : <Skeleton className="h-56" />}
        </ChartPanel>
        <ChartPanel title="库存构成" description="全部卡密按状态分布">
          {data ? <Donut total={data.totals.total} unit="张" centerLabel="全部卡密"
            slices={SEGMENTS.map(s => ({ key: s, label: STATE_LABEL[s], value: states[s], color: SEGMENT_COLOR[s], href: href('/cards', { state: s }) }))} />
            : <Skeleton className="mx-auto size-40 rounded-full" />}
        </ChartPanel>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:mt-4 md:gap-4 lg:grid-cols-3">
        <ChartPanel className="lg:col-span-2 lg:self-start" title="产品" description={data ? `${data.products.length} 个产品 · 点击产品查看卡密` : undefined}
          aside={<span className="flex items-center gap-3 text-[11px] text-muted max-sm:hidden">{SEGMENTS.map(s => <span key={s} className="inline-flex items-center gap-1"><i className="size-2 rounded-[2px]" style={{ background: SEGMENT_COLOR[s] }} />{STATE_LABEL[s]}</span>)}</span>}>
          {data ? (data.products.length ? <div className="-mx-4 divide-y divide-line border-t border-line md:-mx-5">{data.products.map(stats => <ProductRow key={stats.productId} stats={stats} />)}</div>
            : <Empty icon={<Boxes />} title="还没有产品" description="在设置中添加产品后即可生成卡密。" />)
            : <div className="grid gap-3">{[0, 1].map(i => <Skeleton key={i} className="h-16" />)}</div>}
        </ChartPanel>
        <div className="grid content-start gap-3 md:gap-4">
          <ChartPanel title="请求结果" description="近 30 天客户端激活请求">
            {data ? <Outcomes outcomes={outcomes} total={requests} /> : <Skeleton className="h-28" />}
          </ChartPanel>
          <ChartPanel title="最新动态" aside={<a href={href('/logs')} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">全部<ArrowRight className="size-3.5" /></a>}>
            {log.data ? (log.data.items.length ? <ol>{log.data.items.slice(0, 6).map((item, i, list) => <TimelineItem key={item.id} item={item} last={i === list.length - 1} />)}</ol>
              : <Empty className="py-8" icon={<Activity />} title="还没有激活请求" description="客户在软件里输入卡密后，请求会显示在这里。" />)
              : <div className="grid gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>}
          </ChartPanel>
        </div>
      </div>
    </>
  );
}

function Kpi({ icon, label, value, suffix, empty, sub, visual, to }: {
  icon: ReactNode; label: string; value: number | null; suffix?: string; empty?: string; sub?: ReactNode; visual?: ReactNode; to?: string;
}) {
  const loading = value === null && !empty;
  const body = <>
    <span className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-medium text-fg-2">{label}</span>
      <span className="grid size-8 shrink-0 max-sm:hidden place-items-center rounded-lg bg-primary-soft text-primary [&>svg]:size-4">{icon}</span>
    </span>
    {loading ? <Skeleton className="mt-3 h-9 w-24" /> : (
      <strong className="tabular mt-2 block font-display text-[26px] leading-tight font-bold md:text-[32px]">
        {value === null ? <span className="text-xl font-semibold text-muted">{empty}</span> : <>{value}{suffix && <span className="ml-0.5 text-lg font-semibold text-muted">{suffix}</span>}</>}
      </strong>
    )}
    <span className="mt-1 block min-h-4 text-xs text-muted max-sm:text-[11px]">{sub}</span>
    <span className="mt-3 block md:mt-4">{visual ?? <Skeleton className="h-2" />}</span>
  </>;
  const cls = 'group relative block min-w-0 rounded-xl border border-line bg-surface p-3.5 shadow-xs md:p-5';
  return to ? (
    <a href={to} className={cn(cls, 'transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm')}>
      {body}
    </a>
  ) : <div className={cls}>{body}</div>;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <>上一周期 {previous} 台</>;
  const change = Math.round(((current - previous) / previous) * 100);
  const up = change >= 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex items-center gap-0.5 font-semibold', up ? 'text-ok' : 'text-danger')}>{up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{Math.abs(change)}%</span>
      较上周 {previous} 台
    </span>
  );
}

function Progress({ value, color }: { value: number; color: string }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-chart-track" aria-hidden>
      <i className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
    </span>
  );
}

// Stacked state bar with a 2px gap between segments.
function StateBar({ stats, className }: { stats: Record<CardState, number>; className?: string }) {
  const total = SEGMENTS.reduce((s, k) => s + stats[k], 0);
  return (
    <span className={cn('flex h-2 gap-[2px] overflow-hidden rounded-full bg-chart-track', className)} role="img" aria-label={SEGMENTS.map(s => `${STATE_LABEL[s]} ${stats[s]}`).join('，')}>
      {total > 0 && SEGMENTS.filter(s => stats[s] > 0).map(s => <i key={s} className="h-full min-w-1" style={{ flexGrow: stats[s], background: SEGMENT_COLOR[s] }} title={`${STATE_LABEL[s]} ${stats[s]} 张`} />)}
    </span>
  );
}

function ProductRow({ stats }: { stats: ProductStats }) {
  const { product } = useSession();
  const { openGenerate } = useOverlays();
  const p = product(stats.productId);
  const usage = stats.capacity ? stats.activations / stats.capacity : 0;
  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-surface-2/50 md:px-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_auto_auto] xl:gap-x-6">
      <a href={href('/cards', { productId: p.id })} className="flex min-w-0 items-center gap-3">
        <ProductAvatar id={p.id} name={p.name} color={p.color} size="lg" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold group-hover:text-primary">{p.name}</span>
          <span className="block truncate text-xs text-muted">{stats.total} 张 · {stats.activations} 台设备</span>
        </span>
      </a>
      <div className="col-span-2 row-start-2 xl:col-span-1 xl:row-start-auto">
        <StateBar stats={stats} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {SEGMENTS.map(s => (
            <a key={s} href={href('/cards', { productId: stats.productId, state: s })} className="inline-flex items-center gap-1 text-muted hover:text-fg">
              {STATE_LABEL[s]}<b className="tabular font-semibold text-fg">{stats[s]}</b>
            </a>
          ))}
        </div>
      </div>
      <div className="hidden items-center gap-2.5 xl:flex" title={`设备名额占用 ${stats.activations}/${stats.capacity}`}>
        <Ring value={usage} size={38} stroke={4} color="var(--chart-ok)" />
        <span className="leading-tight"><b className="tabular block text-sm font-semibold">{pct(stats.activations, stats.capacity)}%</b><span className="text-[11px] text-muted">名额占用</span></span>
      </div>
      <div className="col-start-2 row-start-1 flex items-center gap-3 xl:col-start-auto xl:row-start-auto">
        <span className="text-right leading-tight"><b className="tabular block text-lg font-bold">{stats.unused}</b><span className="text-[11px] text-muted">可售</span></span>
        <Button size="sm" variant="soft" icon={<Plus />} onClick={() => openGenerate({ productId: stats.productId })}>生成</Button>
      </div>
    </div>
  );
}

// Request outcomes as labeled horizontal bars: successes in the activation blue, failures in the failure orange.
function Outcomes({ outcomes, total }: { outcomes: Record<string, number>; total: number }) {
  if (!total) return <p className="py-6 text-center text-[13px] text-muted">近 30 天没有激活请求</p>;
  const rows = Object.entries(outcomes).sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] || 1;
  return (
    <ul className="grid gap-3">
      {rows.map(([result, count]) => {
        const [label, tone] = RESULT[result] || [result, 'fail'];
        const color = tone === 'ok' ? 'var(--chart-ok)' : tone === 'neutral' ? 'var(--st-disabled)' : 'var(--chart-fail)';
        return (
          <li key={result}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-fg-2">{label}</span>
              <span><b className="tabular font-semibold">{count}</b><span className="tabular ml-1.5 text-xs text-muted">{pct(count, total)}%</span></span>
            </div>
            <span className="block h-1.5 overflow-hidden rounded-full bg-chart-track"><i className="block h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: color }} /></span>
          </li>
        );
      })}
    </ul>
  );
}

const DOT: Record<string, string> = { ok: 'bg-ok', neutral: 'bg-st-disabled', fail: 'bg-danger' };
function TimelineItem({ item, last }: { item: ActivationLogItem; last: boolean }) {
  const { product } = useSession();
  const { openCard } = useOverlays();
  const now = useNow();
  const [label, tone] = RESULT[item.result] || [item.result, 'fail'];
  const p = item.productId ? product(item.productId) : null;
  const title = item.cardExists ? (item.customer || item.note || `卡密 ${item.cardId!.slice(0, 8)}`) : item.cardId ? '已删除的卡密' : '未匹配到卡密';
  return (
    <li className={cn('relative pl-5', !last && 'pb-4')}>
      {!last && <span className="absolute top-3 bottom-0 left-[3.5px] w-px bg-line" aria-hidden />}
      <span className={cn('absolute top-[6px] left-0 size-2 rounded-full ring-4 ring-surface', DOT[tone])} aria-hidden />
      <button type="button" disabled={!item.cardExists} onClick={() => openCard(item.cardId!)} className="block w-full text-left enabled:hover:[&_.t]:underline disabled:cursor-default">
        <span className="flex items-baseline justify-between gap-3">
          <span className="t truncate text-[13px] font-medium decoration-line-strong underline-offset-4">{title}</span>
          <time className="shrink-0 text-[11px] text-muted" title={dateTime(item.at)}>{relative(item.at, now)}</time>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          <span className={cn(tone === 'fail' && 'text-danger', tone === 'ok' && 'text-ok')}>{label}</span>
          {p && <> · {p.name}</>} · <span className="font-mono text-[11px]">{shortFingerprint(item.machineFingerprint)}</span>
        </span>
      </button>
    </li>
  );
}
