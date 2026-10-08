import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, Download, Layers, PlayCircle, Plus, Search } from 'lucide-react';
import { api, qs } from '../lib/api';
import { dateTime, relative } from '../lib/format';
import { useDebounced, useIsDesktop, useNow } from '../lib/hooks';
import { useRefreshCards } from '../lib/queries';
import { navigate, useRoute } from '../lib/router';
import type { Batch, Page } from '../lib/types';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Button, IconButton, Input, Select } from '../ui/controls';
import { Empty, ListSkeleton, Pagination, Panel, ProductChip } from '../ui/display';
import { useConfirm, useToast } from '../ui/feedback';
import { PageHeader } from './PageHeader';
import { SectionTabs } from './SectionTabs';

export function BatchesPage() {
  const { params } = useRoute();
  const { settings } = useSession();
  const { openGenerate } = useOverlays();
  const desktop = useIsDesktop();
  const filters = { q: params.get('q') || '', productId: params.get('productId') || '', offset: Number(params.get('offset')) || 0 };
  const update = (patch: Partial<typeof filters>) => navigate('/batches', { ...filters, offset: undefined, ...patch }, { replace: true });
  const [search, setSearch] = useState(filters.q);
  const debounced = useDebounced(search.trim());
  useEffect(() => { if (debounced !== filters.q) update({ q: debounced }); }, [debounced]); // eslint-disable-line
  const list = useQuery({ queryKey: ['batches', filters], placeholderData: keepPreviousData, queryFn: () => api<Page<Batch>>(`/api/batches${qs(filters)}`) });
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader title="批次" description="每次生成就是一个批次：可整批导出含卡密的 CSV，或整批停用。" tabs={<SectionTabs />}
        actions={<Button variant="primary" className="max-md:hidden" icon={<Plus className="size-4" />} onClick={() => openGenerate()}>生成卡密</Button>} />
      <Panel className="overflow-hidden">
        <div className="flex gap-2 border-b border-line p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input id="page-search" type="search" className="pl-9" placeholder="搜索客户、渠道或备注" value={search} onChange={e => setSearch(e.target.value)} aria-label="搜索批次" />
          </div>
          <Select className="w-32 shrink-0" aria-label="产品" value={filters.productId} onChange={e => update({ productId: e.target.value })}>
            <option value="">全部产品</option>{settings.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        {list.isLoading ? <ListSkeleton /> : items.length === 0 ? (
          <Empty icon={<Layers />} title="没有批次" description={filters.q || filters.productId ? '试试调整筛选条件。' : '生成卡密后会自动创建批次。'} />
        ) : desktop ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead><tr className="border-b border-line bg-surface-2/50 text-xs text-muted [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium [&>th]:whitespace-nowrap">
                <th className="!pl-4">创建时间</th><th>产品</th><th>客户 / 备注</th><th className="text-right">数量</th><th>已激活</th><th className="text-right">停用</th><th />
              </tr></thead>
              <tbody>{items.map(b => <BatchRow key={b.batchId} batch={b} />)}</tbody>
            </table>
          </div>
        ) : <div className="divide-y divide-line">{items.map(b => <BatchItem key={b.batchId} batch={b} />)}</div>}
        {list.data && list.data.total > 0 && <Pagination offset={filters.offset} limit={30} total={list.data.total} onChange={offset => update({ offset })} />}
      </Panel>
    </>
  );
}

function useBatchActions(batch: Batch) {
  const toast = useToast(); const confirm = useConfirm(); const refresh = useRefreshCards();
  const allDisabled = batch.cards > 0 && batch.disabled === batch.cards;
  return {
    allDisabled,
    exportCodes: () => { location.href = `/api/cards/export${qs({ batchId: batch.batchId, codes: 1 })}`; },
    toggle: () => {
      const status = allDisabled ? 'active' : 'disabled';
      const run = async () => { await api(`/api/batches/${batch.batchId}`, 'PATCH', { status }); toast(allDisabled ? '已恢复整批' : '已停用整批'); await refresh(); };
      if (status === 'disabled') confirm({ title: `停用这一批 ${batch.cards} 张卡密？`, message: '整批停用后所有激活请求都会被拒绝，可随时整批恢复。', confirmText: '整批停用', action: run });
      else run().catch(e => toast(e.message, 'error'));
    },
  };
}
function Progress({ batch }: { batch: Batch }) {
  const ratio = batch.cards ? batch.activatedCards / batch.cards : 0;
  return (
    <span className="inline-flex items-center gap-2 tabular text-[13px]">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3"><i className="block h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} /></span>
      {batch.activatedCards}/{batch.cards}
    </span>
  );
}
const open = (batch: Batch) => navigate('/cards', { batchId: batch.batchId });

