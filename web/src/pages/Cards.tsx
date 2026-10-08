import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, CheckSquare, CreditCard, Download, PlayCircle, Plus, Search, Trash2, X } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { cardSubtitle, cardTitle, dateTime, relative } from '../lib/format';
import { useDebounced, useIsDesktop, useNow } from '../lib/hooks';
import { useRefreshCards } from '../lib/queries';
import { navigate, useRoute } from '../lib/router';
import { storage } from '../lib/storage';
import type { Batch, Card, CardState, Page } from '../lib/types';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Button, Checkbox, IconButton, Input, Segmented, Select } from '../ui/controls';
import { Empty, ListSkeleton, Meter, Pagination, Panel, ProductChip, StateBadge } from '../ui/display';
import { useConfirm, useToast } from '../ui/feedback';
import { PageHeader } from './PageHeader';
import { SectionTabs } from './SectionTabs';

const STATES: Array<{ value: '' | CardState; label: string }> = [
  { value: '', label: '全部' }, { value: 'unused', label: '未使用' }, { value: 'partial', label: '部分激活' }, { value: 'full', label: '已满' }, { value: 'disabled', label: '已停用' },
];

export function CardsPage() {
  const { params } = useRoute();
  const { settings } = useSession();
  const { openCard, openGenerate } = useOverlays();
  const toast = useToast(); const confirm = useConfirm(); const refresh = useRefreshCards();
  const desktop = useIsDesktop();
  const filters = {
    q: params.get('q') || '', productId: params.get('productId') || '', state: (params.get('state') || '') as '' | CardState, batchId: params.get('batchId') || '',
    offset: Number(params.get('offset')) || 0, limit: Number(params.get('limit')) || Number(storage.get('cards:limit', '30')) || 30,
  };
  const update = (patch: Partial<typeof filters>) => {
    const next = { ...filters, offset: 0, ...patch };
    navigate('/cards', { ...next, offset: next.offset || undefined, limit: next.limit === 30 ? undefined : next.limit }, { replace: true });
  };

  const [search, setSearch] = useState(filters.q);
  const debounced = useDebounced(search.trim(), 250);
  useEffect(() => { if (debounced !== filters.q) update({ q: debounced }); }, [debounced]); // eslint-disable-line

  const list = useQuery({ queryKey: ['cards', filters], placeholderData: keepPreviousData,
    queryFn: () => api<Page<Card>>(`/api/cards${qs(filters)}`) });
  const batch = useQuery({ queryKey: ['batch', filters.batchId], enabled: Boolean(filters.batchId), queryFn: () => api<Batch>(`/api/batches/${filters.batchId}`) });
  useEffect(() => { // Stay on a valid page after deletions shrink the result.
    const total = list.data?.total;
    if (total !== undefined && filters.offset > 0 && filters.offset >= total) update({ offset: Math.max(0, Math.floor((total - 1) / filters.limit) * filters.limit) });
  }, [list.data?.total]); // eslint-disable-line

  // Selection survives paging and filtering until cleared or acted on.
  const [selected, setSelected] = useState<Map<string, Card>>(new Map());
  const [selecting, setSelecting] = useState(false);
  const selectMode = desktop || selecting;
  const toggle = (card: Card) => setSelected(prev => { const next = new Map(prev); if (next.has(card.cardId)) next.delete(card.cardId); else next.set(card.cardId, card); return next; });
  const items = list.data?.items ?? [];
  const pageSelected = items.filter(c => selected.has(c.cardId)).length;
  const clear = () => { setSelected(new Map()); setSelecting(false); };
  const ids = [...selected.keys()];
  const filtered = Boolean(filters.q || filters.productId || filters.state || filters.batchId);

  const bulkStatus = (status: 'active' | 'disabled') => {
    const run = async () => { const r = await api<{ updated: number }>('/api/cards/batch', 'PATCH', { cardIds: ids, status }); toast(`已${status === 'active' ? '恢复' : '停用'} ${r.updated} 张`); clear(); await refresh(); };
    if (status === 'disabled') confirm({ title: `停用所选 ${ids.length} 张卡密？`, message: '停用后这些卡的所有激活请求都会被拒绝，可随时恢复。', confirmText: '停用', action: run });
    else run().catch(e => toast(e.message, 'error'));
  };
  const bulkDelete = () => {
    const devices = [...selected.values()].reduce((s, c) => s + c.usedDevices, 0);
    confirm({ title: `永久删除 ${ids.length} 张卡密？`, message: `将同时删除 ${devices} 条设备激活记录，此操作不可恢复。`, detail: '已签发的离线许可证不受影响。',
      confirmText: '删除', typeToConfirm: ids.length > 1 ? String(ids.length) : undefined,
      action: async () => { const r = await api<{ deleted: number }>('/api/cards/batch', 'DELETE', { cardIds: ids, confirmed: true }); toast(`已删除 ${r.deleted} 张`); clear(); await refresh(); } });
  };
  const exportUrl = `/api/cards/export${qs({ q: filters.q, productId: filters.productId, state: filters.state, batchId: filters.batchId })}`;
  const batchLabel = batch.data ? (batch.data.customer || batch.data.note || `批次 ${batch.data.batchId.slice(0, 8)}`) : '批次';

  return (
    <>
      <PageHeader title="卡密" description={list.data ? `共 ${list.data.total} 张${filtered ? '符合条件' : ''}` : ' '} tabs={<SectionTabs />}
        actions={<>
          <Button icon={<Download className="size-4" />} title="按当前筛选导出 CSV（不含卡密明文）" onClick={() => { location.href = exportUrl; }} className="max-md:hidden">导出</Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openGenerate({ productId: filters.productId || undefined })} className="max-md:hidden">生成卡密</Button>
          {!desktop && <IconButton label={selecting ? '退出选择' : '多选'} variant="secondary" onClick={() => selecting ? clear() : setSelecting(true)}>{selecting ? <X className="size-4" /> : <CheckSquare className="size-4" />}</IconButton>}
        </>} />

      <Panel className="overflow-hidden">
        <div className="grid gap-2.5 border-b border-line p-3 md:flex md:flex-wrap md:items-center">
          <div className="relative md:min-w-64 md:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input id="page-search" type="search" className="pl-9" placeholder="搜索客户、备注、订单号、渠道或卡 ID" value={search} onChange={e => setSearch(e.target.value)} aria-label="搜索卡密" />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            <Select className="w-32 shrink-0" aria-label="产品" value={filters.productId} onChange={e => update({ productId: e.target.value })}>
              <option value="">全部产品</option>{settings.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Segmented label="状态" value={filters.state} onChange={v => update({ state: v })} options={STATES} className="shrink-0" />
          </div>
          {filters.batchId && (
            <span className="inline-flex h-8 w-fit items-center gap-1 rounded-full bg-primary-soft pr-1 pl-3 text-[13px] font-medium text-primary">
              {batchLabel}{batch.data && `（${batch.data.cards} 张）`}
              <IconButton label="清除批次筛选" size="sm" className="size-6 md:size-6 text-primary" onClick={() => update({ batchId: '' })}><X className="size-3.5" /></IconButton>
            </span>
          )}
        </div>

        {selected.size > 0 && (
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-primary-soft px-3 py-2 md:top-16">
            <strong className="mr-1 text-[13px] text-primary">已选 {selected.size} 张</strong>
            <Button size="sm" icon={<Ban className="size-4" />} onClick={() => bulkStatus('disabled')} disabled={selected.size > 100}>停用</Button>
            <Button size="sm" icon={<PlayCircle className="size-4" />} onClick={() => bulkStatus('active')} disabled={selected.size > 100}>恢复</Button>
            <Button size="sm" variant="danger-ghost" icon={<Trash2 className="size-4" />} onClick={bulkDelete} disabled={selected.size > 100}>删除</Button>
            {selected.size > 100 && <span className="text-xs text-danger">一次最多操作 100 张</span>}
            <Button size="sm" variant="ghost" className="ml-auto max-md:hidden" onClick={clear}>取消选择</Button>
          </div>
        )}

        {list.isLoading ? <ListSkeleton /> : list.error ? <Empty icon={<CreditCard />} title="加载失败" description={(list.error as Error).message} />
          : items.length === 0 ? (
            <Empty icon={<CreditCard />} title={filtered ? '没有符合条件的卡密' : '还没有卡密'} description={filtered ? '试试调整搜索词或筛选条件。' : '生成第一批卡密，发给客户激活即可。'}
              action={!filtered && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openGenerate()}>生成卡密</Button>} />
          ) : desktop ? (
            <CardTable items={items} selected={selected} pageSelected={pageSelected} onToggle={toggle} onOpen={openCard}
              onToggleAll={on => setSelected(prev => { const next = new Map(prev); for (const c of items) { if (on) next.set(c.cardId, c); else next.delete(c.cardId); } return next; })} />
          ) : (
            <div className={cn('divide-y divide-line', list.isFetching && 'opacity-70')}>
              {items.map(card => <CardRow key={card.cardId} card={card} selectable={selectMode} checked={selected.has(card.cardId)} onToggle={() => toggle(card)} onOpen={() => openCard(card.cardId)} />)}
            </div>
          )}
        {list.data && list.data.total > 0 && (
          <Pagination offset={filters.offset} limit={filters.limit} total={list.data.total} onChange={offset => update({ offset })}
            sizes={[30, 50, 100]} onSize={limit => { storage.set('cards:limit', String(limit)); update({ limit }); }} />
        )}
      </Panel>
    </>
  );
}

