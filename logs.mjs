import { HttpError } from './lib.mjs';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const FAILED = "l.result NOT IN ('activated','renewed')";

export function audit(db, now, action, target = '', detail = '') {
  db.prepare('INSERT INTO audit_log (at,action,target,detail) VALUES (?,?,?,?)').run(now, action, target, detail);
}
function page(params) {
  const offset = Number(params.get('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000000) throw new HttpError(400, '无效的分页参数', 'invalid_search');
  return offset;
}
export function listActivationLog(db, params, config = {}) {
  const offset = page(params);
  const cardId = params.get('cardId') || '';
  const machine = params.get('machine') || '';
  const productId = params.get('productId') || '';
  const result = params.get('result') || '';
  if ((cardId && !UUID.test(cardId)) || (machine && !FINGERPRINT.test(machine)) || (productId && !(config.products || []).includes(productId)) ||
      !['', 'ok', 'failed'].includes(result)) throw new HttpError(400, '无效的筛选条件', 'invalid_search');
  const where = ['1=1']; const args = [];
  if (cardId) { where.push('l.cardId=?'); args.push(cardId); }
  if (machine) { where.push('l.machineFingerprint=?'); args.push(machine); }
  if (productId) { where.push('l.productId=?'); args.push(productId); }
  if (result === 'ok') where.push(`NOT (${FAILED})`);
  if (result === 'failed') where.push(FAILED);
  const clause = 'WHERE ' + where.join(' AND ');
  const limit = Math.max(1, Math.min(Math.trunc(Number(params.get('limit'))) || 50, 100));
  return { items: db.prepare(`SELECT l.*, c.customer, c.note, c.cardId IS NOT NULL AS cardExists FROM activation_log l LEFT JOIN cards c ON c.cardId=l.cardId
      ${clause} ORDER BY l.at DESC, l.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset).map(x => ({ ...x, cardExists: Boolean(x.cardExists) })),
    total: db.prepare(`SELECT count(*) AS count FROM activation_log l ${clause}`).get(...args).count, offset, limit };
}
export function listAuditLog(db, params) {
  const offset = page(params);
  return { items: db.prepare('SELECT * FROM audit_log ORDER BY at DESC, id DESC LIMIT 50 OFFSET ?').all(offset),
    total: db.prepare('SELECT count(*) AS count FROM audit_log').get().count, offset, limit: 50 };
}
