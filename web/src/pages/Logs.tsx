import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, ScrollText } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { AUDIT, dateTime, relative, shortFingerprint } from '../lib/format';
import { useIsDesktop, useNow } from '../lib/hooks';
import { href, navigate, useRoute } from '../lib/router';
import type { ActivationLogItem, AuditItem, Page } from '../lib/types';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Segmented, Select } from '../ui/controls';
import { Empty, ListSkeleton, Pagination, Panel, ResultBadge } from '../ui/display';
import { PageHeader } from './PageHeader';

export function LogsPage() {
  const { params } = useRoute();
  const tab = params.get('tab') === 'audit' ? 'audit' : 'activation';
  return (
    <>
      <PageHeader title="日志" description={tab === 'activation' ? '客户端的每次激活请求（保留 180 天）。客户说「激活失败」时先看这里。' : '后台的生成、停用、删除、释放、查看卡密等操作。'}
        tabs={<nav className="flex gap-1 border-b border-line">
          {([['activation', '激活记录'], ['audit', '操作日志']] as const).map(([key, label]) => (
            <a key={key} href={href('/logs', { tab: key === 'audit' ? 'audit' : undefined })} aria-current={tab === key ? 'page' : undefined}
              className={cn('-mb-px border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-fg-2', tab === key && 'border-primary text-primary')}>{label}</a>
          ))}
        </nav>} />
      {tab === 'activation' ? <ActivationLog params={params} /> : <AuditLog params={params} />}
    </>
  );
}

function ActivationLog({ params }: { params: URLSearchParams }) {
  const { settings, product } = useSession();
  const { openCard } = useOverlays();
  const desktop = useIsDesktop(); const now = useNow();
  const filters = { result: params.get('result') || '', productId: params.get('productId') || '', offset: Number(params.get('offset')) || 0 };
  const update = (patch: Partial<typeof filters>) => navigate('/logs', { ...filters, offset: undefined, ...patch }, { replace: true });
  const list = useQuery({ queryKey: ['activation-log', filters], placeholderData: keepPreviousData, queryFn: () => api<Page<ActivationLogItem>>(`/api/activation-log${qs(filters)}`) });
  const items = list.data?.items ?? [];
  const title = (item: ActivationLogItem) => item.cardExists ? (item.customer || item.note || `卡密 ${item.cardId!.slice(0, 8)}`) : item.cardId ? '已删除的卡密' : '未匹配到卡密';
  return (
    <Panel className="overflow-hidden">
      <div className="flex gap-2 overflow-x-auto border-b border-line p-3 scrollbar-none">
        <Segmented label="结果" value={filters.result} onChange={v => update({ result: v })} className="shrink-0"
          options={[{ value: '', label: '全部' }, { value: 'ok', label: '成功' }, { value: 'failed', label: '失败' }]} />
        <Select className="w-32 shrink-0" aria-label="产品" value={filters.productId} onChange={e => update({ productId: e.target.value })}>
          <option value="">全部产品</option>{settings.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      {list.isLoading ? <ListSkeleton /> : items.length === 0 ? <Empty icon={<Activity />} title="暂无记录" description="客户端发起激活后会记录在这里。" />
        : desktop ? (
          <table className="w-full border-collapse text-left">
            <thead><tr className="border-b border-line bg-surface-2/50 text-xs text-muted [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
              <th className="!pl-4">时间</th><th>结果</th><th>产品</th><th>卡密</th><th>机器码</th>
            </tr></thead>
            <tbody>{items.map(item => (
              <tr key={item.id} onClick={() => item.cardExists && openCard(item.cardId!)} className={cn('border-b border-line last:border-b-0 [&>td]:px-3 [&>td]:py-3', item.cardExists && 'cursor-pointer hover:bg-hover')}>
                <td className="!pl-4 whitespace-nowrap"><p>{relative(item.at, now)}</p><p className="text-xs text-muted">{dateTime(item.at)}</p></td>
                <td><ResultBadge result={item.result} /></td>
                <td className="text-fg-2">{item.productId ? product(item.productId).name : '—'}</td>
                <td className={cn('max-w-[260px] truncate', !item.cardExists && 'text-muted')}>{title(item)}</td>
                <td className="font-mono text-xs text-muted" title={item.machineFingerprint || ''}>{shortFingerprint(item.machineFingerprint)}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : (
          <div className="divide-y divide-line">{items.map(item => (
            <button key={item.id} type="button" disabled={!item.cardExists} onClick={() => openCard(item.cardId!)} className="grid w-full gap-1.5 px-4 py-3 text-left disabled:cursor-default">
              <span className="flex items-center justify-between gap-2"><ResultBadge result={item.result} /><time className="text-xs text-muted">{relative(item.at, now)}</time></span>
              <span className="truncate font-medium">{title(item)}</span>
              <span className="truncate text-xs text-muted">{item.productId ? product(item.productId).name : '—'} · <span className="font-mono">{shortFingerprint(item.machineFingerprint)}</span></span>
            </button>
          ))}</div>
        )}
      {list.data && list.data.total > 0 && <Pagination offset={filters.offset} limit={list.data.limit} total={list.data.total} onChange={offset => update({ offset })} />}
    </Panel>
  );
}

function AuditLog({ params }: { params: URLSearchParams }) {
  const { openCard } = useOverlays();
  const now = useNow();
  const offset = Number(params.get('offset')) || 0;
  const list = useQuery({ queryKey: ['audit-log', offset], placeholderData: keepPreviousData, queryFn: () => api<Page<AuditItem>>(`/api/audit-log${qs({ offset })}`) });
  const items = list.data?.items ?? [];
  const isCard = (item: AuditItem) => (item.action.startsWith('card.') || item.action === 'device.release') && Boolean(item.target);
  return (
    <Panel className="overflow-hidden">
      {list.isLoading ? <ListSkeleton /> : items.length === 0 ? <Empty icon={<ScrollText />} title="暂无操作记录" /> : (
        <div className="divide-y divide-line">{items.map(item => (
          <button key={item.id} type="button" disabled={!isCard(item)} onClick={() => openCard(item.target)}
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-left enabled:hover:bg-hover disabled:cursor-default md:grid-cols-[160px_120px_minmax(0,1fr)]">
            <time className="text-[13px] max-md:order-2 max-md:text-xs max-md:text-muted" title={dateTime(item.at)}>{relative(item.at, now)}<span className="ml-2 hidden text-xs text-muted md:inline">{dateTime(item.at)}</span></time>
            <span className="font-medium max-md:order-1">{AUDIT[item.action] || item.action}</span>
            <span className="truncate text-[13px] text-muted max-md:order-3 max-md:col-span-2">
              {item.target && <span className="font-mono text-xs">{item.target.slice(0, 8)} </span>}{item.action === 'device.release' ? shortFingerprint(item.detail) : item.detail}
            </span>
          </button>
        ))}</div>
      )}
      {list.data && list.data.total > 0 && <Pagination offset={offset} limit={list.data.limit} total={list.data.total} onChange={o => navigate('/logs', { tab: 'audit', offset: o || undefined }, { replace: true })} />}
    </Panel>
  );
}
