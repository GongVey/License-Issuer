import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, Plus } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { dateTime, relative, shortFingerprint, STATE_LABEL } from '../lib/format';
import { useNow } from '../lib/hooks';
import { href } from '../lib/router';
import type { ActivationLogItem, CardState, Dashboard, Page, ProductStats } from '../lib/types';
import { TrendChart } from '../features/TrendChart';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Button } from '../ui/controls';
import { Empty, Panel, PanelHeader, ProductChip, ResultBadge, Skeleton } from '../ui/display';
import { PageHeader } from './PageHeader';

const SEGMENTS: CardState[] = ['unused', 'partial', 'full', 'disabled'];
const SEGMENT_BG: Record<CardState, string> = { unused: 'bg-st-unused', partial: 'bg-st-partial', full: 'bg-st-full', disabled: 'bg-st-disabled' };

export function OverviewPage() {
  const { session } = useSession();
  const { openGenerate } = useOverlays();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>(`/api/dashboard${qs({ tz: new Date().getTimezoneOffset() })}`), refetchInterval: 60000 });
  const log = useQuery({ queryKey: ['activation-log', { limit: 8 }], queryFn: () => api<Page<ActivationLogItem>>('/api/activation-log?limit=8'), refetchInterval: 60000 });
  const data = dashboard.data;
  const week = data?.trend.slice(-7) ?? [];
  const sum = (key: 'activated' | 'failed') => week.reduce((s, d) => s + d[key], 0);
  const stock = data?.products.reduce((s, p) => s + p.unused, 0) ?? 0;

  return (
    <>
      <PageHeader title="概览" description={`你好，${session.username}。各产品的库存和激活情况一目了然。`}
        actions={<Button variant="primary" className="max-md:hidden" icon={<Plus className="size-4" />} onClick={() => openGenerate()}>生成卡密</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="可售库存" value={data ? stock : null} sub="未激活的可用卡密" to={href('/cards', { state: 'unused' })} accent />
        <Kpi label="全部卡密" value={data?.totals.total ?? null} sub={data ? `${data.totals.disabled} 张已停用` : ''} to={href('/cards')} />
        <Kpi label="已绑定设备" value={data?.totals.activations ?? null} sub="累计激活的电脑" />
        <Kpi label="近 7 天新激活" value={data ? sum('activated') : null} sub={data ? `${sum('failed')} 次失败请求` : ''} to={href('/logs')} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data ? data.products.map(stats => <ProductCard key={stats.productId} stats={stats} />)
          : [0, 1].map(i => <Panel key={i} className="p-5"><Skeleton className="h-36" /></Panel>)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="近 30 天激活" description="每日新设备激活与失败请求（重复激活不计入柱高）" />
          <div className="px-4 pt-4 pb-4 md:px-5">{data ? <TrendChart trend={data.trend} /> : <Skeleton className="h-48" />}</div>
        </Panel>
        <Panel>
          <PanelHeader title="最新激活请求" actions={<a href={href('/logs')} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary">全部<ArrowRight className="size-3.5" /></a>} />
          <div className="px-2 pt-2 pb-2 md:px-3">
            {log.data ? (log.data.items.length ? log.data.items.map(item => <FeedItem key={item.id} item={item} />)
              : <Empty icon={<Activity />} title="还没有激活请求" description="客户在软件里输入卡密后，请求会显示在这里。" />)
              : <div className="grid gap-2 p-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-11" />)}</div>}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, to, accent }: { label: string; value: number | null; sub: string; to?: string; accent?: boolean }) {
  const body = <>
    <span className="text-[13px] text-muted">{label}</span>
    {value === null ? <Skeleton className="my-1.5 h-7 w-16" /> : <strong className={cn('tabular block text-[26px] leading-tight font-semibold tracking-tight md:text-3xl', accent && 'text-primary')}>{value}</strong>}
    <span className="block truncate text-xs text-muted">{sub}</span>
  </>;
  const cls = 'block rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-5';
  return to ? <a href={to} className={cn(cls, 'transition-colors hover:border-line-strong')}>{body}</a> : <div className={cls}>{body}</div>;
}

function ProductCard({ stats }: { stats: ProductStats }) {
  const { product } = useSession();
  const { openGenerate } = useOverlays();
  const p = product(stats.productId);
  return (
    <Panel className="grid gap-4 p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <ProductChip product={p} className="text-[15px]" />
        <span className="text-xs text-muted">共 {stats.total} 张 · {stats.activations} 台设备</span>
      </div>
      <div className="flex items-baseline gap-2"><strong className="tabular text-4xl font-semibold tracking-tight">{stats.unused}</strong><span className="text-muted">张可售库存</span></div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={SEGMENTS.map(s => `${STATE_LABEL[s]} ${stats[s]}`).join('，')}>
        {SEGMENTS.filter(s => stats[s] > 0).map(s => <i key={s} className={cn('h-full min-w-1', SEGMENT_BG[s])} style={{ flexGrow: stats[s] }} title={`${STATE_LABEL[s]} ${stats[s]} 张`} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {SEGMENTS.map(s => (
          <a key={s} href={href('/cards', { productId: stats.productId, state: s })} className="inline-flex items-center gap-1.5 text-fg-2 hover:text-fg">
            <i className={cn('size-2.5 rounded-[3px]', SEGMENT_BG[s])} />{STATE_LABEL[s]}<b className="tabular font-semibold text-fg">{stats[s]}</b>
          </a>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openGenerate({ productId: stats.productId })}>生成</Button>
        <a href={href('/cards', { productId: stats.productId })} className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-medium text-fg-2 hover:bg-surface-2 md:h-8">查看全部</a>
      </div>
    </Panel>
  );
}

function FeedItem({ item }: { item: ActivationLogItem }) {
  const { product } = useSession();
  const { openCard } = useOverlays();
  const now = useNow();
  const title = item.cardExists ? (item.customer || item.note || `卡密 ${item.cardId!.slice(0, 8)}`) : item.cardId ? '已删除的卡密' : '未匹配到卡密';
  const Tag = item.cardExists ? 'button' : 'div';
  return (
    <Tag type={item.cardExists ? 'button' : undefined} onClick={item.cardExists ? () => openCard(item.cardId!) : undefined}
      className={cn('grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2.5 text-left', item.cardExists && 'hover:bg-surface-2')}>
      <ResultBadge result={item.result} />
      <span className="min-w-0"><span className="block truncate">{title}</span>
        <span className="block truncate text-xs text-muted">{item.productId ? product(item.productId).name : '—'} · {shortFingerprint(item.machineFingerprint)}</span></span>
      <time className="text-xs text-muted" title={dateTime(item.at)}>{relative(item.at, now)}</time>
    </Tag>
  );
}
