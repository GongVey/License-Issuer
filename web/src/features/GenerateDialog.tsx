import { useState } from 'react';
import { CheckCircle2, Copy, Download, ExternalLink, MessageSquareText, Plus, Star } from 'lucide-react';
import { api } from '../lib/api';
import { CHANNELS, dateTime, deliveryText, toCsv } from '../lib/format';
import { useRefreshCards } from '../lib/queries';
import { storage } from '../lib/storage';
import type { GeneratedCard, Settings } from '../lib/types';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { Button, Field, IconButton, Input, Select, Stepper, Textarea } from '../ui/controls';
import { copyText, CopyButton, downloadFile, ProductAvatar } from '../ui/display';
import { cn } from '../lib/cn';
import { useToast } from '../ui/feedback';
import { Modal } from '../ui/overlay';

export interface GeneratePrefill { productId?: string; customer?: string }
interface Result { items: GeneratedCard[]; total: number; batchId: string }

function lastUsed() {
  try { return JSON.parse(storage.get('generate:last', '{}')) as Partial<{ productId: string; edition: string; maxDevices: number; quantity: number; channel: string }>; } catch { return {}; }
}

export function GenerateDialog({ prefill, onClose }: { prefill: GeneratePrefill; onClose: () => void }) {
  const { settings, setSettings, product } = useSession();
  const toast = useToast(); const refresh = useRefreshCards(); const { openCard } = useOverlays();
  const last = lastUsed();
  const pick = <T,>(value: T | undefined, valid: (v: T) => boolean, fallback: T) => (value !== undefined && valid(value) ? value : fallback);
  const [form, setForm] = useState({
    productId: pick(prefill.productId ?? last.productId, id => settings.products.some(p => p.id === id), settings.products[0]?.id ?? ''),
    edition: pick(last.edition, e => settings.editions.includes(e), settings.editions[0]),
    quantity: pick(last.quantity, n => n >= 1 && n <= 100, 1),
    maxDevices: pick(last.maxDevices, n => n >= 1 && n <= 100, 2),
    customer: prefill.customer ?? '', channel: last.channel ?? '', orderNo: '', note: '',
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(f => ({ ...f, [key]: value }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const created = await api<Result>('/api/cards/batch', 'POST', form);
      storage.set('generate:last', JSON.stringify({ productId: form.productId, edition: form.edition, maxDevices: form.maxDevices, quantity: form.quantity, channel: form.channel }));
      setResult(created); refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const savePreset = async () => {
    setSavingPreset(true);
    try {
      const name = `${product(form.productId).name} ×${form.quantity}`;
      const next = await api<Settings>('/api/settings', 'PUT', { presets: [...settings.presets, { name, productId: form.productId, edition: form.edition, maxDevices: form.maxDevices, quantity: form.quantity }] });
      setSettings(next); toast(`已保存预设「${name}」，可在设置中重命名`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSavingPreset(false); }
  };

  if (result) return <GeneratedResult result={result} input={form} onClose={onClose} onMore={() => { setResult(null); setForm(f => ({ ...f, customer: '', orderNo: '', note: '' })); }}
    onOpenCard={id => { onClose(); openCard(id); }} />;

  return (
    <Modal open onClose={onClose} locked={busy} title="生成卡密" description="卡密加密保存，之后可在详情里再次查看。"
      footer={<>
        <Button variant="ghost" className="mr-auto" loading={savingPreset} icon={<Star className="size-4" />} onClick={savePreset}>存为预设</Button>
        <Button type="submit" form="generate-form" variant="primary" loading={busy} icon={<Plus className="size-4" />} className="max-md:flex-1">生成 {form.quantity} 张</Button>
      </>}>
      <form id="generate-form" className="grid gap-4" onSubmit={submit}>
        {settings.presets.length > 0 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none">
            {settings.presets.map(preset => (
              <button key={preset.id} type="button" onClick={() => setForm(f => ({ ...f, productId: preset.productId, edition: preset.edition, quantity: preset.quantity, maxDevices: preset.maxDevices }))}
                title={`${product(preset.productId).name} · ${preset.edition} · ${preset.quantity} 张 · 每卡 ${preset.maxDevices} 台`}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium hover:border-primary hover:text-primary md:h-7">
                <Star className="size-3.5" />{preset.name}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium">产品</span>
          <div role="radiogroup" aria-label="产品" className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {settings.products.map(p => {
              const on = p.id === form.productId;
              return (
                <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => set('productId', p.id)}
                  className={cn('flex h-12 items-center gap-2.5 rounded-lg border bg-surface px-3 text-left text-[13px] font-medium transition-[border-color,box-shadow] md:h-11',
                    on ? 'border-primary ring-[3px] ring-primary/15' : 'border-line-strong hover:border-[color-mix(in_oklab,var(--line-strong)_60%,var(--fg))]')}>
                  <ProductAvatar id={p.id} name={p.name} color={p.color} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className={cn('grid size-4 shrink-0 place-items-center rounded-full border', on ? 'border-primary bg-primary' : 'border-line-strong')}>{on && <span className="size-1.5 rounded-full bg-white" />}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="生成数量"><Stepper label="生成数量" min={1} max={100} value={form.quantity} onChange={v => set('quantity', v)} /></Field>
          <Field label="每卡设备上限"><Stepper label="每卡设备上限" min={1} max={100} value={form.maxDevices} onChange={v => set('maxDevices', v)} /></Field>
        </div>
        {settings.editions.length > 1 && (
          <Field label="授权版本"><Select value={form.edition} onChange={e => set('edition', e.target.value)}>{settings.editions.map(e => <option key={e} value={e}>{e}</option>)}</Select></Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="客户"><Input maxLength={120} placeholder="可选" value={form.customer} onChange={e => set('customer', e.target.value)} /></Field>
          <Field label="渠道"><Input maxLength={60} placeholder="例如 闲鱼" list="generate-channels" value={form.channel} onChange={e => set('channel', e.target.value)} /></Field>
        </div>
        <datalist id="generate-channels">{CHANNELS.map(c => <option key={c} value={c} />)}</datalist>
        <Field label="订单号"><Input maxLength={120} placeholder="可选" value={form.orderNo} onChange={e => set('orderNo', e.target.value)} /></Field>
        <Field label="备注"><Textarea rows={2} maxLength={2000} placeholder="可选，同批卡密共用" value={form.note} onChange={e => set('note', e.target.value)} /></Field>
        {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function GeneratedResult({ result, input, onClose, onMore, onOpenCard }: {
  result: Result; input: { productId: string; edition: string; maxDevices: number; customer: string }; onClose: () => void; onMore: () => void; onOpenCard: (id: string) => void;
}) {
  const { settings, product } = useSession();
  const toast = useToast();
  const p = product(input.productId);
  const codes = result.items.map(card => card.cardCode);
  const stamp = dateTime(Date.now()).replace(/[-: ]/g, '');
  const copy = async (text: string, message: string) => { if (await copyText(text)) toast(message); else toast('复制失败，请手动复制', 'error'); };
  return (
    <Modal open onClose={onClose} title="生成完成" size="md"
      footer={<>
        <div className="mr-auto flex flex-wrap gap-2 max-md:w-full max-md:[&>button]:flex-1">
          <Button size="sm" icon={<MessageSquareText className="size-4" />} onClick={() => copy(result.items.map(card => deliveryText(settings, card, card.cardCode)).join('\n\n————————\n\n'), '发货文案已复制')}>发货文案</Button>
          <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadFile(`${input.productId}-${stamp}.txt`, codes.join('\n') + '\n')}>TXT</Button>
          <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadFile(`${input.productId}-${stamp}.csv`, toCsv([
            ['卡密', '产品', '版本', '设备上限', '客户', '渠道', '订单号', '备注'],
            ...result.items.map(c => [c.cardCode, p.name, c.edition, c.maxDevices, c.customer, c.channel, c.orderNo, c.note])]), 'text/csv;charset=utf-8')}>CSV</Button>
        </div>
        <Button className="max-md:flex-1" onClick={onMore}>继续生成</Button>
        <Button className="max-md:flex-1" variant="primary" autoFocus icon={<Copy className="size-4" />} onClick={() => copy(codes.join('\n'), `已复制 ${codes.length} 张卡密`)}>{codes.length > 1 ? '复制全部' : '复制卡密'}</Button>
      </>}>
      <div className="grid gap-3">
        <div className="flex items-center gap-3 rounded-xl bg-ok-soft px-4 py-3.5 text-ok">
          <CheckCircle2 className="size-5 shrink-0" />
          <div><p className="font-semibold text-fg">已生成 {result.total} 张{p.name}卡密</p>
            <p className="text-xs text-fg-2">{input.edition} · 每卡 {input.maxDevices} 台{input.customer ? ` · ${input.customer}` : ''}</p></div>
        </div>
        <div className="grid max-h-[46dvh] gap-1.5 overflow-y-auto md:max-h-80">
          {result.items.map((card, i) => (
            <div key={card.cardId} className="flex items-center gap-1 rounded-lg border border-line bg-surface-2/40 py-1 pr-1 pl-3">
              <span className="tabular w-6 shrink-0 text-xs text-muted">{i + 1}</span>
              <code className="min-w-0 flex-1 font-mono text-[13px] break-all">{card.cardCode}</code>
              <CopyButton text={card.cardCode} label="复制卡密" toastText="卡密已复制" />
              <IconButton label="复制发货文案" size="sm" onClick={() => copy(deliveryText(settings, card, card.cardCode), '发货文案已复制')}><MessageSquareText className="size-4" /></IconButton>
              <IconButton label="打开详情" size="sm" onClick={() => onOpenCard(card.cardId)}><ExternalLink className="size-4" /></IconButton>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
