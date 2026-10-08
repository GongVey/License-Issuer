import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, ArrowUpRight, Boxes, CreditCard, MonitorSmartphone, Plus, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { Empty, Panel, PanelHeader, ProductAvatar, ResultBadge, Skeleton } from '../ui/display';
import { PageHeader } from './PageHeader';

const SEGMENTS: CardState[] = ['unused', 'partial', 'full', 'disabled'];
const SEGMENT_BG: Record<CardState, string> = { unused: 'bg-st-unused', partial: 'bg-st-partial', full: 'bg-st-full', disabled: 'bg-st-disabled' };

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
}

export function OverviewPage() {
  const { session } = useSession();
  const { openGenerate } = useOverlays();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>(`/api/dashboard${qs({ tz: new Date().getTimezoneOffset() })}`), refetchInterval: 60000 });
  const log = useQuery({ queryKey: ['activation-log', { limit: 8 }], queryFn: () => api<Page<ActivationLogItem>>('/api/activation-log?limit=8'), refetchInterval: 60000 });
  const data = dashboard.data;
  const week = data?.trend.slice(-7) ?? [];
  const sum = (key: 'activated' | 'failed') => week.reduce((s, d) => s + d[key], 0);
  const stock = data?.products.reduce((s, p) => s + p.unused, 0) ?? 0;
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <>
      <PageHeader eyebrow={today} title={`${greeting()}，${session.username}`} description="这里是各产品的库存与激活情况。"
        actions={<Button variant="primary" className="max-md:hidden" icon={<Plus />} onClick={() => openGenerate()}>生成卡密</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Boxes />} label="可售库存" value={data ? stock : null} sub="未激活的可用卡密" to={href('/cards', { state: 'unused' })} />
        <Stat icon={<CreditCard />} label="全部卡密" value={data?.totals.total ?? null} sub={data ? `其中 ${data.totals.disabled} 张已停用` : ''} to={href('/cards')} />
        <Stat icon={<MonitorSmartphone />} label="已绑定设备" value={data?.totals.activations ?? null} sub="累计激活的电脑" />
        <Stat icon={<Zap />} label="近 7 天新激活" value={data ? sum('activated') : null} sub={data ? `${sum('failed')} 次失败请求` : ''} to={href('/logs')} />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">产品</h2>
          <span className="text-xs text-muted">{data ? `${data.products.length} 个产品` : ''}</span>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {data ? data.products.map(stats => <ProductCard key={stats.productId} stats={stats} />)
            : [0, 1].map(i => <Panel key={i} className="p-5"><Skeleton className="h-40" /></Panel>)}
        </div>
      </section>

      <div className="mt-8 grid items-start gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="近 30 天激活" description="每日新设备激活与失败请求，重复激活不计入柱高" />
          <div className="px-4 pt-5 pb-4 md:px-5">{data ? <TrendChart trend={data.trend} /> : <Skeleton className="h-48" />}</div>
        </Panel>
        <Panel className="flex flex-col">
          <PanelHeader title="最新激活请求" actions={<a href={href('/logs')} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">查看全部<ArrowRight className="size-3.5" /></a>} />
          <div className="flex-1 px-2 pt-2 pb-2">
            {log.data ? (log.data.items.length ? log.data.items.map(item => <FeedItem key={item.id} item={item} />)
              : <Empty icon={<Activity />} title="还没有激活请求" description="客户在软件里输入卡密后，请求会显示在这里。" />)
              : <div className="grid gap-2 p-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-11" />)}</div>}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Stat({ icon, label, value, sub, to }: { icon: ReactNode; label: string; value: number | null; sub: string; to?: string }) {
  const body = <>
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium text-fg-2">{label}</span>
      <span className="grid size-7 place-items-center rounded-lg bg-surface-2 text-muted ring-1 ring-line ring-inset [&>svg]:size-3.5">{icon}</span>
    </div>
    {value === null ? <Skeleton className="mt-3 h-8 w-16" /> : <strong className="tabular mt-2 block text-[28px] leading-none font-semibold tracking-tight md:text-[32px]">{value}</strong>}
    <span className="mt-2 flex items-center gap-1 truncate text-xs text-muted">{sub}{to && <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />}</span>
  </>;
  const cls = 'group block rounded-xl border border-line bg-surface p-4 shadow-xs md:p-5';
  return to ? <a href={to} className={cn(cls, 'transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm')}>{body}</a> : <div className={cls}>{body}</div>;
}

function ProductCard({ stats }: { stats: ProductStats }) {
  const { product } = useSession();
  const { openGenerate } = useOverlays();
  const p = product(stats.productId);
  const sold = stats.total - stats.unused - stats.disabled;
  return (
    <Panel className="flex flex-col p-4 md:p-5">
      <div className="flex items-center gap-3">
        <ProductAvatar id={p.id} name={p.name} color={p.color} size="lg" />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold tracking-tight">{p.name}</p><p className="truncate font-mono text-xs text-muted">{p.id}</p></div>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => openGenerate({ productId: stats.productId })}>生成</Button>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div><p className="text-xs text-muted">可售库存</p><p className="tabular mt-1 text-[32px] leading-none font-semibold tracking-tight">{stats.unused}</p></div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-xs">
          <dt className="text-muted">已售出</dt><dd className="tabular font-medium">{sold}</dd>
          <dt className="text-muted">设备</dt><dd className="tabular font-medium">{stats.activations}</dd>
        </dl>
      </div>
      <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={SEGMENTS.map(s => `${STATE_LABEL[s]} ${stats[s]}`).join('，')}>
        {SEGMENTS.filter(s => stats[s] > 0).map(s => <i key={s} className={cn('h-full min-w-1', SEGMENT_BG[s])} style={{ flexGrow: stats[s] }} title={`${STATE_LABEL[s]} ${stats[s]} 张`} />)}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 text-xs">
        {SEGMENTS.map(s => (
          <a key={s} href={href('/cards', { productId: stats.productId, state: s })} className="rounded-md px-1 py-1 -mx-1 hover:bg-surface-2">
            <span className="flex items-center gap-1.5 text-muted"><i className={cn('size-2 rounded-[2px]', SEGMENT_BG[s])} />{STATE_LABEL[s]}</span>
            <span className="tabular mt-0.5 block pl-3.5 font-semibold">{stats[s]}</span>
          </a>
        ))}
      </div>
    </Panel>
  );
}

function FeedItem({ item }: { item: ActivationLogItem }) {
  const { product } = useSession();
  const { openCard } = useOverlays();
  const now = useNow();
  const p = item.productId ? product(item.productId) : null;
  const title = item.cardExists ? (item.customer || item.note || `卡密 ${item.cardId!.slice(0, 8)}`) : item.cardId ? '已删除的卡密' : '未匹配到卡密';
  const Tag = item.cardExists ? 'button' : 'div';
  return (
    <Tag type={item.cardExists ? 'button' : undefined} onClick={item.cardExists ? () => openCard(item.cardId!) : undefined}
      className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', item.cardExists && 'hover:bg-surface-2')}>
      {p ? <ProductAvatar id={p.id} name={p.name} color={p.color} /> : <span className="size-[22px] rounded-md bg-surface-3" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className="block truncate font-mono text-[11px] text-muted">{shortFingerprint(item.machineFingerprint)}</span>
      </span>
      <span className="flex flex-col items-end gap-1"><ResultBadge result={item.result} /><time className="text-[11px] text-muted" title={dateTime(item.at)}>{relative(item.at, now)}</time></span>
    </Tag>
  );
}