function CardTable({ items, selected, pageSelected, onToggle, onToggleAll, onOpen }: {
  items: Card[]; selected: Map<string, Card>; pageSelected: number; onToggle: (c: Card) => void; onToggleAll: (on: boolean) => void; onOpen: (id: string) => void;
}) {
  const { product } = useSession();
  const now = useNow();
  const all = useMemo(() => ({ checked: pageSelected === items.length, indeterminate: pageSelected > 0 && pageSelected < items.length }), [pageSelected, items.length]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead><tr className="border-b border-line bg-surface-2/50 text-xs text-muted [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium [&>th]:whitespace-nowrap">
          <th className="w-10 !pl-4"><Checkbox aria-label="选择本页全部" checked={all.checked} ref={el => { if (el) el.indeterminate = all.indeterminate; }} onChange={e => onToggleAll(e.target.checked)} /></th>
          <th>产品</th><th>客户 / 备注</th><th>设备</th><th>状态</th><th className="hidden lg:table-cell">最近活跃</th><th>创建</th>
        </tr></thead>
        <tbody>
          {items.map(card => {
            const sub = cardSubtitle(card); const isOn = selected.has(card.cardId);
            return (
              <tr key={card.cardId} tabIndex={0} onClick={() => onOpen(card.cardId)} onKeyDown={e => { if (e.key === 'Enter') onOpen(card.cardId); if (e.key === ' ') { e.preventDefault(); onToggle(card); } }}
                className={cn('cursor-pointer border-b border-line last:border-b-0 hover:bg-hover [&>td]:px-3 [&>td]:py-3', isOn && 'bg-primary-soft/50 hover:bg-primary-soft/60')}>
                <td className="!pl-4" onClick={e => { e.stopPropagation(); onToggle(card); }}><Checkbox aria-label={`选择 ${cardTitle(card)}`} checked={isOn} onChange={() => onToggle(card)} onClick={e => e.stopPropagation()} /></td>
                <td><ProductChip product={product(card.productId)} /></td>
                <td className="max-w-[340px]"><p className="truncate font-medium">{cardTitle(card)}</p>{sub && <p className="truncate text-xs text-muted">{sub}</p>}</td>
                <td><Meter used={card.usedDevices} max={card.maxDevices} /></td>
                <td><StateBadge state={card.state} /></td>
                <td className="hidden whitespace-nowrap text-[13px] text-muted lg:table-cell" title={dateTime(card.lastSeenAt)}>{card.lastSeenAt ? relative(card.lastSeenAt, now) : '—'}</td>
                <td className="whitespace-nowrap text-[13px] text-muted" title={dateTime(card.issuedAt)}>{relative(card.issuedAt, now)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CardRow({ card, selectable, checked, onToggle, onOpen }: { card: Card; selectable: boolean; checked: boolean; onToggle: () => void; onOpen: () => void }) {
  const { product } = useSession();
  const now = useNow();
  const sub = cardSubtitle(card);
  return (
    <button type="button" onClick={selectable ? onToggle : onOpen} className={cn('flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-hover', checked && 'bg-primary-soft/50')}>
      {selectable && <Checkbox className="mt-1" checked={checked} readOnly tabIndex={-1} aria-label={`选择 ${cardTitle(card)}`} />}
      <span className="grid min-w-0 flex-1 gap-1.5">
        <span className="flex items-center justify-between gap-2"><ProductChip product={product(card.productId)} className="text-[13px] text-fg-2" /><StateBadge state={card.state} /></span>
        <span className="truncate text-[15px] font-medium">{cardTitle(card)}</span>
        {sub && <span className="truncate text-xs text-muted">{sub}</span>}
        <span className="flex items-center justify-between gap-2 text-xs text-muted"><Meter used={card.usedDevices} max={card.maxDevices} /><span>{card.lastSeenAt ? `活跃 ${relative(card.lastSeenAt, now)}` : `创建 ${relative(card.issuedAt, now)}`}</span></span>
      </span>
    </button>
  );
}
