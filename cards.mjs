import { randomBytes, randomUUID, sign } from 'node:crypto';
import { digest, HttpError } from './lib.mjs';

export const DEFAULT_PRODUCTS = ['photoarchiver', 'wallpaper'];
export function productsFromEnv(env) {
  const products = (env.LICENSE_PRODUCTS || DEFAULT_PRODUCTS.join(',')).split(',').map(x => x.trim());
  if (products.length > 50 || products.some(x => !/^[a-z][a-z0-9_-]{0,39}$/.test(x))) throw new Error('Invalid LICENSE_PRODUCTS');
  return [...new Set(products)];
}
function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(x => !allowed.includes(x))) throw new HttpError(400, 'Invalid fields');
}
export function createCard(db, input, config, now) {
  fields(input, ['productId', 'edition', 'note', 'maxDevices']);
  const { productId, edition, note = '', maxDevices = 2 } = input;
  if (!(config.products || DEFAULT_PRODUCTS).includes(productId)) throw new HttpError(400, 'Unknown product');
  if (!config.editions.includes(edition)) throw new HttpError(400, 'Edition is not allowed');
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 100) throw new HttpError(400, 'Device limit must be 1 to 100');
  if (typeof note !== 'string' || note.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note)) throw new HttpError(400, 'Invalid note');
  const cardId = randomUUID();
  const cardCode = 'LIC-' + randomBytes(20).toString('hex').toUpperCase().match(/.{8}/g).join('-');
  db.prepare('INSERT INTO cards (cardId,codeHash,productId,edition,maxDevices,issuedAt,note,status) VALUES (?,?,?,?,?,?,?,?)')
    .run(cardId, digest(cardCode), productId, edition, maxDevices, now, note, 'active');
  return { ...getCard(db, cardId), cardCode };
}
const columns = `c.cardId,c.productId,c.edition,c.maxDevices,c.issuedAt,c.note,c.status,
  (SELECT count(*) FROM activations a WHERE a.cardId=c.cardId) AS usedDevices`;
