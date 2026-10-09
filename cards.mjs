import { randomBytes, randomUUID, sign, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { digest, HttpError } from './lib.mjs';
import { audit } from './logs.mjs';

export const DEFAULT_PRODUCTS = ['photoarchiver', 'wallpaper'];
export function productsFromEnv(env) {
  const products = (env.LICENSE_PRODUCTS || DEFAULT_PRODUCTS.join(',')).split(',').map(x => x.trim());
  if (products.length > 50 || products.some(x => !/^[a-z][a-z0-9_-]{0,39}$/.test(x))) throw new Error('Invalid LICENSE_PRODUCTS');
  return [...new Set(products)];
}

export const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const CARD_CODE = /^LIC-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const STATES = ['', 'active', 'disabled', 'unused', 'partial', 'full'];
const products = config => config.products || DEFAULT_PRODUCTS;

export function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(x => !allowed.includes(x))) throw new HttpError(400, '包含不支持的字段', 'invalid_fields');
}
function text(value, label, max) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max || CONTROL.test(value)) throw new HttpError(400, `${label}最多 ${max} 字且不能包含控制字符`, 'invalid_text');
  return value.trim();
}
function cardIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100 || value.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(value).size !== value.length) {
    throw new HttpError(400, '请选择 1–100 张不重复的卡密', 'invalid_selection');
  }
  return value;
}
function cardStatus(value) {
  if (!['active', 'disabled'].includes(value)) throw new HttpError(400, '无效的卡密状态', 'invalid_status');
  return value;
}

