import { h, replace } from '../dom.js';
import { api, query } from '../api.js';
import { emptyState, pager } from '../ui.js';
import { state } from '../state.js';
import { AUDIT, dateTime, product, resultBadge, shortFingerprint, timeEl } from '../format.js';
import { openCard } from '../card-drawer.js';
import { navigate } from '../router.js';

export async function logs(root, params) {
  const tab = params.get('tab') === 'audit' ? 'audit' : 'activation';
  const filters = { result: params.get('result') || '', productId: params.get('productId') || '', offset: Number(params.get('offset')) || 0 };
  const body = h('div');
  const tabs = h('nav', { class: 'tabs' },
    h('a', { href: '#/logs', 'aria-current': tab === 'activation' ? 'page' : undefined }, '激活记录'),
    h('a', { href: '#/logs?tab=audit', 'aria-current': tab === 'audit' ? 'page' : undefined }, '操作日志'));
  const toolbar = tab === 'activation' ? h('div', { class: 'toolbar' },
    h('div', { class: 'segmented', role: 'group', 'aria-label': '结果' }, [['', '全部'], ['ok', '成功'], ['failed', '失败']].map(([value, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(filters.result === value), onclick: () => navigate('/logs', { ...filters, result: value, offset: '' }) }, label))),
    h('select', { class: 'select', 'aria-label': '产品', onchange: e => navigate('/logs', { ...filters, productId: e.target.value, offset: '' }) },
      h('option', { value: '' }, '全部产品'), state.settings.products.map(p => h('option', { value: p.id, selected: p.id === filters.productId }, p.name)))) : null;
  replace(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, '日志'), h('p', null, tab === 'activation' ? '客户端的每次激活请求（保留 180 天），排查「激活失败」时先看这里。' : '后台的生成、停用、删除、释放、查看卡密等操作。'))),
    tabs, h('section', { class: 'panel' }, toolbar, body));

  try {
    if (tab === 'activation') {
      const result = await api(`/api/activation-log${query(filters)}`);
      if (!result.items.length) { replace(body, emptyState('activity', '暂无记录', '客户端发起激活后会记录在这里。')); return; }
      replace(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, '时间'), h('th', null, '结果'), h('th', null, '产品'), h('th', null, '卡密'), h('th', { class: 'hide-sm' }, '机器码'))),
        h('tbody', null, result.items.map(item => h('tr', { tabindex: item.cardExists ? '0' : undefined, onclick: () => item.cardExists && openCard(item.cardId),
          onkeydown: event => { if (event.key === 'Enter' && item.cardExists) openCard(item.cardId); } },
          h('td', { class: 'nowrap' }, h('div', null, timeEl(item.at)), h('div', { class: 'secondary' }, dateTime(item.at))),
          h('td', null, resultBadge(item.result)),
          h('td', null, item.productId ? product(item.productId).name : '—'),
          h('td', { class: 'truncate' }, item.cardExists ? (item.customer || item.note || `卡密 ${item.cardId.slice(0, 8)}`) : h('span', { class: 'muted' }, item.cardId ? '已删除' : '—')),
          h('td', { class: 'hide-sm mono muted', title: item.machineFingerprint || '' }, shortFingerprint(item.machineFingerprint))))))),
        pager({ ...result, onChange: offset => navigate('/logs', { ...filters, offset }) }));
    } else {
      const result = await api(`/api/audit-log${query({ offset: filters.offset })}`);
      if (!result.items.length) { replace(body, emptyState('activity', '暂无操作记录')); return; }
      replace(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, '时间'), h('th', null, '操作'), h('th', null, '对象'), h('th', null, '详情'))),
        h('tbody', null, result.items.map(item => {
          const isCard = item.action.startsWith('card.') || item.action === 'device.release';
          return h('tr', { onclick: () => isCard && item.target && openCard(item.target) },
            h('td', { class: 'nowrap' }, h('div', null, timeEl(item.at)), h('div', { class: 'secondary' }, dateTime(item.at))),
            h('td', null, AUDIT[item.action] || item.action),
            h('td', { class: 'mono muted' }, item.target ? item.target.slice(0, 8) : '—'),
            h('td', { class: 'truncate muted' }, item.action === 'device.release' ? shortFingerprint(item.detail) : item.detail || '—'));
        })))),
        pager({ ...result, onChange: offset => navigate('/logs', { tab: 'audit', offset }) }));
    }
  } catch (error) { replace(body, emptyState('alert', '加载失败', error.message)); }
}
