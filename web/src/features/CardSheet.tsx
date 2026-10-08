import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ban, Eye, EyeOff, Info, Layers, MessageSquareText, PlayCircle, Trash2, Unlink2, X } from 'lucide-react';
import { api, qs } from '../lib/api';
import { CHANNELS, cardTitle, dateTime, deliveryText, relative, shortFingerprint } from '../lib/format';
import { useNow } from '../lib/hooks';
import { useRefreshCards } from '../lib/queries';
import { navigate } from '../lib/router';
import type { ActivationLogItem, CardDetail, Page } from '../lib/types';
import { useSession } from '../session';
import { Button, Field, IconButton, Input, Textarea } from '../ui/controls';
import { copyText, CopyButton, Meter, ProductChip, ResultBadge, Skeleton, StateBadge } from '../ui/display';
import { useConfirm, useToast } from '../ui/feedback';
import { Sheet } from '../ui/overlay';

const MASK = 'LIC-•••••••• ••••••• ••••••••';
const EDITABLE = ['customer', 'channel', 'orderNo', 'note'] as const;
type Editable = typeof EDITABLE[number];

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-line py-5 last:border-b-0">
      <div className="flex items-center justify-between gap-2"><h3 className="text-[13px] font-semibold text-fg-2">{title}</h3>{aside}</div>
      {children}
    </section>
  );
}

