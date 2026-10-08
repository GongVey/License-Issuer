import { randomUUID } from 'node:crypto';
import { HttpError } from './lib.mjs';
import { fields, DEFAULT_PRODUCTS } from './cards.mjs';
import { audit } from './logs.mjs';

export const COLORS = ['teal', 'indigo', 'amber', 'rose', 'violet', 'sky', 'lime', 'slate'];
const DEFAULT_NAMES = { photoarchiver: '照片归档', wallpaper: '壁纸' };
export const DEFAULT_TEMPLATE = '您好，感谢购买 {product}！\n\n激活码：{cardCode}\n\n使用方法：打开软件 → 授权 → 粘贴激活码，联网激活一次后即可离线使用。\n每个激活码最多可在 {maxDevices} 台电脑上激活。';
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

function read(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  try { return row ? JSON.parse(row.value) : fallback; } catch { return fallback; }
}
const write = (db, key, value) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));

export function getSettings(db, config) {
  const ids = config.products || DEFAULT_PRODUCTS;
  const names = read(db, 'products', {});
  const templates = read(db, 'templates', {});
  return {
    products: ids.map((id, i) => ({ id, name: names[id]?.name || DEFAULT_NAMES[id] || id, color: COLORS.includes(names[id]?.color) ? names[id].color : COLORS[i % COLORS.length] })),
    templates: Object.fromEntries(ids.map(id => [id, typeof templates[id] === 'string' ? templates[id] : DEFAULT_TEMPLATE])),
    presets: read(db, 'presets', []).filter(preset => ids.includes(preset.productId)),
    editions: config.editions,
  };
}
function plain(value, label, max, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (multiline ? CONTROL : /[\u0000-\u001f]/).test(value)) throw new HttpError(400, `${label}格式无效（最多 ${max} 字）`, 'invalid_text');
  return value;
}
export function saveSettings(db, input, config, now) {
  fields(input, ['products', 'templates', 'presets']);
  const ids = config.products || DEFAULT_PRODUCTS;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (input.products !== undefined) {
      if (!Array.isArray(input.products) || input.products.length > ids.length) throw new HttpError(400, '产品设置格式无效', 'invalid_settings');
      const names = {};
      for (const item of input.products) {
        fields(item, ['id', 'name', 'color']);
        if (!ids.includes(item.id) || !COLORS.includes(item.color)) throw new HttpError(400, '产品设置格式无效', 'invalid_settings');
        names[item.id] = { name: plain(item.name, '产品名称', 40).trim() || item.id, color: item.color };
      }
      write(db, 'products', names);
    }
    if (input.templates !== undefined) {
      if (!input.templates || typeof input.templates !== 'object' || Array.isArray(input.templates) || Object.keys(input.templates).some(id => !ids.includes(id))) {
        throw new HttpError(400, '发货模板格式无效', 'invalid_settings');
      }
      write(db, 'templates', Object.fromEntries(Object.entries(input.templates).map(([id, value]) => [id, plain(value, '发货模板', 4000, true)])));
    }
    if (input.presets !== undefined) {
      if (!Array.isArray(input.presets) || input.presets.length > 12) throw new HttpError(400, '最多保存 12 个预设', 'invalid_settings');
      write(db, 'presets', input.presets.map(preset => {
        fields(preset, ['id', 'name', 'productId', 'edition', 'maxDevices', 'quantity']);
        if (!ids.includes(preset.productId) || !config.editions.includes(preset.edition) || ![preset.maxDevices, preset.quantity].every(n => Number.isInteger(n) && n >= 1 && n <= 100)) {
          throw new HttpError(400, '预设参数无效', 'invalid_settings');
        }
        return { id: typeof preset.id === 'string' && /^[a-f0-9-]{36}$/.test(preset.id) ? preset.id : randomUUID(),
          name: plain(preset.name, '预设名称', 40).trim() || '未命名预设', productId: preset.productId, edition: preset.edition, maxDevices: preset.maxDevices, quantity: preset.quantity };
      }));
    }
    audit(db, now, 'settings.update', '', Object.keys(input).join(','));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getSettings(db, config);
}
