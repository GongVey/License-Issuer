import { h, icon, replace } from '../dom.js';
import { api, query } from '../api.js';
import { busy, confirm, debounce, emptyState, pager, toast } from '../ui.js';
import { state } from '../state.js';
import { dateTime, productChip, timeEl } from '../format.js';
import { openGenerate } from '../generate.js';
import { navigate } from '../router.js';

export async function batches(root, params) {
  const filters = { q: params.get('q') || '', productId: params.get('productId') || '', offset: Number(params.get('offset')) || 0 };
  const search = h('input', { class: 'input', type: 'search', placeholder: '搜索客户、渠道或备注', value: filters.q, 'aria-label': '搜索批次' });
  const productSelect = h('select', { class: 'select', 'aria-label': '产品' }, h('option', { value: '' }, '全部产品'),
    state.settings.products.map(p => h('option', { value: p.id, selected: p.id === filters.productId }, p.name)));
  const body = h('div');
  replace(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, '批次'), h('p', null, '每次生成是一个批次，可整批导出含卡密的 CSV 或整批停用。')),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openGenerate() }, icon('plus'), '生成卡密'))),
    h('section', { class: 'panel' }, h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search), productSelect), body));

  async function load() {
    navigate('/batches', { q: filters.q, productId: filters.productId, offset: filters.offset || '' }, { replace: true, silent: true });
    const result = await api(`/api/batches${query(filters)}`);
    if (!result.items.length) { replace(body, emptyState('batches', '没有批次', filters.q || filters.productId ? '试试调整筛选条件。' : '生成卡密后会自动创建批次。')); return; }
    replace(body,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, '创建时间'), h('th', null, '产品'), h('th', null, '客户 / 备注'), h('th', { class: 'num' }, '数量'),
          h('th', null, '已激活'), h('th', { class: 'num hide-sm' }, '停用'), h('th', { class: 'actions-cell' }, ''))),
        h('tbody', null, result.items.map(row)))),
      pager({ ...result, onChange: offset => { filters.offset = offset; reload(); } }));
  }
  const reload = () => load().catch(error => replace(body, emptyState('alert', '加载失败', error.message)));

  function row(batch) {
    const exportCodes = h('button', { class: 'btn btn-sm', type: 'button', title: '导出这一批的 CSV（包含卡密明文）', onclick: event => { event.stopPropagation(); location.href = `/api/cards/export${query({ batchId: batch.batchId, codes: 1 })}`; } }, icon('download'), h('span', { class: 'hide-mobile' }, '导出'));
    const allDisabled = batch.cards > 0 && batch.disabled === batch.cards;
    const toggle = h('button', { class: 'btn btn-sm btn-ghost', type: 'button', disabled: batch.cards === 0 }, icon(allDisabled ? 'play' : 'ban'), h('span', { class: 'hide-mobile' }, allDisabled ? '整批恢复' : '整批停用'));
    toggle.addEventListener('click', event => {
      event.stopPropagation();
      const status = allDisabled ? 'active' : 'disabled';
      const run = async () => { await api(`/api/batches/${batch.batchId}`, 'PATCH', { status }); toast(allDisabled ? '已恢复整批' : '已停用整批'); await reload(); };
      if (status === 'disabled') confirm({ title: `停用这一批 ${batch.cards} 张卡密？`, message: '整批停用后所有激活请求都会被拒绝，可随时整批恢复。', confirmText: '整批停用', action: run });
      else busy(toggle, run);
    });
    const open = () => navigate('/cards', { batchId: batch.batchId });
    const ratio = batch.cards ? batch.activatedCards / batch.cards : 0;
    const bar = h('span', { class: 'meter-bar' }, h('i')); bar.firstChild.style.width = `${ratio * 100}%`;
    return h('tr', { tabindex: '0', onclick: open, onkeydown: event => { if (event.key === 'Enter') open(); }, title: '查看这一批卡密' },
      h('td', { class: 'nowrap' }, h('div', null, timeEl(batch.createdAt)), h('div', { class: 'secondary' }, dateTime(batch.createdAt))),
      h('td', null, productChip(batch.productId), h('div', { class: 'secondary' }, `${batch.edition} · 每卡 ${batch.maxDevices} 台`)),
      h('td', { class: 'truncate' }, h('div', { class: 'primary truncate' }, batch.customer || batch.note || '—'), h('div', { class: 'secondary truncate' }, [batch.customer && batch.note, batch.channel].filter(Boolean).join(' · '))),
      h('td', { class: 'num' }, batch.cards === batch.quantity ? batch.cards : h('span', { title: `原生成 ${batch.quantity} 张，已删除 ${batch.quantity - batch.cards} 张` }, `${batch.cards}/${batch.quantity}`)),
      h('td', null, h('span', { class: 'meter' }, bar, `${batch.activatedCards}/${batch.cards}`)),
      h('td', { class: 'num hide-sm' }, batch.disabled || '—'),
      h('td', { class: 'actions-cell' }, h('div', { class: 'row' }, exportCodes, toggle)));
  }

  search.addEventListener('input', debounce(() => { filters.q = search.value.trim(); filters.offset = 0; reload(); }));
  productSelect.addEventListener('change', () => { filters.productId = productSelect.value; filters.offset = 0; reload(); });
  await reload();
}
