import { h } from './dom.js';
import { state } from './state.js';

const pad = n => String(n).padStart(2, '0');
export function dateTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function relative(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 30 * 86400000) return `${Math.floor(diff / 86400000)} 天前`;
  return dateTime(ms).slice(0, 10);
}
export const timeEl = ms => h('time', { datetime: ms ? new Date(ms).toISOString() : undefined, title: dateTime(ms) }, relative(ms));
export const shortFingerprint = fp => fp ? `${fp.slice(0, 13)}…${fp.slice(-6)}` : '—';
export const shortId = id => id ? id.slice(0, 8) : '—';
export const maskCode = () => 'LIC-•••••••• •••• ••••••••';

export const STATE = {
  unused: { label: '未使用', hint: '尚未激活，可售库存' },
  partial: { label: '部分激活', hint: '已激活，仍有剩余设备名额' },
  full: { label: '已满', hint: '设备名额已用完' },
  disabled: { label: '已停用', hint: '拒绝任何激活请求' },
};
export const stateBadge = s => h('span', { class: `badge state-${s}`, title: STATE[s]?.hint }, STATE[s]?.label || s);

export const RESULT = {
  activated: ['新设备激活', 'ok'], renewed: ['重复激活', 'neutral'],
  device_limit: ['设备已满', 'fail'], card_disabled: ['卡已停用', 'fail'], card_not_found: ['卡密无效', 'fail'],
  unknown_product: ['未知产品', 'fail'], invalid_request: ['请求无效', 'fail'],
};
export const resultBadge = r => h('span', { class: `badge ${(RESULT[r] || [])[1] || 'fail'}` }, (RESULT[r] || [r])[0]);

export const AUDIT = {
  'cards.create': '生成卡密', 'cards.delete': '删除卡密', 'cards.enable': '批量恢复', 'cards.disable': '批量停用', 'cards.export': '导出卡密',
  'card.enable': '恢复卡密', 'card.disable': '停用卡密', 'card.edit': '编辑信息', 'card.reveal': '查看卡密', 'device.release': '释放设备',
  'batch.enable': '恢复整批', 'batch.disable': '停用整批', 'settings.update': '修改设置', 'backup.download': '下载备份', 'account.update': '修改账号',
};

export function product(id) {
  const info = state.settings?.products.find(p => p.id === id);
  return info || { id, name: id || '—', color: 'slate' };
}
export const productChip = id => {
  const p = product(id);
  return h('span', { class: 'product', dataset: { color: p.color }, title: p.id }, h('span', { class: 'dot' }), p.name);
};
export function meter(used, max) {
  const track = max <= 5
    ? h('span', { class: 'meter-track', 'aria-hidden': 'true' }, Array.from({ length: max }, (_, i) => h('i', { class: i < used ? 'on' : '' })))
    : h('span', { class: 'meter-bar', 'aria-hidden': 'true' }, h('i'));
  // CSSOM writes are allowed under the strict style-src CSP; style attributes are not.
  if (max > 5) track.firstChild.style.width = `${Math.min(100, used / max * 100)}%`;
  return h('span', { class: 'meter', title: `已激活 ${used} 台，上限 ${max} 台` }, track, `${used}/${max}`);
}
export const cardTitle = card => card.customer || card.note || `卡密 ${shortId(card.cardId)}`;
export function cardSubtitle(card) {
  const parts = [card.customer && card.note ? card.note : '', card.channel, card.orderNo && `#${card.orderNo}`].filter(Boolean);
  return parts.join(' · ');
}
export function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (values[key] ?? match));
}
export function deliveryText(card, cardCode) {
  const p = product(card.productId);
  return fillTemplate(state.settings?.templates[card.productId] || '{cardCode}', {
    cardCode, product: p.name, productId: card.productId, edition: card.edition, maxDevices: card.maxDevices, customer: card.customer || '',
  });
}
