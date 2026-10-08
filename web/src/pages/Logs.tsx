import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { AUDIT, dateTime, RESULT, shortFingerprint } from '../lib/format';
import { href, navigate, useRoute } from '../lib/router';
import type { ActivationLogItem, AuditItem, Page } from '../lib/types';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Segmented, Select } from '../ui/controls';
import { Empty, ListSkeleton, Pagination, Panel, ProductAvatar } from '../ui/display';
import { PageHeader } from './PageHeader';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function dayLabel(ms: number) {
  const d = new Date(ms); const start = new Date(); start.setHours(0, 0, 0, 0);
  const diff = Math.round((start.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  const date = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return diff === 0 ? ['今天', date] : diff === 1 ? ['昨天', date] : [date, d.toLocaleDateString('zh-CN', { weekday: 'long' })];
}
// Group consecutive entries by local calendar day for a timeline layout.
function byDay<T extends { at: number }>(items: T[]) {
  const groups: Array<{ key: string; at: number; items: T[] }> = [];
  for (const item of items) {
    const d = new Date(item.at); const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (groups.at(-1)?.key === key) groups.at(-1)!.items.push(item); else groups.push({ key, at: item.at, items: [item] });
  }
  return groups;
}
function DayGroups<T extends { at: number; id: number }>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  return (
    <div>
      {byDay(items).map(group => {
        const [primary, secondary] = dayLabel(group.at);
        return (
          <section key={group.key} className="border-b border-line last:border-b-0 md:grid md:grid-cols-[150px_minmax(0,1fr)]">
            <h3 className="flex items-baseline gap-2 px-4 pt-4 pb-2 md:block md:px-5 md:py-5">
              <span className="font-display text-lg font-semibold">{primary}</span><span className="text-xs text-muted md:mt-1 md:block">{secondary} · {group.items.length} 条</span>
            </h3>
            <ol className="relative pb-2 md:py-3">{group.items.map(item => <li key={item.id}>{render(item)}</li>)}</ol>
          </section>
        );
      })}
    </div>
  );
}

export function LogsPage() {
  const { params } = useRoute();
  const tab = params.get('tab') === 'audit' ? 'audit' : 'activation';
  return (
    <>
      <PageHeader eyebrow="追踪与审计" title="日志"
        description={tab === 'activation' ? '客户端的每次激活请求，保留 180 天。客户反馈「激活失败」时，先在这里找原因。' : '后台的生成、停用、删除、释放与查看卡密等操作。'}
        tabs={<nav className="flex gap-6 border-b border-line">
          {([['activation', '激活记录'], ['audit', '操作日志']] as const).map(([key, label]) => (
            <a key={key} href={href('/logs', { tab: key === 'audit' ? 'audit' : undefined })} aria-current={tab === key ? 'page' : undefined}
              className={cn('-mb-px flex h-11 items-center border-b-2 text-[13px] font-medium', tab === key ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg')}>{label}</a>
          ))}
        </nav>} />
      {tab === 'activation' ? <ActivationLog params={params} /> : <AuditLog params={params} />}
    </>
  );
}

const TONE_DOT: Record<string, string> = { ok: 'bg-ok', neutral: 'bg-st-disabled', fail: 'bg-danger' };
function ActivationLog({ params }: { params: URLSearchParams }) {
  const { settings, product } = useSession();
  const { openCard } = useOverlays();
  const filters = { result: params.get('result') || '', productId: params.get('productId') || '', offset: Number(params.get('offset')) || 0 };
  const update = (patch: Partial<typeof filters>) => navigate('/logs', { ...filters, offset: undefined, ...patch }, { replace: true });
  const list = useQuery({ queryKey: ['activation-log', filters], placeholderData: keepPreviousData, queryFn: () => api<Page<ActivationLogItem>>(`/api/activation-log${qs(filters)}`) });
  const items = list.data?.items ?? [];
  const title = (item: ActivationLogItem) => item.cardExists ? (item.customer || item.note || `卡密 ${item.cardId!.slice(0, 8)}`) : item.cardId ? '已删除的卡密' : '未匹配到卡密';
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented label="结果" value={filters.result} onChange={v => update({ result: v })}
          options={[{ value: '', label: '全部' }, { value: 'ok', label: '成功' }, { value: 'failed', label: '失败' }]} />
        <Select className="w-36 [&_select]:md:h-8" aria-label="产品" value={filters.productId} onChange={e => update({ productId: e.target.value })}>
          <option value="">全部产品</option>{settings.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <Panel className="overflow-hidden rounded-2xl">
        {list.isLoading ? <ListSkeleton /> : items.length === 0 ? <Empty icon={<Activity />} title="暂无记录" description="客户端发起激活后会记录在这里。" /> : (
          <DayGroups items={items} render={item => {
            const [label, tone] = RESULT[item.result] || [item.result, 'fail'];
            const p = item.productId ? product(item.productId) : null;
            return (
              <button type="button" disabled={!item.cardExists} onClick={() => openCard(item.cardId!)}
                className="grid w-full grid-cols-[44px_14px_minmax(0,1fr)] items-start gap-x-3 px-4 py-2.5 text-left enabled:hover:bg-hover disabled:cursor-default md:grid-cols-[48px_14px_minmax(0,1fr)_auto] md:px-5">
                <time className="tabular pt-px font-mono text-xs text-muted" title={dateTime(item.at)}>{hhmm(item.at)}</time>
                <span className={cn('mt-1.5 size-2 rounded-full', TONE_DOT[tone])} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{title(item)}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                    <span className={cn(tone === 'fail' && 'text-danger', tone === 'ok' && 'text-ok')}>{label}</span>
                    <span>·</span><span className="truncate font-mono text-[11px]">{shortFingerprint(item.machineFingerprint)}</span>
                  </span>
                </span>
                {p && <span className="hidden items-center gap-2 text-xs text-fg-2 md:flex"><ProductAvatar id={p.id} name={p.name} color={p.color} size="sm" />{p.name}</span>}
              </button>
            );
          }} />
        )}
        {list.data && list.data.total > 0 && <Pagination offset={filters.offset} limit={list.data.limit} total={list.data.total} onChange={offset => update({ offset })} />}
      </Panel>
    </>
  );
}

function AuditLog({ params }: { params: URLSearchParams }) {
  const { openCard } = useOverlays();
  const offset = Number(params.get('offset')) || 0;
  const list = useQuery({ queryKey: ['audit-log', offset], placeholderData: keepPreviousData, queryFn: () => api<Page<AuditItem>>(`/api/audit-log${qs({ offset })}`) });
  const items = list.data?.items ?? [];
  const isCard = (item: AuditItem) => (item.action.startsWith('card.') || item.action === 'device.release') && Boolean(item.target);
  return (
    <Panel className="overflow-hidden rounded-2xl">
      {list.isLoading ? <ListSkeleton /> : items.length === 0 ? <Empty icon={<ScrollText />} title="暂无操作记录" /> : (
        <DayGroups items={items} render={item => (
          <button type="button" disabled={!isCard(item)} onClick={() => openCard(item.target)}
            className="grid w-full grid-cols-[44px_minmax(0,1fr)] items-baseline gap-x-3 px-4 py-2.5 text-left enabled:hover:bg-hover disabled:cursor-default md:grid-cols-[48px_120px_minmax(0,1fr)] md:px-5">
            <time className="tabular font-mono text-xs text-muted" title={dateTime(item.at)}>{hhmm(item.at)}</time>
            <span className="text-[13px] font-medium">{AUDIT[item.action] || item.action}</span>
            <span className="col-start-2 truncate text-xs text-muted md:col-start-3">
              {item.target && <span className="font-mono">{item.target.slice(0, 8)} </span>}{item.action === 'device.release' ? shortFingerprint(item.detail) : item.detail}
            </span>
          </button>
        )} />
      )}
      {list.data && list.data.total > 0 && <Pagination offset={offset} limit={list.data.limit} total={list.data.total} onChange={o => navigate('/logs', { tab: 'audit', offset: o || undefined }, { replace: true })} />}
    </Panel>
  );
}
