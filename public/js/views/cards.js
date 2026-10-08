import { h, icon, replace } from '../dom.js';
import { api, query } from '../api.js';
import { busy, confirm, debounce, emptyState, pager, toast } from '../ui.js';
import { state, onChange, storage } from '../state.js';
import { cardSubtitle, cardTitle, meter, productChip, stateBadge, timeEl } from '../format.js';
import { openCard } from '../card-drawer.js';
import { openGenerate } from '../generate.js';
import { navigate } from '../router.js';

const STATES = [['', '全部'], ['unused', '未使用'], ['partial', '部分激活'], ['full', '已满'], ['disabled', '已停用']];
const selected = new Map(); // Survives paging and filtering within this page visit.

export async function cards(root, params) {
  selected.clear();
  const filters = { q: params.get('q') || '', productId: params.get('productId') || '', state: params.get('state') || '', batchId: params.get('batchId') || '',
    offset: Number(params.get('offset')) || 0, limit: Number(params.get('limit')) || Number(storage.get('cards:limit', 30)) || 30 };
  const sync = () => navigate('/cards', { q: filters.q, productId: filters.productId, state: filters.state, batchId: filters.batchId, offset: filters.offset || '', limit: filters.limit === 30 ? '' : filters.limit }, { replace: true, silent: true });
  const batch = filters.batchId ? await api(`/api/batches/${filters.batchId}`).catch(() => null) : null;

  const search = h('input', { class: 'input', type: 'search', placeholder: '搜索客户、备注、订单号、渠道或卡 ID', value: filters.q, 'aria-label': '搜索卡密', id: 'cards-search' });
  const productSelect = h('select', { class: 'select', 'aria-label': '产品' }, h('option', { value: '' }, '全部产品'),
    state.settings.products.map(p => h('option', { value: p.id, selected: p.id === filters.productId }, p.name)));
  const stateButtons = STATES.map(([value, label]) => h('button', { type: 'button', 'aria-pressed': String(value === filters.state), dataset: { value } }, label));
  const segmented = h('div', { class: 'segmented', role: 'group', 'aria-label': '状态' }, stateButtons);
  const count = h('span', { class: 'muted' });
  const bulk = h('div', { class: 'bulkbar', hidden: true });
  const body = h('div');
  const exportButton = h('button', { class: 'btn', type: 'button', title: '按当前筛选导出 CSV（不含卡密明文）' }, icon('download'), h('span', { class: 'hide-mobile' }, '导出'));

  replace(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, '卡密'), h('p', null, count)),
      h('div', { class: 'page-actions' }, exportButton, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openGenerate({ productId: filters.productId || undefined }) }, icon('plus'), '生成卡密'))),
    h('section', { class: 'panel' },
      h('div', { class: 'toolbar' },
        h('div', { class: 'search' }, icon('search'), search), productSelect, segmented,
        batch ? h('span', { class: 'filter-chip' }, `批次：${batch.customer || batch.note || batch.batchId.slice(0, 8)}（${batch.cards} 张）`,
          h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '清除批次筛选', onclick: () => navigate('/cards', { productId: filters.productId, state: filters.state }) }, icon('x'))) : null),
      bulk, body));

  let version = 0;
  async function load() {
    const mine = ++version;
    sync();
    const result = await api(`/api/cards${query({ q: filters.q, productId: filters.productId, state: filters.state, batchId: filters.batchId, offset: filters.offset, limit: filters.limit })}`);
    if (mine !== version) return;
    if (filters.offset > 0 && filters.offset >= result.total) { filters.offset = Math.max(0, Math.floor((result.total - 1) / filters.limit) * filters.limit); return load(); }
    count.textContent = `共 ${result.total} 张${filters.q || filters.productId || filters.state || filters.batchId ? '符合条件' : ''}`;
    renderTable(result);
  }
  const reload = () => load().catch(error => replace(body, emptyState('alert', '加载失败', error.message)));

  function renderTable(result) {
    if (!result.items.length) {
      const filtered = filters.q || filters.productId || filters.state || filters.batchId;
      replace(body, emptyState('cards', filtered ? '没有符合条件的卡密' : '还没有卡密', filtered ? '试试调整搜索词或筛选条件。' : '生成第一批卡密，发给客户激活即可。',
        filtered ? null : h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openGenerate() }, icon('plus'), '生成卡密')));
      return;
    }
    const all = h('input', { type: 'checkbox', 'aria-label': '选择本页全部' });
    const boxes = [];
    const updateAll = () => {
      const on = result.items.filter(card => selected.has(card.cardId)).length;
      all.checked = on === result.items.length; all.indeterminate = on > 0 && on < result.items.length;
      renderBulk();
    };
    all.addEventListener('change', () => {
      for (const card of result.items) all.checked ? selected.set(card.cardId, card) : selected.delete(card.cardId);
      boxes.forEach(box => { box.checked = all.checked; box.closest('tr').classList.toggle('selected', all.checked); });
      updateAll();
    });
    const rows = result.items.map(card => {
      const box = h('input', { type: 'checkbox', checked: selected.has(card.cardId), 'aria-label': `选择 ${cardTitle(card)}` });
      boxes.push(box);
      box.addEventListener('click', event => event.stopPropagation());
      box.addEventListener('change', () => { box.checked ? selected.set(card.cardId, card) : selected.delete(card.cardId); row.classList.toggle('selected', box.checked); updateAll(); });
      const subtitle = cardSubtitle(card);
      const row = h('tr', { class: selected.has(card.cardId) ? 'selected' : '', tabindex: '0', onclick: () => openCard(card.cardId),
        onkeydown: event => { if (event.key === 'Enter') openCard(card.cardId); if (event.key === ' ') { event.preventDefault(); box.click(); } } },
        h('td', { class: 'check', onclick: event => { event.stopPropagation(); if (event.target === event.currentTarget) box.click(); } }, box),
        h('td', null, productChip(card.productId)),
        h('td', { class: 'truncate' }, h('div', { class: 'primary truncate' }, cardTitle(card)), subtitle ? h('div', { class: 'secondary truncate' }, subtitle) : null),
        h('td', null, meter(card.usedDevices, card.maxDevices)),
        h('td', null, stateBadge(card.state)),
        h('td', { class: 'hide-sm muted nowrap' }, card.lastSeenAt ? timeEl(card.lastSeenAt) : '—'),
        h('td', { class: 'hide-sm muted nowrap' }, timeEl(card.issuedAt)));
      return row;
    });
    replace(body,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', { class: 'check' }, all), h('th', null, '产品'), h('th', null, '客户 / 备注'), h('th', null, '设备'), h('th', null, '状态'),
          h('th', { class: 'hide-sm' }, '最近活跃'), h('th', { class: 'hide-sm' }, '创建'))),
        h('tbody', null, rows))),
      pager({ ...result, limit: filters.limit, sizes: [30, 50, 100], onChange: (offset, limit) => { filters.offset = offset; if (limit !== filters.limit) storage.set('cards:limit', String(limit)); filters.limit = limit; reload(); } }));
    updateAll();
  }

  function renderBulk() {
    bulk.hidden = selected.size === 0;
    if (!selected.size) return;
    const ids = [...selected.keys()];
    const devices = [...selected.values()].reduce((sum, card) => sum + card.usedDevices, 0);
    const setStatus = status => async event => {
      const run = async () => { const r = await api('/api/cards/batch', 'PATCH', { cardIds: ids, status }); toast(`已${status === 'active' ? '恢复' : '停用'} ${r.updated} 张`); selected.clear(); await reload(); };
      if (status === 'disabled') confirm({ title: `停用所选 ${ids.length} 张卡密？`, message: '停用后这些卡的所有激活请求都会被拒绝，可随时恢复。', confirmText: '停用', action: run });
      else busy(event.currentTarget, run);
    };
    replace(bulk,
      h('strong', null, `已选 ${ids.length} 张`),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: setStatus('disabled') }, icon('ban'), '停用'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: setStatus('active') }, icon('play'), '恢复'),
      h('button', { class: 'btn btn-sm btn-danger-ghost', type: 'button', onclick: () => confirm({
        title: `永久删除 ${ids.length} 张卡密？`, message: `将同时删除 ${devices} 条设备激活记录，此操作不可恢复。`, detail: '已签发的离线许可证不受影响。',
        confirmText: '删除', typeToConfirm: ids.length > 1 ? ids.length : undefined,
        action: async () => { const r = await api('/api/cards/batch', 'DELETE', { cardIds: ids, confirmed: true }); toast(`已删除 ${r.deleted} 张`); selected.clear(); await reload(); },
      }) }, icon('trash'), '删除'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => { selected.clear(); reload(); } }, '取消选择'));
    if (ids.length > 100) { toast('批量操作一次最多 100 张', 'error'); }
  }

  const refilter = () => { filters.offset = 0; reload(); };
  search.addEventListener('input', debounce(() => { filters.q = search.value.trim(); refilter(); }, 250));
  productSelect.addEventListener('change', () => { filters.productId = productSelect.value; refilter(); });
  for (const button of stateButtons) button.addEventListener('click', () => {
    filters.state = button.dataset.value;
    stateButtons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    refilter();
  });
  exportButton.addEventListener('click', () => {
    location.href = `/api/cards/export${query({ q: filters.q, productId: filters.productId, state: filters.state, batchId: filters.batchId })}`;
  });
  const stop = onChange(topic => { if (topic === 'cards' && root.isConnected) reload(); });
  await reload();
  return () => stop();
}
