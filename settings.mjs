import { randomUUID } from 'node:crypto';
import { HttpError } from './lib.mjs';
import { fields, DEFAULT_PRODUCTS } from './cards.mjs';
import { audit } from './logs.mjs';

// Product identity colors are free-form hex so new products are not limited to a fixed set of CSS classes.
// New products without a saved color take the next palette entry.
export const PALETTE = ['#2f7ae5', '#e4572e', '#0f9488', '#7c5cdb', '#d08a0e', '#d6457a', '#3a9b4a', '#64748b'];
const LEGACY_COLORS = { teal: '#0f9488', indigo: '#4f5bd5', amber: '#d08a0e', rose: '#d6457a', violet: '#7c5cdb', sky: '#2f7ae5', koi: '#e4572e', slate: '#64748b', lime: '#5d8f12' };
const DEFAULT_NAMES = { photoarchiver: '照片归档', wallpaper: '一池锦鲤' };
const DEFAULT_COLORS = { photoarchiver: '#2f7ae5', wallpaper: '#e4572e' };
const HEX = /^#[0-9a-f]{6}$/i;
export const DEFAULT_BRANDING = { name: '知白Studio', tagline: '软件授权与卡密管理', accent: '#4f46e5', showProducts: true };
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
  const color = (id, i) => {
    const saved = names[id]?.color;
    return (HEX.test(saved) ? saved : LEGACY_COLORS[saved] || DEFAULT_COLORS[id] || PALETTE[i % PALETTE.length]).toLowerCase();
  };
  return {
    branding: getBranding(db),
    products: ids.map((id, i) => ({ id, name: names[id]?.name || DEFAULT_NAMES[id] || id, color: color(id, i) })),
    templates: Object.fromEntries(ids.map(id => [id, typeof templates[id] === 'string' ? templates[id] : DEFAULT_TEMPLATE])),
    presets: read(db, 'presets', []).filter(preset => ids.includes(preset.productId)),
    editions: config.editions,
  };
}
export function getBranding(db) {
  const saved = read(db, 'branding', {});
  return {
    name: typeof saved.name === 'string' && saved.name.trim() ? saved.name : DEFAULT_BRANDING.name,
    tagline: typeof saved.tagline === 'string' ? saved.tagline : DEFAULT_BRANDING.tagline,
    accent: HEX.test(saved.accent) ? saved.accent.toLowerCase() : DEFAULT_BRANDING.accent,
    showProducts: typeof saved.showProducts === 'boolean' ? saved.showProducts : DEFAULT_BRANDING.showProducts,
  };
}
// Unauthenticated: only what the sign-in page renders. Product names are included only when the administrator allows it.
export function getPublicBranding(db, config) {
  const { branding, products } = getSettings(db, config);
  return { ...branding, products: branding.showProducts ? products.map(({ id, name, color }) => ({ id, name, color })) : [] };
}
function plain(value, label, max, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (multiline ? CONTROL : /[\u0000-\u001f]/).test(value)) throw new HttpError(400, `${label}格式无效（最多 ${max} 字）`, 'invalid_text');
  return value;
}
export function saveSettings(db, input, config, now) {
  fields(input, ['products', 'templates', 'presets', 'branding']);
  const ids = config.products || DEFAULT_PRODUCTS;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (input.products !== undefined) {
      if (!Array.isArray(input.products) || input.products.length > ids.length) throw new HttpError(400, '产品设置格式无效', 'invalid_settings');
      const names = {};
      for (const item of input.products) {
        fields(item, ['id', 'name', 'color']);
        if (!ids.includes(item.id) || !HEX.test(item.color)) throw new HttpError(400, '产品设置格式无效', 'invalid_settings');
        names[item.id] = { name: plain(item.name, '产品名称', 40).trim() || item.id, color: item.color.toLowerCase() };
      }
      write(db, 'products', names);
    }
    if (input.branding !== undefined) {
      const b = input.branding;
      fields(b, ['name', 'tagline', 'accent', 'showProducts']);
      if (!HEX.test(b.accent) || typeof b.showProducts !== 'boolean') throw new HttpError(400, '品牌设置格式无效', 'invalid_settings');
      write(db, 'branding', { name: plain(b.name, '系统名称', 40).trim() || DEFAULT_BRANDING.name, tagline: plain(b.tagline, '副标题', 80).trim(),
        accent: b.accent.toLowerCase(), showProducts: b.showProducts });
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
