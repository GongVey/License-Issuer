import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, ArrowUpRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { dateTime, relative, RESULT, shortFingerprint, STATE_LABEL } from '../lib/format';
import { useNow } from '../lib/hooks';
import { href } from '../lib/router';
import type { ActivationLogItem, CardState, Dashboard, Page, ProductStats } from '../lib/types';
import { TrendChart } from '../features/TrendChart';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Button } from '../ui/controls';
import { Empty, ProductAvatar, Skeleton } from '../ui/display';
import { PageHeader } from './PageHeader';

const SEGMENTS: CardState[] = ['unused', 'partial', 'full', 'disabled'];
const SEGMENT_BG: Record<CardState, string> = { unused: 'bg-st-unused', partial: 'bg-st-partial', full: 'bg-st-full', disabled: 'bg-st-disabled' };

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}
export function SectionTitle({ title, aside, className }: { title: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5', className)}>
      <div className="flex items-baseline justify-between gap-3"><h2 className="font-display text-xl font-semibold">{title}</h2>{aside}</div>
      <div className="rule mt-3" />
    </div>
  );
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
      <PageHeader eyebrow={today} title={<>{greeting()}，<span className="italic">{session.username}</span></>}
        description={data ? `共有 ${stock} 张可售卡密，近 7 天新增 ${sum('activated')} 台设备激活。` : '正在汇总各产品的库存与激活情况…'}
        actions={<Button variant="primary" className="max-md:hidden" icon={<Plus />} onClick={() => openGenerate()}>生成卡密</Button>} />

      {/* Metric strip: open numbers divided by hairlines, not boxes. */}
      <div className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
        <Metric label="可售库存" value={data ? stock : null} sub="未激活的可用卡密" to={href('/cards', { state: 'unused' })} accent />
        <Metric label="全部卡密" value={data?.totals.total ?? null} sub={data ? `其中 ${data.totals.disabled} 张已停用` : ''} to={href('/cards')} />
        <Metric label="已绑定设备" value={data?.totals.activations ?? null} sub="累计激活的电脑" />
        <Metric label="近 7 天新激活" value={data ? sum('activated') : null} sub={data ? `${sum('failed')} 次失败请求` : ''} to={href('/logs')} />
      </div>

      <section className="mt-14">
        <SectionTitle title="产品" aside={<span className="text-xs text-muted">{data ? `${data.products.length} 个产品 · 点击查看卡密` : ''}</span>} />
        {data ? <div className="divide-y divide-line">{data.products.map(stats => <ProductRow key={stats.productId} stats={stats} />)}</div>
          : <div className="grid gap-3">{[0, 1].map(i => <Skeleton key={i} className="h-20" />)}</div>}
      </section>

      <div className="mt-14 grid gap-14 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-12">
        <section>
          <SectionTitle title="近 30 天激活" aside={<span className="text-xs text-muted">重复激活不计入柱高</span>} />
          {data ? <TrendChart trend={data.trend} /> : <Skeleton className="h-52" />}
        </section>
        <section>
          <SectionTitle title="最新动态" aside={<a href={href('/logs')} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">全部记录<ArrowRight className="size-3.5" /></a>} />
          {log.data ? (log.data.items.length ? <ol className="relative">{log.data.items.map((item, i) => <TimelineItem key={item.id} item={item} last={i === log.data!.items.length - 1} />)}</ol>
            : <Empty icon={<Activity />} title="还没有激活请求" description="客户在软件里输入卡密后，请求会显示在这里。" />)
            : <div className="grid gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>}
        </section>
      </div>
    </>
  );
}

function Metric({ label, value, sub, to, accent }: { label: string; value: number | null; sub: string; to?: string; accent?: boolean }) {
  const body = <>
    <span className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{label}</span>
    {value === null ? <Skeleton className="mt-4 h-10 w-20" /> : (
      <strong className={cn('tabular mt-3 block font-display text-[40px] leading-none font-medium md:text-[52px]', accent && 'text-primary')}>{value}</strong>
    )}
    <span className="mt-3 flex items-center gap-1 text-xs text-muted">{sub}{to && <ArrowUpRight className="size-3 -translate-x-1 opacity-0 transition-[opacity,transform] group-hover:translate-x-0 group-hover:opacity-100" />}</span>
  </>;
  // Hairline separators between columns (and between the two rows on phones) instead of boxes.
  const cls = 'group block py-6 md:py-8 max-lg:odd:pr-4 max-lg:even:border-l max-lg:even:border-line max-lg:even:pl-5 max-lg:[&:nth-child(-n+2)]:border-b max-lg:[&:nth-child(-n+2)]:border-line lg:border-l lg:border-line lg:px-7 lg:first:border-l-0 lg:first:pl-0';
  return to ? <a href={to} className={cn(cls, 'transition-colors hover:bg-surface/50')}>{body}</a> : <div className={cls}>{body}</div>;
}

function ProductRow({ stats }: { stats: ProductStats }) {
  const { product } = useSession();
  const { openGenerate } = useOverlays();
  const p = product(stats.productId);
  const sold = stats.total - stats.unused - stats.disabled;
  return (
    <div className="group grid gap-4 py-6 md:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1.6fr)_auto] md:items-center md:gap-10">
      <a href={href('/cards', { productId: p.id })} className="flex min-w-0 items-center gap-4">
        <ProductAvatar id={p.id} name={p.name} color={p.color} size="lg" className="size-11 rounded-xl text-base" />
        <span className="min-w-0"><span className="block truncate font-display text-lg font-semibold group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{p.name}</span>
          <span className="block truncate text-xs text-muted">{stats.total} 张卡密 · 已售 {sold} · {stats.activations} 台设备</span></span>
      </a>
      <div className="flex items-baseline gap-2 md:block md:text-right">
        <span className="tabular font-display text-[34px] leading-none font-medium">{stats.unused}</span>
        <span className="text-xs text-muted md:mt-1 md:block">张可售</span>
      </div>
      <div>
        <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-surface-2" role="img" aria-label={SEGMENTS.map(s => `${STATE_LABEL[s]} ${stats[s]}`).join('，')}>
          {SEGMENTS.filter(s => stats[s] > 0).map(s => <i key={s} className={cn('h-full min-w-1', SEGMENT_BG[s])} style={{ flexGrow: stats[s] }} title={`${STATE_LABEL[s]} ${stats[s]} 张`} />)}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {SEGMENTS.map(s => (
            <a key={s} href={href('/cards', { productId: stats.productId, state: s })} className="inline-flex items-center gap-1.5 text-muted hover:text-fg">
              <i className={cn('size-2 rounded-[2px]', SEGMENT_BG[s])} />{STATE_LABEL[s]}<b className="tabular font-semibold text-fg">{stats[s]}</b>
            </a>
          ))}
        </div>
      </div>
      <Button size="sm" icon={<Plus />} onClick={() => openGenerate({ productId: stats.productId })} className="w-fit">生成</Button>
    </div>
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
    <li className="relative pb-5 pl-6">
      {!last && <span className="absolute top-3 bottom-0 left-[4.5px] w-px bg-line" aria-hidden />}
      <span className={cn('absolute top-[7px] left-0 size-2.5 rounded-full ring-4 ring-bg', DOT[tone])} aria-hidden />
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
