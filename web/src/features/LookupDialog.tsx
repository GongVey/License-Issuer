import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { cardSubtitle, cardTitle, dateTime } from '../lib/format';
import { useDebounced } from '../lib/hooks';
import type { LookupResult } from '../lib/types';
import { useOverlays } from '../overlays';
import { useSession } from '../session';
import { IconButton } from '../ui/controls';
import { Meter, ProductChip, StateBadge } from '../ui/display';

const KIND: Record<string, string> = { cardCode: '按卡密匹配', machine: '按机器码匹配', id: '按 ID 匹配', text: '按客户 / 备注 / 订单号搜索' };

export function LookupDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { product } = useSession();
  const { openCard } = useOverlays();
  const [query, setQuery] = useState(initial);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim(), 200);
  const result = useQuery({ queryKey: ['lookup', debounced], enabled: Boolean(debounced), queryFn: () => api<LookupResult>('/api/lookup', 'POST', { query: debounced }) });
  const cards = debounced ? result.data?.cards ?? [] : [];

  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!; if (!dialog.open) dialog.showModal(); input.current?.focus();
    const cancel = (e: Event) => { e.preventDefault(); closeRef.current(); };
    const click = (e: MouseEvent) => { if (e.target === dialog) closeRef.current(); };
    dialog.addEventListener('cancel', cancel); dialog.addEventListener('click', click);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('click', click); };
  }, []);
  useEffect(() => setActive(0), [debounced]);
  const choose = (id: string) => { onClose(); openCard(id); };

  return (
    <dialog ref={ref} aria-label="快速查找"
      className="anim-pop m-0 h-dvh w-full flex-col overflow-hidden open:flex md:mx-auto md:mt-[12vh] md:h-auto md:max-h-[70vh] md:w-[620px] md:rounded-2xl md:border md:border-line md:shadow-lg">
      <div className="flex items-center gap-2 border-b border-line px-3 pt-[env(safe-area-inset-top)] md:px-4">
        <IconButton label="返回" className="md:hidden" onClick={onClose}><ArrowLeft className="size-5" /></IconButton>
        <Search className="hidden size-5 text-muted md:block" />
        <input ref={input} type="text" inputMode="search" enterKeyHint="search" value={query} onChange={e => setQuery(e.target.value)} spellCheck={false} autoComplete="off" aria-label="快速查找"
          placeholder="粘贴卡密、机器码，或输入客户 / 订单号"
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(cards.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && cards[active]) { e.preventDefault(); choose(cards[active].cardId); }
          }}
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted" />
        <kbd className="hidden rounded-md border border-line-strong px-1.5 font-mono text-[11px] text-muted md:block">Esc</kbd>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!debounced ? (
          <div className="grid gap-2 px-3 py-4 text-[13px] text-muted">
            <p>· 客户发来卡密 → 直接粘贴，定位到对应的卡</p>
            <p>· 客户发来机器码（sha256:…）→ 查看这台电脑绑定的卡</p>
            <p>· 也可以搜客户名、渠道、订单号、备注</p>
          </div>
        ) : result.isLoading ? <p className="px-3 py-4 text-[13px] text-muted">查找中…</p>
          : result.error ? <p className="px-3 py-4 text-[13px] text-danger">{(result.error as Error).message}</p> : <>
            <p className="px-3 pt-2 pb-2 text-xs text-muted">{KIND[result.data?.kind || ''] || ''} · {cards.length} 张卡密</p>
            {cards.length === 0 && <p className="px-3 py-4 text-[13px] text-muted">{result.data?.kind === 'cardCode' ? '没有找到这张卡密：可能已被删除，或卡密抄写有误。' : '没有匹配的结果。'}</p>}
            {cards.map((card, i) => (
              <button key={card.cardId} type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(card.cardId)}
                className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 text-left md:grid-cols-[110px_minmax(0,1fr)_auto]', i === active && 'bg-surface-2')}>
                <ProductChip product={product(card.productId)} className="text-[13px] max-md:col-span-2" />
                <span className="min-w-0"><span className="block truncate font-medium">{cardTitle(card)}</span><span className="block truncate text-xs text-muted">{cardSubtitle(card) || dateTime(card.issuedAt)}</span></span>
                <span className="flex items-center gap-2"><Meter used={card.usedDevices} max={card.maxDevices} /><StateBadge state={card.state} /></span>
              </button>
            ))}
          </>}
      </div>
    </dialog>
  );
}