export function createCards(db, input, config, now) {
  fields(input, ['productId', 'edition', 'note', 'maxDevices', 'quantity']);
  const { quantity, ...card } = input;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new HttpError(400, 'Quantity must be 1 to 100');
  db.exec('BEGIN IMMEDIATE');
  try {
    const items = Array.from({ length: quantity }, () => createCard(db, card, config, now));
    db.exec('COMMIT');
    return { items, total: items.length };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function deleteCards(db, input) {
  fields(input, ['cardIds', 'confirmed']);
  if (input.confirmed !== true) throw new HttpError(400, 'Deletion confirmation required');
  const { cardIds } = input;
  if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 100 ||
      cardIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)) || new Set(cardIds).size !== cardIds.length) {
    throw new HttpError(400, 'Supply 1 to 100 unique card IDs');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const find = db.prepare('SELECT 1 FROM cards WHERE cardId=?');
    if (cardIds.some(id => !find.get(id))) throw new HttpError(404, 'Some cards no longer exist; refresh before deleting');
    const removeDevices = db.prepare('DELETE FROM activations WHERE cardId=?');
    const removeCard = db.prepare('DELETE FROM cards WHERE cardId=?');
    for (const id of cardIds) { removeDevices.run(id); removeCard.run(id); }
    db.exec('COMMIT');
    return { deleted: cardIds.length };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function getCard(db, cardId) {
  const card = db.prepare(`SELECT ${columns} FROM cards c WHERE c.cardId=?`).get(cardId);
  if (!card) throw new HttpError(404, 'Card not found');
  return { ...card, devices: db.prepare('SELECT activationId,machineFingerprint,issuedAt FROM activations WHERE cardId=? ORDER BY issuedAt,activationId').all(cardId) };
}
export function listCards(db, params) {
  const q = params.get('q') || '';
  const productId = params.get('productId') || '';
  const status = params.get('status') || '';
  const offset = Number(params.get('offset') || 0);
  if (q.length > 200 || productId.length > 40 || !['', 'active', 'disabled'].includes(status) || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000000) throw new HttpError(400, 'Invalid search');
  const where = `WHERE (?='' OR c.productId=?) AND (?='' OR c.status=?) AND instr(lower(c.cardId || char(10) || c.productId || char(10) || c.note || char(10) || c.edition),lower(?))>0`;
  const args = [productId, productId, status, status, q];
  return { items: db.prepare(`SELECT ${columns} FROM cards c ${where} ORDER BY c.issuedAt DESC,c.cardId LIMIT 30 OFFSET ?`).all(...args, offset),
    total: db.prepare(`SELECT count(*) AS count FROM cards c ${where}`).get(...args).count, offset };
}

export function cardSummary(db) {
  const totals = db.prepare(`SELECT count(*) AS total,
    sum(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
    sum(CASE WHEN status='disabled' THEN 1 ELSE 0 END) AS disabled,
    (SELECT count(*) FROM activations) AS activations
    FROM cards`).get();
  const products = db.prepare(`SELECT productId, count(*) AS total,
    sum(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
    (SELECT count(*) FROM activations a WHERE a.cardId IN (SELECT cardId FROM cards c2 WHERE c2.productId=c.productId)) AS activations
    FROM cards c GROUP BY productId ORDER BY productId`).all();
  const recent = db.prepare(`SELECT cardId, productId, edition, issuedAt, status, note,
    (SELECT count(*) FROM activations a WHERE a.cardId=c.cardId) AS usedDevices
    FROM cards c ORDER BY issuedAt DESC, cardId LIMIT 5`).all();
  return { totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value || 0)])), products, recent };
}
export function setCardStatus(db, cardId, input) {
  fields(input, ['status']);
  if (!['active', 'disabled'].includes(input.status)) throw new HttpError(400, 'Invalid card status');
  if (!db.prepare('UPDATE cards SET status=? WHERE cardId=?').run(input.status, cardId).changes) throw new HttpError(404, 'Card not found');
  return getCard(db, cardId);
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
export function activateCard(db, input, config, now) {
  fields(input, ['cardCode', 'productId', 'machineFingerprint']);
  const { productId, machineFingerprint } = input;
  if (typeof input.cardCode !== 'string' || input.cardCode.length > 100) throw new HttpError(400, 'Invalid card code');
  const cardCode = input.cardCode.trim().toUpperCase();
  if (!/^LIC-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/.test(cardCode)) throw new HttpError(400, 'Invalid card code');
  if (!(config.products || DEFAULT_PRODUCTS).includes(productId)) throw new HttpError(400, 'Unknown product');
  if (typeof machineFingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(machineFingerprint)) throw new HttpError(400, 'Invalid machine fingerprint');
  // The check, device count, signature and insert are one transaction across processes.
  db.exec('BEGIN IMMEDIATE');
  try {
    const card = db.prepare('SELECT * FROM cards WHERE codeHash=? AND productId=?').get(digest(cardCode), productId);
    if (!card) throw new HttpError(404, 'Card not found for this product');
    if (card.status !== 'active') throw new HttpError(403, 'Card is disabled');
    let activation = db.prepare('SELECT * FROM activations WHERE cardId=? AND machineFingerprint=?').get(card.cardId, machineFingerprint);
    if (!activation) {
      const count = db.prepare('SELECT count(*) AS count FROM activations WHERE cardId=?').get(card.cardId).count;
      if (count >= card.maxDevices) throw new HttpError(409, 'Device limit reached');
      const payload = { version: 1, licenseId: randomUUID(), cardId: card.cardId, productId, machineFingerprint, edition: card.edition, issuedAt: now };
      const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
      // Domain separation: GL1 signatures cannot be reused as legacy PA1 licenses.
      const code = `GL1.${bytes.toString('base64url')}.${sign(null, Buffer.concat([Buffer.from('GL1.'), bytes]), config.privateKey).toString('base64url')}`;
      db.prepare('INSERT INTO activations (activationId,cardId,machineFingerprint,issuedAt,code) VALUES (?,?,?,?,?)')
        .run(payload.licenseId, card.cardId, machineFingerprint, now, code);
      activation = { activationId: payload.licenseId, issuedAt: now, code };
    }
    const usedDevices = db.prepare('SELECT count(*) AS count FROM activations WHERE cardId=?').get(card.cardId).count;
    db.exec('COMMIT');
    return { licenseId: activation.activationId, productId, machineFingerprint, edition: card.edition, issuedAt: activation.issuedAt,
      license: activation.code, maxDevices: card.maxDevices, usedDevices };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
