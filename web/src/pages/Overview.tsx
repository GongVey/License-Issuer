import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, Minus, Plus } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { dateTime, relative, RESULT, STATE_LABEL } from '../lib/format';
import { useNow } from '../lib/hooks';
import { href } from '../lib/router';
import type { ActivationLogItem, CardState, Dashboard, Page, ProductStats, TrendDay } from '../lib/types';
import { BarList, CompareAreaChart, DonutChart } from '../features/Charts';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Button, Segmented } from '../ui/controls';
import { Empty, Panel, ProductAvatar, Skeleton } from '../ui/display';
import { PageHeader } from './PageHeader';

const STATES: CardState[] = ['unused', 'partial', 'full', 'disabled'];
const STATE_COLOR: Record<CardState, string> = { unused: 'var(--st-unused)', partial: 'var(--st-partial)', full: 'var(--st-full)', disabled: 'var(--st-disabled)' };
const RANGES = [{ value: '7', label: '7 天' }, { value: '30', label: '30 天' }, { value: '90', label: '90 天' }] as const;
type Range = (typeof RANGES)[number]['value'];

// The four headline metrics. Each one is a tab that drives the comparison chart below it.
const requests = (d: TrendDay) => d.activated + d.renewed + d.failed;
const sum = (days: TrendDay[], pick: (d: TrendDay) => number) => days.reduce((s, d) => s + pick(d), 0);
const rate = (days: TrendDay[]) => { const n = sum(days, requests); return n ? (sum(days, d => d.activated + d.renewed) / n) * 100 : null; };
type MetricKey = 'activated' | 'issued' | 'rate' | 'failed';
const METRICS: Array<{ key: MetricKey; label: string; unit: string; lowerIsBetter?: boolean; percent?: boolean; daily: (d: TrendDay) => number | null; total: (days: TrendDay[]) => number | null }> = [
  { key: 'activated', label: '新激活设备', unit: '台', daily: d => d.activated, total: days => sum(days, d => d.activated) },
  { key: 'issued', label: '新发卡密', unit: '张', daily: d => d.issued, total: days => sum(days, d => d.issued) },
  { key: 'rate', label: '激活成功率', unit: '%', percent: true, daily: d => rate([d]), total: rate },
  { key: 'failed', label: '失败请求', unit: '次', lowerIsBetter: true, daily: d => d.failed, total: days => sum(days, d => d.failed) },
];
const fmt = (v: number, percent?: boolean) => (percent ? `${v.toFixed(v >= 99.95 || v === 0 ? 0 : 1)}%` : v.toLocaleString('zh-CN'));
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}

function Card({ title, description, aside, children, className, bodyClassName }: { title: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <Panel className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5">
        <div className="min-w-0"><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>
        {aside}
      </div>
      <div className={cn('flex-1 p-4 md:p-5', bodyClassName)}>{children}</div>
    </Panel>
  );
}

