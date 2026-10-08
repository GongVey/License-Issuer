import { createPrivateKey, createPublicKey, randomBytes, randomUUID, scrypt, timingSafeEqual, sign, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const CLIENT_PUBLIC_KEY = '7K3Lua0o-z03ZKplamnmLAwKrG8QmQble1pkwgypUe4';
const derive = promisify(scrypt);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export function passwordParts(value) {
  if (typeof value !== 'string' || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(value)) {
    throw new Error('Password hash must be a scrypt hash produced by admin.mjs password-hash');
  }
  const [, salt, hash] = value.split('$');
  return { salt: Buffer.from(salt, 'hex'), hash: Buffer.from(hash, 'hex') };
}
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 256) {
    throw new Error('Password must be nonempty and at most 256 characters');
  }
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const { salt, hash } = passwordParts(encoded);
  const actual = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(hash, actual);
}
export function publicKeyFor(key) {
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Signing key must be Ed25519');
  return createPublicKey(key).export({ format: 'jwk' }).x;
}
export function assertMatchingKey(key, expected) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(expected) || publicKeyFor(key) !== expected) {
    throw new Error('Signing key does not match LICENSE_EXPECTED_PUBLIC_KEY; no licenses will be issued');
  }
  return key;
}
export function loadSigningKey(env) {
  if (!env.LICENSE_PRIVATE_KEY_PATH) throw new Error('LICENSE_PRIVATE_KEY_PATH is required');
  let key;
  try {
    key = createPrivateKey({ key: readFileSync(env.LICENSE_PRIVATE_KEY_PATH), format: 'pem',
      passphrase: env.LICENSE_PRIVATE_KEY_PASSPHRASE || undefined });
  } catch { throw new Error('Cannot load signing key; check PEM path, permissions and passphrase'); }
  const expected = env.LICENSE_EXPECTED_PUBLIC_KEY || CLIENT_PUBLIC_KEY;
  return assertMatchingKey(key, expected);
}
export function configFromEnv(env) {
  const origin = env.PUBLIC_ORIGIN || 'http://127.0.0.1:8787';
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('PUBLIC_ORIGIN must be an exact HTTP(S) origin');
  const host = env.HOST || '127.0.0.1';
  if (url.protocol !== 'https:' && (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['127.0.0.1', '::1', 'localhost'].includes(host))) {
    throw new Error('Non-loopback access requires an HTTPS PUBLIC_ORIGIN behind a reverse proxy');
  }
  const port = Number(env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const editions = (env.LICENSE_EDITIONS || 'standard').split(',').map(x => x.trim());
  if (editions.length > 20 || editions.some(x => !/^[A-Za-z0-9_-]{1,40}$/.test(x))) throw new Error('Invalid LICENSE_EDITIONS');
  return { origin, host, port, editions: [...new Set(editions)],
    privateKey: loadSigningKey(env), database: resolve(env.DATABASE_PATH || './data/issuer.sqlite'), secure: url.protocol === 'https:',
    sessionMs: 8 * 60 * 60 * 1000, loginWindowMs: 15 * 60 * 1000, loginLimit: 10, globalLoginLimit: 100 };
}
export function issueLicense(key, input, editions, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(x => !['machineFingerprint', 'note', 'edition'].includes(x))) {
    throw new HttpError(400, '包含不支持的字段', 'invalid_fields');
  }
  const { machineFingerprint, edition, note = '' } = input;
  if (typeof machineFingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(machineFingerprint)) throw new HttpError(400, '机器码必须是 sha256: 加 64 位小写十六进制', 'invalid_fingerprint');
  if (!editions.includes(edition)) throw new HttpError(400, '不支持的授权版本', 'invalid_edition');
  if (typeof note !== 'string' || note.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note)) throw new HttpError(400, '备注最多 2000 字且不能包含控制字符', 'invalid_text');
  const payload = { licenseId: randomUUID(), machineFingerprint, edition, issuedAt: now };
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const code = `PA1.${bytes.toString('base64url')}.${sign(null, bytes, key).toString('base64url')}`;
  return { ...payload, note, code, status: 'active' };
}
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:' && process.platform !== 'win32') chmodSync(path, 0o600);
  try {
    db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS administrators (
      id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      mustChangePassword INTEGER NOT NULL DEFAULT 0 CHECK(mustChangePassword IN (0,1)));
    CREATE TABLE IF NOT EXISTS licenses (
      licenseId TEXT PRIMARY KEY, machineFingerprint TEXT NOT NULL, edition TEXT NOT NULL,
      issuedAt INTEGER NOT NULL, note TEXT NOT NULL, code TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','archived')));
    CREATE INDEX IF NOT EXISTS licenses_issued ON licenses(issuedAt DESC, licenseId);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
    if (!db.prepare('PRAGMA table_info(administrators)').all().some(column => column.name === 'mustChangePassword')) {
      db.exec('ALTER TABLE administrators ADD COLUMN mustChangePassword INTEGER NOT NULL DEFAULT 0 CHECK(mustChangePassword IN (0,1));');
    }
    if (!db.prepare('PRAGMA table_info(sessions)').all().some(column => column.name === 'adminId')) {
      // Legacy ENV sessions cannot safely be attributed to a database administrator.
      db.exec('DELETE FROM sessions; ALTER TABLE sessions ADD COLUMN adminId INTEGER REFERENCES administrators(id);');
    }
    db.exec(`CREATE TABLE IF NOT EXISTS cards (
      cardId TEXT PRIMARY KEY, codeHash TEXT NOT NULL UNIQUE, productId TEXT NOT NULL,
      edition TEXT NOT NULL, maxDevices INTEGER NOT NULL CHECK(maxDevices BETWEEN 1 AND 100),
      issuedAt INTEGER NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','disabled')));
    CREATE INDEX IF NOT EXISTS cards_issued ON cards(issuedAt DESC, cardId);
    CREATE TABLE IF NOT EXISTS activations (
      activationId TEXT PRIMARY KEY, cardId TEXT NOT NULL REFERENCES cards(cardId),
      machineFingerprint TEXT NOT NULL, issuedAt INTEGER NOT NULL, code TEXT NOT NULL,
      UNIQUE(cardId, machineFingerprint));
    CREATE TABLE IF NOT EXISTS activation_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
    migrateCards(db);
    db.exec('COMMIT');
    return db;
  } catch (error) { db.close(); throw error; }
}
const hasColumn = (db, table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(x => x.name === column);
// Additive migrations only: existing cards, activations and signatures are never rewritten.
function migrateCards(db) {
  for (const [column, ddl] of [['customer', "customer TEXT NOT NULL DEFAULT ''"], ['channel', "channel TEXT NOT NULL DEFAULT ''"],
    ['orderNo', "orderNo TEXT NOT NULL DEFAULT ''"], ['codeCipher', 'codeCipher TEXT'], ['releases', 'releases INTEGER NOT NULL DEFAULT 0']]) {
    if (!hasColumn(db, 'cards', column)) db.exec(`ALTER TABLE cards ADD COLUMN ${ddl}`);
  }
  if (!hasColumn(db, 'activations', 'lastSeenAt')) db.exec('ALTER TABLE activations ADD COLUMN lastSeenAt INTEGER');
  const backfill = !hasColumn(db, 'cards', 'batchId');
  if (backfill) db.exec('ALTER TABLE cards ADD COLUMN batchId TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS batches (
      batchId TEXT PRIMARY KEY, productId TEXT NOT NULL, edition TEXT NOT NULL, maxDevices INTEGER NOT NULL,
      quantity INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', customer TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS batches_created ON batches(createdAt DESC, batchId);
    CREATE INDEX IF NOT EXISTS cards_batch ON cards(batchId);
    CREATE INDEX IF NOT EXISTS activations_machine ON activations(machineFingerprint);
    CREATE TABLE IF NOT EXISTS activation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, productId TEXT NOT NULL,
      cardId TEXT, machineFingerprint TEXT, result TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS activation_log_at ON activation_log(at DESC, id);
    CREATE INDEX IF NOT EXISTS activation_log_card ON activation_log(cardId, at DESC);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log(at DESC, id);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  if (backfill) {
    // Cards created together by the previous batch endpoint share issuedAt, product, edition, limit and note.
    const groups = db.prepare(`SELECT issuedAt, productId, edition, maxDevices, note, count(*) AS quantity
      FROM cards WHERE batchId IS NULL GROUP BY issuedAt, productId, edition, maxDevices, note`).all();
    const insert = db.prepare('INSERT INTO batches (batchId,productId,edition,maxDevices,quantity,note,createdAt) VALUES (?,?,?,?,?,?,?)');
    const assign = db.prepare('UPDATE cards SET batchId=? WHERE batchId IS NULL AND issuedAt=? AND productId=? AND edition=? AND maxDevices=? AND note=?');
    for (const g of groups) {
      const batchId = randomUUID();
      insert.run(batchId, g.productId, g.edition, g.maxDevices, g.quantity, g.note, g.issuedAt);
      assign.run(batchId, g.issuedAt, g.productId, g.edition, g.maxDevices, g.note);
    }
  }
}
export function validateUsername(username) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_.@-]{1,80}$/.test(username)) {
    throw new Error('Username must be 1-80 characters: letters, digits, _, ., @ or -');
  }
  return username;
}
export function requireAdministrator(db) {
  const admin = db.prepare('SELECT * FROM administrators WHERE id=1').get();
  if (!admin) throw new Error('No administrator initialized. Run npm run admin:init or npm run admin:import-env before starting.');
  return admin;
}
export function initializeAdministrator(db, username, passwordHash, mustChangePassword = false) {
  validateUsername(username); passwordParts(passwordHash);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('SELECT 1 FROM administrators LIMIT 1').get()) throw new Error('Administrator already initialized; use admin:reset-password or admin:rename');
    db.prepare('INSERT INTO administrators (id,username,passwordHash,mustChangePassword) VALUES (1,?,?,?)').run(username, passwordHash, mustChangePassword ? 1 : 0);
    db.exec('DELETE FROM sessions; COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export async function ensureDefaultAdministrator(db) {
  if (db.prepare('SELECT 1 FROM administrators LIMIT 1').get()) return false;
  const passwordHash = await hashPassword('admin123');
  // Recheck atomically after hashing so concurrent startups never overwrite an account.
  return db.prepare(`INSERT INTO administrators (id,username,passwordHash,mustChangePassword)
    SELECT 1,'admin',?,1 WHERE NOT EXISTS (SELECT 1 FROM administrators)`)
    .run(passwordHash).changes === 1;
}
export function importAdministrator(db, env) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD_HASH) throw new Error('Explicit import requires ADMIN_USERNAME and ADMIN_PASSWORD_HASH');
  initializeAdministrator(db, env.ADMIN_USERNAME, env.ADMIN_PASSWORD_HASH);
}
export function updateAdministrator(db, { username, passwordHash, mustChangePassword, expectedRevision, sessionId, now = Date.now() }) {
  if (username === undefined && passwordHash === undefined) throw new Error('No administrator changes supplied');
  if (username !== undefined) validateUsername(username);
  if (passwordHash !== undefined) passwordParts(passwordHash);
  db.exec('BEGIN IMMEDIATE');
  try {
    const admin = requireAdministrator(db);
    if (expectedRevision !== undefined && (admin.revision !== expectedRevision || !db.prepare('SELECT 1 FROM sessions WHERE id=? AND adminId=? AND expires>?').get(sessionId, admin.id, now))) {
      throw new HttpError(401, '账号或会话已变更，请重新登录', 'session_changed');
    }
    db.prepare('UPDATE administrators SET username=?, passwordHash=?, mustChangePassword=?, revision=revision+1 WHERE id=?')
      .run(username ?? admin.username, passwordHash ?? admin.passwordHash, mustChangePassword === undefined ? admin.mustChangePassword : Number(mustChangePassword), admin.id);
    db.prepare('DELETE FROM sessions WHERE adminId=?').run(admin.id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function createAdministratorSession(db, admin, id, csrf, expires) {
  // Recheck the credential revision atomically after asynchronous scrypt verification.
  return db.prepare(`INSERT INTO sessions (id,csrf,expires,adminId)
    SELECT ?,?,?,id FROM administrators WHERE id=? AND revision=?`)
    .run(id, csrf, expires, admin.id, admin.revision).changes === 1;
}
// BEGIN IMMEDIATE serializes counters across server processes sharing the SQLite file.
export function allowLogin(db, address, config, now) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM login_attempts WHERE expires <= ?').run(now);
    const buckets = [['global', config.globalLoginLimit], [digest(address), config.loginLimit]];
    const allowed = buckets.every(([bucket, limit]) => (db.prepare('SELECT count FROM login_attempts WHERE bucket=?').get(bucket)?.count || 0) < limit);
    if (allowed) for (const [bucket] of buckets) {
      db.prepare('INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').run(bucket, now + config.loginWindowMs);
    }
    db.exec('COMMIT');
    return allowed;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