function BatchRow({ batch }: { batch: Batch }) {
  const { product } = useSession(); const now = useNow();
  const { allDisabled, exportCodes, toggle } = useBatchActions(batch);
  return (
    <tr tabIndex={0} onClick={() => open(batch)} onKeyDown={e => { if (e.key === 'Enter') open(batch); }} title="查看这一批卡密"
      className="cursor-pointer border-b border-line last:border-b-0 hover:bg-hover [&>td]:px-3 [&>td]:py-3">
      <td className="!pl-4 whitespace-nowrap"><p>{relative(batch.createdAt, now)}</p><p className="text-xs text-muted">{dateTime(batch.createdAt)}</p></td>
      <td><ProductChip product={product(batch.productId)} /><p className="text-xs text-muted">{batch.edition} · 每卡 {batch.maxDevices} 台</p></td>
      <td className="max-w-[300px]"><p className="truncate font-medium">{batch.customer || batch.note || '—'}</p><p className="truncate text-xs text-muted">{[batch.customer && batch.note, batch.channel].filter(Boolean).join(' · ')}</p></td>
      <td className="tabular text-right">{batch.cards === batch.quantity ? batch.cards : <span title={`原生成 ${batch.quantity} 张，已删除 ${batch.quantity - batch.cards} 张`}>{batch.cards}/{batch.quantity}</span>}</td>
      <td><Progress batch={batch} /></td>
      <td className="tabular text-right text-muted">{batch.disabled || '—'}</td>
      <td className="whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
        <span className="inline-flex gap-1">
          <Button size="sm" icon={<Download className="size-4" />} title="导出这一批的 CSV（包含卡密明文）" onClick={exportCodes}>导出</Button>
          <Button size="sm" variant="ghost" disabled={batch.cards === 0} icon={allDisabled ? <PlayCircle className="size-4" /> : <Ban className="size-4" />} onClick={toggle}>{allDisabled ? '整批恢复' : '整批停用'}</Button>
        </span>
      </td>
    </tr>
  );
}
function BatchItem({ batch }: { batch: Batch }) {
  const { product } = useSession(); const now = useNow();
  const { allDisabled, exportCodes, toggle } = useBatchActions(batch);
  return (
    <div className="flex items-start gap-2 px-4 py-3.5">
      <button type="button" onClick={() => open(batch)} className="grid min-w-0 flex-1 gap-1.5 text-left">
        <span className="flex items-center justify-between gap-2"><ProductChip product={product(batch.productId)} className="text-[13px] text-fg-2" /><span className="text-xs text-muted">{relative(batch.createdAt, now)}</span></span>
        <span className="truncate text-[15px] font-medium">{batch.customer || batch.note || `${batch.cards} 张卡密`}</span>
        <span className="flex items-center gap-3 text-xs text-muted"><Progress batch={batch} />{batch.disabled > 0 && <span>{batch.disabled} 张停用</span>}</span>
      </button>
      <div className="flex flex-col gap-1">
        <IconButton label="导出含卡密 CSV" size="sm" variant="secondary" onClick={exportCodes}><Download className="size-4" /></IconButton>
        <IconButton label={allDisabled ? '整批恢复' : '整批停用'} size="sm" disabled={batch.cards === 0} onClick={toggle}>{allDisabled ? <PlayCircle className="size-4" /> : <Ban className="size-4" />}</IconButton>
      </div>
    </div>
  );
}