// Card codes are stored encrypted (AES-256-GCM, bound to cardId) so administrators can retrieve them later.
// The key is derived from the signing key: anyone holding that key can already mint licenses.
const codeKeys = new WeakMap();
function codeKey(privateKey) {
  if (!codeKeys.has(privateKey)) {
    codeKeys.set(privateKey, Buffer.from(hkdfSync('sha256', privateKey.export({ format: 'der', type: 'pkcs8' }), Buffer.alloc(0), 'license-issuer/card-code/v1', 32)));
  }
  return codeKeys.get(privateKey);
}
export function sealCode(privateKey, cardId, cardCode) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', codeKey(privateKey), iv);
  cipher.setAAD(Buffer.from(cardId));
  const sealed = Buffer.concat([cipher.update(cardCode, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `v1.${iv.toString('base64url')}.${sealed.toString('base64url')}`;
}
export function openCode(privateKey, cardId, value) {
  try {
    const [version, iv, sealed] = value.split('.');
    if (version !== 'v1') return null;
    const bytes = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', codeKey(privateKey), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(cardId));
    decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString('utf8');
  } catch { return null; }
}

const used = '(SELECT count(*) FROM activations a WHERE a.cardId=c.cardId)';
const columns = `c.cardId,c.productId,c.edition,c.maxDevices,c.issuedAt,c.note,c.status,c.customer,c.channel,c.orderNo,c.batchId,c.releases,
  c.codeCipher IS NOT NULL AS hasCode, ${used} AS usedDevices,
  (SELECT max(coalesce(a.lastSeenAt,a.issuedAt)) FROM activations a WHERE a.cardId=c.cardId) AS lastSeenAt`;
export function stateOf(card) {
  if (card.status === 'disabled') return 'disabled';
  return card.usedDevices === 0 ? 'unused' : card.usedDevices >= card.maxDevices ? 'full' : 'partial';
}
export const cardRow = card => ({ ...card, hasCode: Boolean(card.hasCode), state: stateOf(card) });

function cardInput(input, config) {
  const { productId, edition, maxDevices = 2 } = input;
  if (!products(config).includes(productId)) throw new HttpError(400, '未知产品', 'unknown_product');
  if (!config.editions.includes(edition)) throw new HttpError(400, '不支持的授权版本', 'invalid_edition');
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 100) throw new HttpError(400, '设备上限必须是 1–100 的整数', 'invalid_max_devices');
  return { productId, edition, maxDevices, note: text(input.note, '备注', 2000), customer: text(input.customer, '客户', 120),
    channel: text(input.channel, '渠道', 60), orderNo: text(input.orderNo, '订单号', 120) };
}
const CARD_FIELDS = ['productId', 'edition', 'note', 'maxDevices', 'customer', 'channel', 'orderNo'];
export function createCards(db, input, config, now) {
  fields(input, [...CARD_FIELDS, 'quantity']);
  const { quantity } = input;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new HttpError(400, '生成数量必须是 1–100 的整数', 'invalid_quantity');
  const card = cardInput(input, config);
  db.exec('BEGIN IMMEDIATE');
  try {
    const batchId = randomUUID();
    db.prepare('INSERT INTO batches (batchId,productId,edition,maxDevices,quantity,note,customer,channel,createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(batchId, card.productId, card.edition, card.maxDevices, quantity, card.note, card.customer, card.channel, now);
    const insert = db.prepare(`INSERT INTO cards (cardId,codeHash,productId,edition,maxDevices,issuedAt,note,status,customer,channel,orderNo,batchId,codeCipher)
      VALUES (?,?,?,?,?,?,?,'active',?,?,?,?,?)`);
    const items = Array.from({ length: quantity }, () => {
      const cardId = randomUUID();
      const cardCode = 'LIC-' + randomBytes(20).toString('hex').toUpperCase().match(/.{8}/g).join('-');
      insert.run(cardId, digest(cardCode), card.productId, card.edition, card.maxDevices, now, card.note, card.customer, card.channel, card.orderNo,
        batchId, sealCode(config.privateKey, cardId, cardCode));
      return { ...getCard(db, cardId), cardCode };
    });
    audit(db, now, 'cards.create', batchId, `${card.productId} / ${card.edition} × ${quantity}`);
    db.exec('COMMIT');
    return { items, total: items.length, batchId };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function createCard(db, input, config, now) {
  fields(input, CARD_FIELDS);
  return createCards(db, { ...input, quantity: 1 }, config, now).items[0];
}
export function deleteCards(db, input, now) {
  fields(input, ['cardIds', 'confirmed']);
  if (input.confirmed !== true) throw new HttpError(400, '删除需要确认', 'confirmation_required');
  const ids = cardIds(input.cardIds);
  db.exec('BEGIN IMMEDIATE');
  try {
    const find = db.prepare('SELECT batchId FROM cards WHERE cardId=?');
    const found = ids.map(id => find.get(id));
    if (found.some(x => !x)) throw new HttpError(404, '部分卡密已不存在，请刷新后重试', 'card_not_found');
    const removeDevices = db.prepare('DELETE FROM activations WHERE cardId=?');
    const removeCard = db.prepare('DELETE FROM cards WHERE cardId=?');
    for (const id of ids) { removeDevices.run(id); removeCard.run(id); }
    const prune = db.prepare('DELETE FROM batches WHERE batchId=? AND NOT EXISTS (SELECT 1 FROM cards WHERE batchId=?)');
    for (const batchId of new Set(found.map(x => x.batchId).filter(Boolean))) prune.run(batchId, batchId);
    audit(db, now, 'cards.delete', ids.length === 1 ? ids[0] : '', `${ids.length} 张`);
    db.exec('COMMIT');
    return { deleted: ids.length };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function getCard(db, cardId) {
  const card = db.prepare(`SELECT ${columns} FROM cards c WHERE c.cardId=?`).get(cardId);
  if (!card) throw new HttpError(404, '卡密不存在', 'card_not_found');
  return { ...cardRow(card), devices: db.prepare('SELECT activationId,machineFingerprint,issuedAt,lastSeenAt FROM activations WHERE cardId=? ORDER BY issuedAt,activationId').all(cardId) };
}

function cardFilter(params, config) {
  const q = params.get('q') || '';
  const productId = params.get('productId') || '';
  const state = params.get('state') || params.get('status') || '';
  const batchId = params.get('batchId') || '';
  if (q.length > 200 || (productId && !products(config).includes(productId)) || !STATES.includes(state) || (batchId && !UUID.test(batchId))) {
    throw new HttpError(400, '无效的搜索条件', 'invalid_search');
  }
  const where = [`instr(lower(c.cardId||char(10)||c.productId||char(10)||c.note||char(10)||c.edition||char(10)||c.customer||char(10)||c.channel||char(10)||c.orderNo),lower(?))>0`];
  const args = [q];
  if (productId) { where.push('c.productId=?'); args.push(productId); }
  if (batchId) { where.push('c.batchId=?'); args.push(batchId); }
  if (state === 'active' || state === 'disabled') { where.push('c.status=?'); args.push(state); }
  if (state === 'unused') where.push(`c.status='active' AND ${used}=0`);
  if (state === 'partial') where.push(`c.status='active' AND ${used}>0 AND ${used}<c.maxDevices`);
  if (state === 'full') where.push(`c.status='active' AND ${used}>=c.maxDevices`);
  return { where: 'WHERE ' + where.join(' AND '), args };
}
export function pageParams(params, { size = 30, max = 100 } = {}) {
  const offset = Number(params.get('offset') || 0);
  const limit = Number(params.get('limit') || size);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > max) {
    throw new HttpError(400, '无效的分页参数', 'invalid_search');
  }
  return { offset, limit };
}
export function listCards(db, params, config = {}) {
  const { where, args } = cardFilter(params, config);
  const { offset, limit } = pageParams(params);
  return { items: db.prepare(`SELECT ${columns} FROM cards c ${where} ORDER BY c.issuedAt DESC,c.cardId LIMIT ? OFFSET ?`).all(...args, limit, offset).map(cardRow),
    total: db.prepare(`SELECT count(*) AS count FROM cards c ${where}`).get(...args).count, offset, limit };
}

const STATE_LABELS = { unused: '未使用', partial: '部分激活', full: '已满', disabled: '已停用' };
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // Avoid spreadsheet formula execution.
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function exportCards(db, params, config, now) {
  const { where, args } = cardFilter(params, config);
  const withCodes = params.get('codes') === '1';
  const rows = db.prepare(`SELECT ${columns}, c.codeCipher FROM cards c ${where} ORDER BY c.issuedAt DESC,c.cardId LIMIT 10000`).all(...args).map(cardRow);
  const header = [...(withCodes ? ['卡密'] : []), '卡 ID', '产品', '版本', '状态', '已用设备', '设备上限', '客户', '渠道', '订单号', '备注', '创建时间'];
  const lines = rows.map(card => [...(withCodes ? [card.codeCipher ? openCode(config.privateKey, card.cardId, card.codeCipher) ?? '' : ''] : []),
    card.cardId, card.productId, card.edition, STATE_LABELS[card.state], card.usedDevices, card.maxDevices, card.customer, card.channel, card.orderNo,
    card.note, new Date(card.issuedAt).toISOString()].map(csvCell).join(','));
  if (withCodes) audit(db, now, 'cards.export', params.get('batchId') || '', `导出 ${rows.length} 张（含卡密）`);
  return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
}

export function updateCard(db, cardId, input, now) {
  fields(input, ['status', 'note', 'customer', 'channel', 'orderNo']);
  if (!Object.keys(input).length) throw new HttpError(400, '没有需要保存的修改', 'invalid_fields');
  const changes = {};
  if (input.status !== undefined) changes.status = cardStatus(input.status);
  for (const [key, label, max] of [['note', '备注', 2000], ['customer', '客户', 120], ['channel', '渠道', 60], ['orderNo', '订单号', 120]]) {
    if (input[key] !== undefined) changes[key] = text(input[key], label, max);
  }
  const keys = Object.keys(changes);
  if (!db.prepare(`UPDATE cards SET ${keys.map(k => `${k}=?`).join(',')} WHERE cardId=?`).run(...keys.map(k => changes[k]), cardId).changes) {
    throw new HttpError(404, '卡密不存在', 'card_not_found');
  }
  if (changes.status) audit(db, now, changes.status === 'active' ? 'card.enable' : 'card.disable', cardId, '');
  if (keys.some(k => k !== 'status')) audit(db, now, 'card.edit', cardId, keys.filter(k => k !== 'status').join(','));
  return getCard(db, cardId);
}
export const setCardStatus = updateCard;
export function setCardsStatus(db, input, now) {
  fields(input, ['cardIds', 'status']);
  const ids = cardIds(input.cardIds);
  const status = cardStatus(input.status);
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare('UPDATE cards SET status=? WHERE cardId=?');
    if (ids.some(id => !update.run(status, id).changes)) throw new HttpError(404, '部分卡密已不存在，请刷新后重试', 'card_not_found');
    audit(db, now, status === 'active' ? 'cards.enable' : 'cards.disable', '', `${ids.length} 张`);
    db.exec('COMMIT');
    return { updated: ids.length };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function revealCode(db, cardId, config, now) {
  const card = db.prepare('SELECT codeCipher FROM cards WHERE cardId=?').get(cardId);
  if (!card) throw new HttpError(404, '卡密不存在', 'card_not_found');
  if (!card.codeCipher) throw new HttpError(404, '这张卡创建于明文保存功能之前，无法回看卡密', 'code_unavailable');
  const cardCode = openCode(config.privateKey, cardId, card.codeCipher);
  if (!cardCode) throw new HttpError(409, '无法解密卡密：签名密钥可能已更换', 'code_unreadable');
  audit(db, now, 'card.reveal', cardId, '');
  return { cardCode };
}
export function releaseDevice(db, cardId, activationId, input, now) {
  fields(input, ['confirmed']);
  if (input.confirmed !== true) throw new HttpError(400, '释放设备需要确认', 'confirmation_required');
  db.exec('BEGIN IMMEDIATE');
  try {
    const device = db.prepare('SELECT machineFingerprint FROM activations WHERE activationId=? AND cardId=?').get(activationId, cardId);
    if (!device) throw new HttpError(404, '设备记录不存在', 'device_not_found');
    db.prepare('DELETE FROM activations WHERE activationId=?').run(activationId);
    db.prepare('UPDATE cards SET releases=releases+1 WHERE cardId=?').run(cardId);
    audit(db, now, 'device.release', cardId, device.machineFingerprint);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return getCard(db, cardId);
}

export function lookup(db, input, config) {
  fields(input, ['query']);
  if (typeof input.query !== 'string' || input.query.length > 200) throw new HttpError(400, '请输入要查找的内容', 'invalid_search');
  const query = input.query.trim();
  const byId = db.prepare(`SELECT ${columns} FROM cards c WHERE c.cardId=?`);
  const result = (kind, cards) => ({ kind, cards: cards.filter(Boolean).map(cardRow) });
  if (!query) return result('empty', []);
  if (CARD_CODE.test(query.toUpperCase())) {
    return result('cardCode', [db.prepare(`SELECT ${columns} FROM cards c WHERE c.codeHash=?`).get(digest(query.toUpperCase()))]);
  }
  if (FINGERPRINT.test(query.toLowerCase())) {
    const machine = query.toLowerCase();
    return result('machine', db.prepare(`SELECT ${columns} FROM cards c WHERE c.cardId IN (SELECT cardId FROM activations WHERE machineFingerprint=?) ORDER BY c.issuedAt DESC`).all(machine));
  }
  if (UUID.test(query.toLowerCase())) {
    const id = query.toLowerCase();
    const activation = db.prepare('SELECT cardId FROM activations WHERE activationId=?').get(id);
    return result('id', [byId.get(id) || (activation && byId.get(activation.cardId))]);
  }
  return result('text', listCards(db, new URLSearchParams({ q: query, limit: '10' }), config).items);
}

const batchColumns = `b.*, count(c.cardId) AS cards,
  coalesce(sum(c.status='disabled'),0) AS disabled,
  coalesce(sum(${used}>0),0) AS activatedCards,
  coalesce(sum(${used}),0) AS activations`;
export function listBatches(db, params, config = {}) {
  const q = params.get('q') || '';
  const productId = params.get('productId') || '';
  if (q.length > 200 || (productId && !products(config).includes(productId))) throw new HttpError(400, '无效的搜索条件', 'invalid_search');
  const { offset, limit } = pageParams(params);
  const where = `WHERE (?='' OR b.productId=?) AND instr(lower(b.note||char(10)||b.customer||char(10)||b.channel||char(10)||b.edition),lower(?))>0`;
  const args = [productId, productId, q];
  return { items: db.prepare(`SELECT ${batchColumns} FROM batches b LEFT JOIN cards c ON c.batchId=b.batchId ${where}
      GROUP BY b.batchId ORDER BY b.createdAt DESC, b.batchId LIMIT ? OFFSET ?`).all(...args, limit, offset),
    total: db.prepare(`SELECT count(*) AS count FROM batches b ${where}`).get(...args).count, offset, limit };
}
export function getBatch(db, batchId) {
  const batch = db.prepare(`SELECT ${batchColumns} FROM batches b LEFT JOIN cards c ON c.batchId=b.batchId WHERE b.batchId=? GROUP BY b.batchId`).get(batchId);
  if (!batch) throw new HttpError(404, '批次不存在', 'batch_not_found');
  return batch;
}
export function setBatchStatus(db, batchId, input, now) {
  fields(input, ['status']);
  const status = cardStatus(input.status);
  getBatch(db, batchId);
  const { changes } = db.prepare('UPDATE cards SET status=? WHERE batchId=?').run(status, batchId);
  audit(db, now, status === 'active' ? 'batch.enable' : 'batch.disable', batchId, `${changes} 张`);
  return getBatch(db, batchId);
}

export function cardSummary(db, config = {}, now = Date.now(), tzOffset = 0) {
  const totals = db.prepare(`SELECT count(*) AS total,
    sum(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
    sum(CASE WHEN status='disabled' THEN 1 ELSE 0 END) AS disabled,
    (SELECT count(*) FROM activations) AS activations
    FROM cards`).get();
  const counts = new Map(db.prepare(`WITH u AS (SELECT c.productId, c.status, c.maxDevices, ${used} AS used FROM cards c)
    SELECT productId, count(*) AS total, sum(status='disabled') AS disabled, sum(status='active' AND used=0) AS unused,
      sum(status='active' AND used>0 AND used<maxDevices) AS partial, sum(status='active' AND used>=maxDevices) AS full, sum(used) AS activations,
      sum(CASE WHEN status='active' THEN maxDevices ELSE 0 END) AS capacity
    FROM u GROUP BY productId`).all().map(row => [row.productId, row]));
  const productIds = [...new Set([...products(config), ...counts.keys()])];
  const productStats = productIds.map(productId => Object.fromEntries(['total', 'unused', 'partial', 'full', 'disabled', 'activations', 'capacity']
    .map(key => [key, Number(counts.get(productId)?.[key] || 0)]).concat([['productId', productId]])));
  // Day buckets follow the viewer's time zone; tzOffset is Date#getTimezoneOffset() in minutes.
  const shift = tzOffset * 60000;
  const today = Math.floor((now - shift) / 86400000);
  const byDay = new Map(db.prepare(`SELECT CAST(at - ? AS INTEGER) / 86400000 AS day, sum(result='activated') AS activated, sum(result='renewed') AS renewed,
      sum(result NOT IN ('activated','renewed')) AS failed
    FROM activation_log WHERE at >= ? GROUP BY day`).all(shift, (today - 29) * 86400000 + shift).map(row => [Number(row.day), row]));
  const trend = Array.from({ length: 30 }, (_, i) => {
    const day = today - 29 + i;
    const row = byDay.get(day) || {};
    return { date: new Date(day * 86400000).toISOString().slice(0, 10), activated: Number(row.activated || 0), renewed: Number(row.renewed || 0), failed: Number(row.failed || 0) };
  });
  // Request outcomes over the same 30-day window, for the success rate and failure breakdown.
  const outcomes = Object.fromEntries(db.prepare('SELECT result, count(*) AS n FROM activation_log WHERE at >= ? GROUP BY result')
    .all((today - 29) * 86400000 + shift).map(row => [row.result, Number(row.n)]));
  const recent = db.prepare(`SELECT cardId, productId, edition, issuedAt, status, note, ${used} AS usedDevices FROM cards c ORDER BY issuedAt DESC, cardId LIMIT 5`).all();
  return { totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value || 0)])), products: productStats, trend, outcomes, recent };
}

export function allowActivation(db, address, now) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM activation_attempts WHERE expires<=?').run(now);
    // Use the actual socket address, never client-supplied forwarding headers.
    const buckets = [['global', 1000], [digest(address), 60]];
    const allowed = buckets.every(([bucket, limit]) => (db.prepare('SELECT count FROM activation_attempts WHERE bucket=?').get(bucket)?.count || 0) < limit);
    if (allowed) for (const [bucket] of buckets) db.prepare('INSERT INTO activation_attempts VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').run(bucket, now + 60000);
    db.exec('COMMIT');
    return allowed;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
const LOG_RETENTION_MS = 180 * 86400000;
function logActivation(db, input, config, now, result, cardId = null) {
  const productId = typeof input?.productId === 'string' && products(config).includes(input.productId) ? input.productId : '';
  const machine = typeof input?.machineFingerprint === 'string' && FINGERPRINT.test(input.machineFingerprint) ? input.machineFingerprint : null;
  db.prepare('INSERT INTO activation_log (at,productId,cardId,machineFingerprint,result) VALUES (?,?,?,?,?)').run(now, productId, cardId, machine, result);
  db.prepare('DELETE FROM activation_log WHERE at<?').run(now - LOG_RETENTION_MS);
}
export function activateCard(db, input, config, now) {
  try {
    const { renewed, ...result } = activate(db, input, config, now);
    logActivation(db, input, config, now, renewed ? 'renewed' : 'activated', result.cardId);
    delete result.cardId;
    return result;
  } catch (error) {
    if (error instanceof HttpError) logActivation(db, input, config, now, error.code || 'invalid_request', error.cardId);
    throw error;
  }
}
function activate(db, input, config, now) {
  const fail = (status, message, code, cardId) => Object.assign(new HttpError(status, message, code), { cardId });
  try { fields(input, ['cardCode', 'productId', 'machineFingerprint']); } catch { throw fail(400, 'Invalid fields', 'invalid_request'); }
  const { productId, machineFingerprint } = input;
  if (typeof input.cardCode !== 'string' || input.cardCode.length > 100) throw fail(400, 'Invalid card code', 'invalid_request');
  const cardCode = input.cardCode.trim().toUpperCase();
  if (!CARD_CODE.test(cardCode)) throw fail(400, 'Invalid card code', 'invalid_request');
  if (!products(config).includes(productId)) throw fail(400, 'Unknown product', 'unknown_product');
  if (typeof machineFingerprint !== 'string' || !FINGERPRINT.test(machineFingerprint)) throw fail(400, 'Invalid machine fingerprint', 'invalid_request');
  // The check, device count, signature and insert are one transaction across processes.
  db.exec('BEGIN IMMEDIATE');
  try {
    const card = db.prepare('SELECT * FROM cards WHERE codeHash=? AND productId=?').get(digest(cardCode), productId);
    if (!card) throw fail(404, 'Card not found for this product', 'card_not_found');
    if (card.status !== 'active') throw fail(403, 'Card is disabled', 'card_disabled', card.cardId);
    let activation = db.prepare('SELECT * FROM activations WHERE cardId=? AND machineFingerprint=?').get(card.cardId, machineFingerprint);
    const renewed = Boolean(activation);
    if (activation) {
      db.prepare('UPDATE activations SET lastSeenAt=? WHERE activationId=?').run(now, activation.activationId);
    } else {
      const count = db.prepare('SELECT count(*) AS count FROM activations WHERE cardId=?').get(card.cardId).count;
      if (count >= card.maxDevices) throw fail(409, 'Device limit reached', 'device_limit', card.cardId);
      const payload = { version: 1, licenseId: randomUUID(), cardId: card.cardId, productId, machineFingerprint, edition: card.edition, issuedAt: now };
      const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
      // Domain separation: GL1 signatures stay distinct from any other signed format.
      const code = `GL1.${bytes.toString('base64url')}.${sign(null, Buffer.concat([Buffer.from('GL1.'), bytes]), config.privateKey).toString('base64url')}`;
      db.prepare('INSERT INTO activations (activationId,cardId,machineFingerprint,issuedAt,code,lastSeenAt) VALUES (?,?,?,?,?,?)')
        .run(payload.licenseId, card.cardId, machineFingerprint, now, code, now);
      activation = { activationId: payload.licenseId, issuedAt: now, code };
    }
    const usedDevices = db.prepare('SELECT count(*) AS count FROM activations WHERE cardId=?').get(card.cardId).count;
    db.exec('COMMIT');
    return { licenseId: activation.activationId, productId, machineFingerprint, edition: card.edition, issuedAt: activation.issuedAt,
      license: activation.code, maxDevices: card.maxDevices, usedDevices, cardId: card.cardId, renewed };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
