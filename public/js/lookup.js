import { h, icon, replace } from './dom.js';
import { api } from './api.js';
import { debounce } from './ui.js';
import { cardSubtitle, cardTitle, dateTime, meter, productChip, shortFingerprint, stateBadge } from './format.js';
import { openCard } from './card-drawer.js';

const KINDS = { cardCode: '按卡密匹配', machine: '按机器码匹配', id: '按 ID 匹配', text: '按客户 / 备注 / 订单号搜索' };
let open = null;

export function openLookup(initial = '') {
  if (open) { open.querySelector('input').focus(); return; }
  const input = h('input', { type: 'search', placeholder: '粘贴卡密、机器码、卡 ID，或输入客户名 / 订单号', autocomplete: 'off', spellcheck: 'false', 'aria-label': '快速查找', value: initial });
  const results = h('div', { class: 'palette-results', role: 'listbox' });
  const dialog = h('dialog', { class: 'palette', 'aria-label': '快速查找' },
    h('div', { class: 'palette-input' }, icon('search'), input, h('kbd', null, 'Esc')),
    results,
    h('div', { class: 'palette-foot' }, h('span', null, h('kbd', null, '↑'), ' ', h('kbd', null, '↓'), ' 选择'), h('span', null, h('kbd', null, 'Enter'), ' 打开')));
  open = dialog;
  dialog.addEventListener('close', () => { dialog.remove(); open = null; });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();

  let items = []; let active = 0; let version = 0;
  const select = index => {
    active = Math.max(0, Math.min(items.length - 1, index));
    items.forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    items[active]?.scrollIntoView({ block: 'nearest' });
  };
  const hint = () => replace(results, h('div', { class: 'hint' },
    h('span', null, '· 客户发来卡密 → 直接粘贴，定位到对应卡'),
    h('span', null, '· 客户发来机器码（sha256:…）→ 查看这台电脑绑定的卡'),
    h('span', null, '· 也可以搜客户名、渠道、订单号、备注')));
  const search = debounce(async () => {
    const value = input.value.trim();
    const mine = ++version;
    if (!value) { items = []; hint(); return; }
    try {
      const result = await api('/api/lookup', 'POST', { query: value });
      if (mine !== version) return;
      items = result.cards.map(card => h('button', { class: 'result', type: 'button', role: 'option', onclick: () => { dialog.close(); openCard(card.cardId); } },
        productChip(card.productId),
        h('span', { class: 'truncate' }, h('span', null, cardTitle(card)), h('span', { class: 'meta' }, ' ', cardSubtitle(card) || dateTime(card.issuedAt))),
        h('span', { class: 'row' }, meter(card.usedDevices, card.maxDevices), ' ', stateBadge(card.state))));
      const legacy = result.legacy.map(license => h('div', { class: 'result' }, h('span', { class: 'badge plain neutral' }, 'PA1'),
        h('span', { class: 'truncate' }, license.note || license.licenseId, h('span', { class: 'meta' }, ` ${shortFingerprint(license.machineFingerprint)}`)), h('span', { class: 'meta' }, dateTime(license.issuedAt))));
      replace(results,
        h('div', { class: 'hint' }, h('span', null, `${KINDS[result.kind] || ''} · ${result.cards.length} 张卡密${result.legacy.length ? `，${result.legacy.length} 条旧版许可证` : ''}`)),
        items.length || legacy.length ? [items, legacy] : h('div', { class: 'hint' }, result.kind === 'cardCode' ? '没有找到这张卡密：可能已被删除，或卡密抄写有误。' : '没有匹配的结果。'));
      select(0);
    } catch (error) { if (mine === version) replace(results, h('div', { class: 'hint' }, error.message)); }
  }, 200);
  input.addEventListener('input', search);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); select(active + 1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); select(active - 1); }
    if (event.key === 'Enter') { event.preventDefault(); items[active]?.click(); }
  });
  initial ? search() : hint();
  input.focus();
}