export function CardSheet({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { settings, product } = useSession();
  const toast = useToast(); const confirm = useConfirm(); const refresh = useRefreshCards();
  const now = useNow();
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  useEffect(() => { if (!open) { const t = setTimeout(onClose, 0); return () => clearTimeout(t); } }, [open, onClose]);

  const card = useQuery({ queryKey: ['card', cardId], queryFn: () => api<CardDetail>(`/api/cards/${cardId}`) });
  const log = useQuery({ queryKey: ['activation-log', { cardId }], queryFn: () => api<Page<ActivationLogItem>>(`/api/activation-log${qs({ cardId, limit: 20 })}`) });
  useEffect(() => { if (card.error) { toast((card.error as Error).message, 'error'); close(); } }, [card.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Plain-text code is fetched on demand (audited server-side) and kept only while the sheet is open.
  const code = useRef<string | null>(null);
  const [shown, setShown] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const reveal = async () => (code.current ??= (await api<{ cardCode: string }>(`/api/cards/${cardId}/reveal`, 'POST', {})).cardCode);

  const [draft, setDraft] = useState<Record<Editable, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const data = card.data;
  useEffect(() => { if (data) setDraft(Object.fromEntries(EDITABLE.map(k => [k, data[k] || ''])) as Record<Editable, string>); }, [data]);
  const dirty = data && draft ? EDITABLE.filter(k => draft[k].trim() !== (data[k] || '').trim()) : [];

  const header = data ? (
    <div className="relative grid gap-2.5">
      <span className="absolute -inset-x-5 -top-3 h-1 md:-top-5" style={{ background: product(data.productId).color }} aria-hidden />
      <div className="flex items-center gap-2">
        <ProductChip product={product(data.productId)} />
        <StateBadge state={data.state} />
        <IconButton label="关闭" size="sm" data-dialog-close="" className="-mr-2 ml-auto" onClick={close}><X className="size-4" /></IconButton>
      </div>
      <h2 className="font-display text-2xl leading-snug font-semibold">{cardTitle(data)}</h2>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
        <Meter used={data.usedDevices} max={data.maxDevices} /><span>·</span><span>{data.edition}</span><span>·</span><span>创建于 {dateTime(data.issuedAt)}</span>
      </div>
    </div>
  ) : <div className="grid gap-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-60" /></div>;

  const footer = data && <>
    <Button icon={data.status === 'active' ? <Ban className="size-4" /> : <PlayCircle className="size-4" />} onClick={() => {
      const run = async () => { await api(`/api/cards/${cardId}`, 'PATCH', { status: data.status === 'active' ? 'disabled' : 'active' }); toast(data.status === 'active' ? '已停用' : '已恢复'); await refresh(); };
      if (data.status === 'active') confirm({ title: '停用这张卡密？', confirmText: '停用', message: '停用后所有激活请求都会被拒绝，包括已绑定设备的重新激活。可随时恢复。', detail: '已签发的离线许可证不受影响。', action: run });
      else run().catch(e => toast(e.message, 'error'));
    }}>{data.status === 'active' ? '停用' : '恢复'}</Button>
    <Button variant="danger-ghost" className="ml-auto" icon={<Trash2 className="size-4" />} onClick={() => confirm({
      title: '永久删除这张卡密？', confirmText: '删除', message: `将删除卡密及 ${data.usedDevices} 条设备记录，此操作不可恢复。`, detail: '已签发的离线许可证不受影响。',
      action: async () => { await api('/api/cards/batch', 'DELETE', { cardIds: [cardId], confirmed: true }); toast('已删除'); close(); await refresh(); },
    })}>删除</Button>
  </>;

  return (
    <Sheet open={open} onClose={close} label="卡密详情" header={header} footer={footer}>
      {!data || !draft ? <div className="grid gap-4 py-5"><Skeleton className="h-16" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div> : <>
        <Section title="卡密">
          {data.hasCode ? <>
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 py-2 pr-2 pl-3.5">
              <code className="min-w-0 flex-1 font-mono text-[13px] tracking-wide break-all">{shown && code.current ? code.current : MASK}</code>
              <Button size="sm" loading={revealing} icon={shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={async () => {
                if (shown) { setShown(false); return; }
                setRevealing(true);
                try { await reveal(); setShown(true); } catch (e) { toast((e as Error).message, 'error'); } finally { setRevealing(false); }
              }}>{shown ? '隐藏' : '显示'}</Button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex">
              <Button size="sm" onClick={async () => { try { if (await copyText(await reveal())) toast('卡密已复制'); } catch (e) { toast((e as Error).message, 'error'); } }}>复制卡密</Button>
              <Button size="sm" icon={<MessageSquareText className="size-4" />} onClick={async () => {
                try { if (await copyText(deliveryText(settings, data, await reveal()))) toast('发货文案已复制'); } catch (e) { toast((e as Error).message, 'error'); }
              }}>复制发货文案</Button>
            </div>
          </> : (
            <p className="flex gap-2 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] text-fg-2"><Info className="mt-0.5 size-4 shrink-0" />这张卡创建于加密保存功能之前，无法回看卡密明文。</p>
          )}
        </Section>

        <Section title={`设备（${data.usedDevices}/${data.maxDevices}）`} aside={data.releases > 0 && <span className="text-xs text-muted" title="通过「释放」腾出名额的次数">已释放 {data.releases} 次</span>}>
          {data.devices.length ? data.devices.map((device, i) => (
            <div key={device.activationId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3.5 py-3">
              <span className="flex min-w-0 items-center gap-1 font-mono text-[13px]" title={device.machineFingerprint}>
                <span className="truncate">{shortFingerprint(device.machineFingerprint)}</span>
                <CopyButton text={device.machineFingerprint} label="复制机器码" toastText="机器码已复制" />
              </span>
              <Button size="sm" variant="danger-ghost" icon={<Unlink2 className="size-4" />} onClick={() => confirm({
                title: '释放设备名额？', confirmText: '释放名额', message: `释放「设备 ${i + 1}」后，这张卡可以在另一台电脑上激活。`,
                detail: '离线许可证无法撤回：被释放的旧电脑仍可继续使用。仅在确认客户已更换电脑时操作。',
                action: async () => { await api(`/api/cards/${cardId}/devices/${device.activationId}/release`, 'POST', { confirmed: true }); toast('已释放设备名额'); await refresh(); },
              })}>释放</Button>
              <span className="col-span-2 text-xs text-muted">首次激活 {dateTime(device.issuedAt)} · 最近请求 {relative(device.lastSeenAt || device.issuedAt, now)}</span>
            </div>
          )) : <p className="text-[13px] text-muted">尚未在任何设备上激活。</p>}
        </Section>

        <Section title="客户信息">
          <form className="grid gap-3.5" onSubmit={async e => {
            e.preventDefault(); setSaving(true);
            try {
              await api(`/api/cards/${cardId}`, 'PATCH', Object.fromEntries(dirty.map(k => [k, draft[k]])));
              toast('已保存'); await refresh();
            } catch (err) { toast((err as Error).message, 'error'); } finally { setSaving(false); }
          }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="客户"><Input maxLength={120} placeholder="昵称 / 姓名" value={draft.customer} onChange={e => setDraft({ ...draft, customer: e.target.value })} /></Field>
              <Field label="渠道"><Input maxLength={60} placeholder="例如 闲鱼" list="channel-options" value={draft.channel} onChange={e => setDraft({ ...draft, channel: e.target.value })} /></Field>
            </div>
            <datalist id="channel-options">{CHANNELS.map(c => <option key={c} value={c} />)}</datalist>
            <Field label="订单号"><Input maxLength={120} placeholder="订单号" value={draft.orderNo} onChange={e => setDraft({ ...draft, orderNo: e.target.value })} /></Field>
            <Field label="备注"><Textarea rows={2} maxLength={2000} placeholder="备注" value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></Field>
            {dirty.length > 0 && <div className="flex gap-2"><Button type="submit" variant="primary" size="sm" loading={saving}>保存修改</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(Object.fromEntries(EDITABLE.map(k => [k, data[k] || ''])) as Record<Editable, string>)}>撤销</Button></div>}
          </form>
        </Section>

        <Section title="激活记录" aside={<span className="text-xs text-muted">最近 20 条</span>}>
          {log.isLoading ? <Skeleton className="h-16" /> : log.data?.items.length ? (
            <div className="grid">{log.data.items.map(item => (
              <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-dashed border-line py-2 text-[13px] last:border-b-0">
                <ResultBadge result={item.result} /><span className="truncate font-mono text-xs text-muted">{shortFingerprint(item.machineFingerprint)}</span>
                <time className="text-xs text-muted" title={dateTime(item.at)}>{relative(item.at, now)}</time>
              </div>
            ))}</div>
          ) : <p className="text-[13px] text-muted">暂无激活请求记录。</p>}
        </Section>

        <Section title="详细信息">
          <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-muted">卡 ID</dt><dd className="flex min-w-0 items-center gap-1 font-mono text-xs"><span className="truncate">{data.cardId}</span><CopyButton text={data.cardId} label="复制卡 ID" /></dd>
            <dt className="text-muted">授权版本</dt><dd>{data.edition}</dd>
            <dt className="text-muted">设备上限</dt><dd>{data.maxDevices} 台</dd>
            <dt className="text-muted">批次</dt><dd>{data.batchId ? <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => { close(); navigate('/cards', { batchId: data.batchId }); }}><Layers className="size-3.5" />查看同批卡密</button> : '—'}</dd>
            <dt className="text-muted">最近活跃</dt><dd>{dateTime(data.lastSeenAt)}</dd>
          </dl>
        </Section>
      </>}
    </Sheet>
  );
}
