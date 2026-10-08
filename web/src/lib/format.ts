import type { Card, CardState, Settings } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
export function dateTime(ms?: number | null) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function relative(ms?: number | null, now = Date.now()) {
  if (!ms) return '—';
  const diff = now - ms;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 30 * 86400000) return `${Math.floor(diff / 86400000)} 天前`;
  return dateTime(ms).slice(0, 10);
}
export const shortFingerprint = (fp?: string | null) => fp ? `${fp.slice(0, 13)}…${fp.slice(-6)}` : '—';
export const shortId = (id?: string | null) => id ? id.slice(0, 8) : '—';

export const STATE_LABEL: Record<CardState, string> = { unused: '未使用', partial: '部分激活', full: '已满', disabled: '已停用' };
export const STATE_HINT: Record<CardState, string> = { unused: '尚未激活，可售库存', partial: '已激活，仍有剩余名额', full: '设备名额已用完', disabled: '拒绝任何激活请求' };
export const RESULT: Record<string, [string, 'ok' | 'neutral' | 'fail']> = {
  activated: ['新设备激活', 'ok'], renewed: ['重复激活', 'neutral'], device_limit: ['设备已满', 'fail'], card_disabled: ['卡已停用', 'fail'],
  card_not_found: ['卡密无效', 'fail'], unknown_product: ['未知产品', 'fail'], invalid_request: ['请求无效', 'fail'],
};
export const AUDIT: Record<string, string> = {
  'cards.create': '生成卡密', 'cards.delete': '删除卡密', 'cards.enable': '批量恢复', 'cards.disable': '批量停用', 'cards.export': '导出卡密',
  'card.enable': '恢复卡密', 'card.disable': '停用卡密', 'card.edit': '编辑信息', 'card.reveal': '查看卡密', 'device.release': '释放设备',
  'batch.enable': '恢复整批', 'batch.disable': '停用整批', 'settings.update': '修改设置', 'backup.download': '下载备份', 'account.update': '修改账号',
};
export const CHANNELS = ['闲鱼', '淘宝', '微信', '小红书', '直售', '赠送', '测试'];

export const cardTitle = (card: Pick<Card, 'customer' | 'note' | 'cardId'>) => card.customer || card.note || `卡密 ${shortId(card.cardId)}`;
export const cardSubtitle = (card: Card) => [card.customer && card.note ? card.note : '', card.channel, card.orderNo && `#${card.orderNo}`].filter(Boolean).join(' · ');

export const fillTemplate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
export function deliveryText(settings: Settings, card: Pick<Card, 'productId' | 'edition' | 'maxDevices' | 'customer'>, cardCode: string) {
  const product = settings.products.find(p => p.id === card.productId);
  return fillTemplate(settings.templates[card.productId] || '{cardCode}', {
    cardCode, product: product?.name || card.productId, productId: card.productId, edition: card.edition, maxDevices: card.maxDevices, customer: card.customer || '',
  });
}
export function toCsv(rows: Array<Array<string | number | null | undefined>>) {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // Prevent spreadsheet formula execution.
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return '﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