export function OverviewPage() {
  const { session, settings } = useSession();
  const { openGenerate } = useOverlays();
  const [range, setRange] = useState<Range>('30');
  const days = Number(range);
  const dashboard = useQuery({
    queryKey: ['dashboard', days], placeholderData: keepPreviousData, refetchInterval: 60000,
    queryFn: () => api<Dashboard>(`/api/dashboard${qs({ tz: new Date().getTimezoneOffset(), days })}`),
  });
  const data = dashboard.data;
  const states = Object.fromEntries(STATES.map(s => [s, data?.products.reduce((n, p) => n + p[s], 0) ?? 0])) as Record<CardState, number>;

  return (
    <>
      <PageHeader eyebrow={new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        title={`${greeting()}，${session.username}`}
        description={data ? <>{settings.branding.name} 当前有 <b className="font-semibold text-fg">{states.unused}</b> 张可售卡密，累计绑定 <b className="font-semibold text-fg">{data.totals.activations}</b> 台设备。</> : '正在汇总授权数据…'}
        actions={<>
          <Segmented label="时间范围" value={range} onChange={setRange} options={[...RANGES]} />
          <Button variant="primary" className="max-md:hidden" icon={<Plus />} onClick={() => openGenerate()}>生成卡密</Button>
        </>} />

      <div className="grid gap-4">
        <Analytics data={data} days={days} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2" title="卡密库存" description="全部卡密的当前状态" aside={<a href={href('/cards')} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">查看<ArrowRight className="size-3.5" /></a>}>
            {data ? <Inventory states={states} total={data.totals.total} /> : <Skeleton className="mx-auto size-40 rounded-full" />}
          </Card>
          <Card className="lg:col-span-3" title="产品表现" description="各产品的库存、销售与设备名额" bodyClassName="p-0 md:p-0">
            {data ? (data.products.length ? <ProductTable products={data.products} /> : <Empty icon={<Boxes />} title="还没有产品" description="在设置中添加产品后即可生成卡密。" />)
              : <div className="grid gap-3 p-5">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="请求结果" description={`近 ${days} 天客户端激活请求的结果分布`}>
            {data ? <Outcomes outcomes={data.outcomes} /> : <Skeleton className="h-40" />}
          </Card>
          <RecentActivity />
        </div>
      </div>
    </>
  );
}

function Analytics({ data, days }: { data?: Dashboard; days: number }) {
  const [metric, setMetric] = useState<MetricKey>('activated');
  const active = METRICS.find(m => m.key === metric)!;
  const points = data ? data.trend.map((d, i) => ({ date: d.date, prevDate: data.previousTrend[i]?.date ?? '', current: active.daily(d), previous: data.previousTrend[i] ? active.daily(data.previousTrend[i]) : null })) : [];
  return (
    <Panel className="overflow-hidden">
      <div role="tablist" aria-label="指标" className="grid grid-cols-2 border-b border-line md:grid-cols-4">
        {METRICS.map((m, i) => {
          const current = data ? m.total(data.trend) : null, previous = data ? m.total(data.previousTrend) : null;
          const selected = m.key === metric;
          return (
            <button key={m.key} role="tab" type="button" aria-selected={selected} onClick={() => setMetric(m.key)}
              className={cn('relative border-line px-4 pt-4 pb-4 text-left transition-colors md:px-5 md:pt-5', i % 2 === 1 && 'border-l', i >= 2 && 'max-md:border-t md:border-l',
                selected ? 'bg-surface' : 'bg-surface-2/50 hover:bg-surface-2')}>
              {selected && <span className="absolute inset-x-0 top-0 h-[2px] bg-primary" aria-hidden />}
              <span className={cn('text-[13px] font-medium', selected ? 'text-fg' : 'text-muted')}>{m.label}</span>
              {data ? <>
                <span className="tabular mt-1.5 block font-display text-[26px] leading-tight font-semibold md:text-[28px]">
                  {current === null ? <span className="text-muted">—</span> : fmt(current, m.percent)}
                  {!m.percent && current !== null && <span className="ml-1 text-sm font-normal text-muted">{m.unit}</span>}
                </span>
                <Delta current={current} previous={previous} percent={m.percent} lowerIsBetter={m.lowerIsBetter} />
              </> : <><Skeleton className="mt-2 h-8 w-20" /><Skeleton className="mt-2 h-4 w-24" /></>}
            </button>
          );
        })}
      </div>
      <div className="px-2 pt-4 pb-3 md:px-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-muted">
          <span>{active.label} · 按日{active.percent ? '（无请求的日期不计）' : ''}</span>
          <span className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><i className="w-3 border-t-2 border-chart-primary" />近 {days} 天</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-3 border-t-2 border-dashed border-chart-compare" />上一周期</span>
          </span>
        </div>
        {data ? <CompareAreaChart key={metric + days} data={points} format={v => fmt(v, active.percent)} /> : <Skeleton className="mx-2 h-[260px]" />}
      </div>
    </Panel>
  );
}

function Delta({ current, previous, percent, lowerIsBetter }: { current: number | null; previous: number | null; percent?: boolean; lowerIsBetter?: boolean }) {
  if (current === null || previous === null || (!percent && previous === 0)) {
    return <span className="mt-1.5 block text-xs text-muted">上一周期{previous === null ? '无数据' : ` ${fmt(previous, percent)}`}</span>;
  }
  const change = percent ? current - previous : ((current - previous) / previous) * 100;
  const flat = Math.abs(change) < 0.05;
  const good = flat ? null : (change > 0) !== Boolean(lowerIsBetter);
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
      <span className={cn('tabular inline-flex h-5 items-center gap-0.5 rounded px-1 font-medium', good === null ? 'bg-neutral-soft text-fg-2' : good ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}>
        <Icon className="size-3" />{Math.abs(change).toFixed(percent || Math.abs(change) < 10 ? 1 : 0)}{percent ? ' pt' : '%'}
      </span>
      较上一周期
    </span>
  );
}

function Inventory({ states, total }: { states: Record<CardState, number>; total: number }) {
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col xl:flex-row">
      <DonutChart unit="张" slices={STATES.map(s => ({ key: s, label: STATE_LABEL[s], value: states[s], color: STATE_COLOR[s] }))}
        center={<><b className="tabular font-display text-[28px] leading-none font-semibold">{states.unused}</b><span className="mt-1.5 text-xs text-muted">张可售</span></>} />
      <ul className="grid w-full min-w-0 flex-1 gap-0.5">
        {STATES.map(s => (
          <li key={s}>
            <a href={href('/cards', { state: s })} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-surface-2">
              <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: STATE_COLOR[s] }} />
              <span className="flex-1 truncate text-fg-2">{STATE_LABEL[s]}</span>
              <b className="tabular font-semibold">{states[s]}</b>
              <span className="tabular w-9 text-right text-xs text-muted">{pct(states[s], total)}%</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductTable({ products }: { products: ProductStats[] }) {
  const { product } = useSession();
  const { openGenerate } = useOverlays();
  const head = 'px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5';
  const cell = 'px-3 py-3 first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5';
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-t sm:min-w-[560px] border-line text-[13px]">
        <thead className="bg-surface-2/60"><tr>
          <th className={head}>产品</th><th className={cn(head, 'max-sm:hidden')}>状态分布</th><th className={cn(head, 'text-right')}>可售</th>
          <th className={cn(head, 'text-right max-sm:hidden')}>已售</th><th className={head}>设备名额</th><th className={head}><span className="sr-only">操作</span></th>
        </tr></thead>
        <tbody className="divide-y divide-line border-t border-line">
          {products.map(stats => {
            const p = product(stats.productId);
            const sold = stats.total - stats.unused - stats.disabled;
            const usage = pct(stats.activations, stats.capacity);
            return (
              <tr key={stats.productId} className="group transition-colors hover:bg-surface-2/50">
                <td className={cell}>
                  <a href={href('/cards', { productId: p.id })} className="flex items-center gap-2.5">
                    <ProductAvatar id={p.id} name={p.name} color={p.color} />
                    <span className="min-w-0"><span className="block truncate font-medium group-hover:underline group-hover:underline-offset-4">{p.name}</span><span className="block text-xs text-muted">共 {stats.total} 张</span></span>
                  </a>
                </td>
                <td className={cn(cell, 'w-[28%] max-sm:hidden')}>
                  <span className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-chart-track" role="img" aria-label={STATES.map(s => `${STATE_LABEL[s]} ${stats[s]}`).join('，')}>
                    {STATES.filter(s => stats[s] > 0).map(s => <i key={s} className="h-full" style={{ flexGrow: stats[s], background: STATE_COLOR[s] }} title={`${STATE_LABEL[s]} ${stats[s]} 张`} />)}
                  </span>
                </td>
                <td className={cn(cell, 'tabular text-right font-semibold')}>{stats.unused}</td>
                <td className={cn(cell, 'tabular text-right text-fg-2 max-sm:hidden')}>{sold}</td>
                <td className={cn(cell, 'w-[22%] max-sm:w-[30%]')}>
                  <span className="flex items-center gap-2.5" title={`已用 ${stats.activations} / 共 ${stats.capacity} 个名额`}>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-chart-track max-sm:hidden"><i className="block h-full rounded-full bg-chart-primary" style={{ width: `${Math.min(100, usage)}%` }} /></span>
                    <span className="tabular w-16 text-xs text-fg-2 sm:text-right">{stats.activations}<span className="text-muted">/{stats.capacity}</span></span>
                  </span>
                </td>
                <td className={cn(cell, 'w-px text-right')}>
                  <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => openGenerate({ productId: stats.productId })}>生成</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Outcomes({ outcomes }: { outcomes: Record<string, number> }) {
  const total = Object.values(outcomes).reduce((s, n) => s + n, 0);
  if (!total) return <Empty className="py-8" icon={<Activity />} title="这段时间没有激活请求" />;
  const ok = (outcomes.activated ?? 0) + (outcomes.renewed ?? 0);
  const items = Object.entries(outcomes).sort((a, b) => b[1] - a[1]).map(([result, value]) => {
    const [label, tone] = RESULT[result] || [result, 'fail'];
    return { key: result, value, label: <>{label}<span className="ml-2 text-xs text-muted">{pct(value, total)}%</span></>, color: tone === 'ok' ? 'var(--chart-primary)' : tone === 'neutral' ? 'var(--st-full)' : 'var(--chart-fail)' };
  });
  return (
    <>
      <div className="mb-4 flex items-baseline gap-2">
        <b className="tabular font-display text-[28px] leading-none font-semibold">{fmt((ok / total) * 100, true)}</b>
        <span className="text-xs text-muted">成功 · 共 {total.toLocaleString('zh-CN')} 次请求</span>
      </div>
      <BarList items={items} />
    </>
  );
}

const DOT: Record<string, string> = { ok: 'bg-ok', neutral: 'bg-st-full', fail: 'bg-danger' };
function RecentActivity() {
  const { product } = useSession();
  const { openCard } = useOverlays();
  const now = useNow();
  const log = useQuery({ queryKey: ['activation-log', { limit: 6 }], queryFn: () => api<Page<ActivationLogItem>>('/api/activation-log?limit=6'), refetchInterval: 60000 });
  return (
    <Card title="最近激活" description="客户端的最新激活请求" bodyClassName="px-0 pb-2 pt-1 md:px-0 md:pb-2 md:pt-1"
      aside={<a href={href('/logs')} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">全部日志<ArrowRight className="size-3.5" /></a>}>
      {log.data ? (log.data.items.length ? (
        <ul>
          {log.data.items.map(item => {
            const [label, tone] = RESULT[item.result] || [item.result, 'fail'];
            const p = item.productId ? product(item.productId) : null;
            const title = item.cardExists ? (item.customer || item.note || `卡密 ${item.cardId!.slice(0, 8)}`) : item.cardId ? '已删除的卡密' : '未匹配到卡密';
            return (
              <li key={item.id}>
                <button type="button" disabled={!item.cardExists} onClick={() => openCard(item.cardId!)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors enabled:hover:bg-surface-2/60 disabled:cursor-default md:px-5">
                  <span className={cn('size-1.5 shrink-0 rounded-full', DOT[tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{title}</span>
                    <span className="block truncate text-xs text-muted"><span className={cn(tone === 'fail' && 'text-danger')}>{label}</span>{p && <> · {p.name}</>}</span>
                  </span>
                  <time className="shrink-0 text-xs text-muted" title={dateTime(item.at)}>{relative(item.at, now)}</time>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <Empty className="py-8" icon={<Activity />} title="还没有激活请求" description="客户在软件里输入卡密后，请求会显示在这里。" />)
        : <div className="grid gap-3 px-5 py-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}</div>}
    </Card>
  );
}
