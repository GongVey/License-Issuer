import { h, icon, replace } from '../dom.js';
import { api, query } from '../api.js';
import { copyButton, debounce, emptyState, modal, pager } from '../ui.js';
import { dateTime, shortFingerprint } from '../format.js';

// Read-only view of legacy PhotoArchiver PA1 single-machine licenses.
export async function legacy(root) {
  const filters = { q: '', offset: 0 };
  const search = h('input', { class: 'input', type: 'search', placeholder: '搜索备注、机器码或许可证 ID', 'aria-label': '搜索旧版许可证' });
  const body = h('div');
  replace(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, '旧版 PA1 许可证'), h('p', null, '照片归档早期按机器码手工签发的许可证，仅供查询，新授权请使用卡密。'))),
    h('section', { class: 'panel' }, h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search)), body));
  async function load() {
    try {
      const result = await api(`/api/licenses${query(filters)}`);
      if (!result.items.length) { replace(body, emptyState('archive', filters.q ? '没有匹配的许可证' : '没有旧版许可证')); return; }
      replace(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, '签发时间'), h('th', null, '备注'), h('th', null, '机器码'), h('th', null, '版本'), h('th', null, '状态'))),
        h('tbody', null, result.items.map(item => h('tr', { tabindex: '0', onclick: () => show(item.licenseId), onkeydown: e => { if (e.key === 'Enter') show(item.licenseId); } },
          h('td', { class: 'nowrap' }, dateTime(item.issuedAt)), h('td', { class: 'truncate' }, item.note || '—'),
          h('td', { class: 'mono muted' }, shortFingerprint(item.machineFingerprint)), h('td', null, item.edition),
          h('td', null, h('span', { class: `badge ${item.status === 'active' ? 'ok' : 'neutral'}` }, item.status === 'active' ? '有效' : '已归档'))))))),
        pager({ offset: result.offset, limit: 30, total: result.total, onChange: offset => { filters.offset = offset; load(); } }));
    } catch (error) { replace(body, emptyState('alert', '加载失败', error.message)); }
  }
  async function show(id) {
    const record = await api(`/api/licenses/${id}`);
    modal({ title: '旧版许可证', description: record.note || record.licenseId, className: 'wide',
      body: h('dl', { class: 'kv' },
        h('dt', null, '许可证 ID'), h('dd', null, record.licenseId),
        h('dt', null, '机器码'), h('dd', null, h('span', { class: 'code-chip' }, record.machineFingerprint, copyButton(record.machineFingerprint, '复制机器码'))),
        h('dt', null, '版本'), h('dd', null, record.edition),
        h('dt', null, '签发时间'), h('dd', null, dateTime(record.issuedAt)),
        h('dt', null, '许可证'), h('dd', null, h('div', { class: 'code-box' }, h('code', null, record.code), copyButton(record.code, '复制许可证', '许可证已复制')))) });
  }
  search.addEventListener('input', debounce(() => { filters.q = search.value.trim(); filters.offset = 0; load(); }));
  await load();
}
