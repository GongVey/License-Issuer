import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign, verify, createPublicKey } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.mjs';
import { productsFromEnv } from '../cards.mjs';
import { runAdmin } from '../admin.mjs';
import { DatabaseSync } from 'node:sqlite';
import { CLIENT_PUBLIC_KEY, publicKeyFor, assertMatchingKey, hashPassword, verifyPassword, configFromEnv, issueLicense, openDatabase, allowLogin, initializeAdministrator, importAdministrator, updateAdministrator, requireAdministrator, createAdministratorSession } from '../lib.mjs';

const { privateKey } = generateKeyPairSync('ed25519');
const machine = 'sha256:' + 'a'.repeat(64);
const password = randomBytes(32).toString('base64url');
const passwordHash = await hashPassword(password);

test('product configuration validates stable identifiers', () => {
  assert.deepEqual(productsFromEnv({}), ['photoarchiver', 'wallpaper']);
  assert.deepEqual(productsFromEnv({ LICENSE_PRODUCTS: 'photoarchiver,custom,custom' }), ['photoarchiver', 'custom']);
  assert.throws(() => productsFromEnv({ LICENSE_PRODUCTS: 'PhotoArchiver' }), /Invalid/);
});

test('cards activate online with product-bound offline signatures and two persistent device slots', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/cards')).status, 401);
  await f.login();
  assert.equal((await f.request('/api/cards', 'POST', { productId: 'photoarchiver', edition: 'standard' }, { 'X-CSRF-Token': '' })).status, 403);
  const created = await f.request('/api/cards', 'POST', { productId: 'photoarchiver', edition: 'standard', note: 'Customer A' });
  assert.equal(created.status, 201);
  const card = created.body;
  assert.equal(card.maxDevices, 2);
  assert.match(card.cardCode, /^LIC-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/);
  const anonymous = { Cookie: '', 'X-CSRF-Token': '' };
  const input = { cardCode: card.cardCode, productId: 'photoarchiver', machineFingerprint: machine };
  assert.equal((await f.request('/api/v1/activate', 'POST', { ...input, productId: 'wallpaper' }, anonymous)).status, 404);
  assert.equal((await f.request('/api/v1/activate', 'POST', input, { ...anonymous, Origin: 'https://attacker.example' })).status, 403);
  // A native desktop client sends neither administrator credentials nor an Origin header.
  const native = await fetch(f.config.origin + '/api/v1/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(native.status, 200);
  const first = await native.json();
  const [prefix, encoded, signature] = first.license.split('.');
  assert.equal(prefix, 'GL1');
  const bytes = Buffer.from(encoded, 'base64url');
  const payload = JSON.parse(bytes);
  assert.equal(payload.productId, 'photoarchiver');
  assert.equal(payload.machineFingerprint, machine);
  assert.equal(payload.cardId, card.cardId);
  assert.equal(payload.version, 1);
  assert.ok(verify(null, Buffer.concat([Buffer.from('GL1.'), bytes]), createPublicKey(privateKey), Buffer.from(signature, 'base64url')));
  assert.ok(!verify(null, bytes, createPublicKey(privateKey), Buffer.from(signature, 'base64url')));
  const changed = Buffer.from(JSON.stringify({ ...payload, productId: 'wallpaper' }));
  assert.ok(!verify(null, Buffer.concat([Buffer.from('GL1.'), changed]), createPublicKey(privateKey), Buffer.from(signature, 'base64url')));
  const repeat = await f.request('/api/v1/activate', 'POST', { ...input, cardCode: card.cardCode.toLowerCase() }, anonymous);
  assert.equal(repeat.body.license, first.license);
  assert.equal(repeat.body.usedDevices, 1);
  const concurrent = await Promise.all(['b', 'c', 'd'].map(x => f.request('/api/v1/activate', 'POST', { ...input, machineFingerprint: 'sha256:' + x.repeat(64) }, anonymous)));
  assert.deepEqual(concurrent.map(x => x.status).sort(), [200, 409, 409]);
  const detail = (await f.request(`/api/cards/${card.cardId}`)).body;
  assert.equal(detail.devices.length, 2);
  assert.equal(detail.cardCode, undefined);
  assert.equal(detail.codeHash, undefined);
  assert.equal((await f.request('/api/cards?productId=wallpaper')).body.total, 0);
  assert.equal((await f.request('/api/cards?q=Customer')).body.total, 1);
  const dashboard = await f.request('/api/dashboard');
  assert.equal(dashboard.status, 200);
  assert.deepEqual(dashboard.body.totals, { total: 1, active: 1, disabled: 0, activations: 2 });
  assert.equal((await f.request('/api/cards?status=disabled')).body.total, 0);
  assert.equal((await f.request('/api/cards?status=active')).body.total, 1);
  assert.equal((await f.request('/api/cards?q=%27%20OR%201%3D1')).body.total, 0);
  const db = openDatabase(f.config.database);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM cards').all()).includes(card.cardCode));
  db.close();
  await f.request(`/api/cards/${card.cardId}`, 'PATCH', { status: 'disabled' });
  assert.equal((await f.request('/api/v1/activate', 'POST', input, anonymous)).status, 403);
  await f.restart();
  assert.equal((await f.request(`/api/cards/${card.cardId}`)).body.status, 'disabled');
  await f.request(`/api/cards/${card.cardId}`, 'PATCH', { status: 'active' });
  assert.equal((await f.request('/api/v1/activate', 'POST', input, anonymous)).body.license, first.license);
  const wallpaper = (await f.request('/api/cards', 'POST', { productId: 'wallpaper', edition: 'standard', maxDevices: 1 })).body;
  const activated = await f.request('/api/v1/activate', 'POST', { ...input, productId: 'wallpaper', cardCode: wallpaper.cardCode }, anonymous);
  assert.equal(activated.status, 200);
  assert.equal(activated.body.productId, 'wallpaper');
  assert.equal((await f.request('/api/v1/activate', 'POST', { ...input, productId: 'wallpaper', cardCode: wallpaper.cardCode, machineFingerprint: 'sha256:' + 'e'.repeat(64) }, anonymous)).status, 409);
});

test('card validation, activation throttling and admin login counters are independent', async t => {
  const f = await fixture(t); await f.login();
  for (const input of [{ productId: 'unknown', edition: 'standard' }, { productId: 'photoarchiver', edition: 'invalid' },
    ...[0, 101, 1.5, '2', null].map(maxDevices => ({ productId: 'photoarchiver', edition: 'standard', maxDevices }))]) {
    assert.equal((await f.request('/api/cards', 'POST', input)).status, 400);
  }
  const card = (await f.request('/api/cards', 'POST', { productId: 'photoarchiver', edition: 'standard' })).body;
  const input = { cardCode: card.cardCode, productId: 'photoarchiver', machineFingerprint: 'invalid' };
  for (let i = 0; i < 60; i++) assert.equal((await f.request('/api/v1/activate', 'POST', input)).status, 400);
  await f.restart();
  assert.equal((await f.request('/api/v1/activate', 'POST', input)).status, 429);
  await f.login();
  f.advance(60001);
  assert.equal((await f.request('/api/v1/activate', 'POST', { ...input, machineFingerprint: machine })).status, 200);
  assert.equal((await f.request('/api/cards?offset=-1')).status, 400);
  assert.equal((await f.request(`/api/cards/${card.cardId}`, 'PATCH', { status: 'archived' })).status, 400);
});

async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'pa-issuer-test-'));
  const config = { database: join(directory, 'test.sqlite'), privateKey, origin: 'http://127.0.0.1', secure: false,
    editions: ['standard', 'professional'], sessionMs: 3600000,
    loginWindowMs: 900000, loginLimit: 10, globalLoginLimit: 100, ...overrides };
  let now = Date.now();
  const db = openDatabase(config.database);
  initializeAdministrator(db, 'test-admin', passwordHash);
  db.close();
  let app;
  async function start() {
    app = createApp(config, { clock: () => now });
    app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    config.origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  async function stop() {
    const closed = once(app.server, 'close'); app.server.close(); app.server.closeAllConnections(); await closed;
  }
  await start();
  t.after(async () => { await stop(); rmSync(directory, { recursive: true, force: true }); });
  let cookie = ''; let csrf = '';
  async function request(path, method = 'GET', data, headers = {}) {
    const res = await fetch(config.origin + path, { method, headers: { Cookie: cookie, Origin: config.origin,
      'X-CSRF-Token': csrf, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: data === undefined ? undefined : JSON.stringify(data) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: res.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
  }
  async function login() {
    const res = await request('/api/login', 'POST', { username: 'test-admin', password });
    assert.equal(res.status, 200); cookie = res.headers.get('set-cookie').split(';')[0]; csrf = res.body.csrf;
    return res;
  }
  return { config, request, login, restart: async () => { await stop(); await start(); }, advance: ms => { now += ms; } };
}

test('license payload contract and independent Python Ed25519 verification', () => {
  assert.match(CLIENT_PUBLIC_KEY, /^[A-Za-z0-9_-]{43}$/);
  const record = issueLicense(privateKey, { machineFingerprint: machine, edition: 'standard', note: 'Synthetic only' }, ['standard']);
  const [, encoded] = record.code.split('.');
  const tamperedPayload = { ...JSON.parse(Buffer.from(encoded, 'base64url')), edition: 'changed' };
  const tampered = `PA1.${Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url')}.${record.code.split('.')[2]}`;
  const wrongMessageSignature = `PA1.${encoded}.${sign(null, Buffer.from(`PA1.${encoded}`), privateKey).toString('base64url')}`;
  const result = spawnSync(process.env.PYTHON || 'python', [fileURLToPath(new URL('./verify.py', import.meta.url))], {
    input: JSON.stringify({ code: record.code, publicKey: publicKeyFor(privateKey), machine, tampered, wrongMessageSignature }), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(payload), ['licenseId', 'machineFingerprint', 'edition', 'issuedAt']);
  assert.equal(payload.licenseId, record.licenseId);
  assert.ok(Math.abs(payload.issuedAt - Date.now()) < 20000);
});

test('startup rejects absent SQLite administrator and unsafe remote HTTP', () => {
  assert.throws(() => createApp({ database: ':memory:' }), /No administrator initialized.*admin:init/);
  assert.throws(() => configFromEnv({}), /PRIVATE_KEY_PATH/);
  assert.throws(() => configFromEnv({ PUBLIC_ORIGIN: 'http://example.com' }), /HTTPS/);
  assert.throws(() => configFromEnv({ HOST: '0.0.0.0' }), /HTTPS/);
  assert.throws(() => configFromEnv({ ADMIN_PASSWORD_HASH: passwordHash }), /PRIVATE_KEY_PATH/);
  assert.throws(() => issueLicense(privateKey, { machineFingerprint: machine.toUpperCase(), edition: 'standard' }, ['standard']), /机器码/);
  assert.throws(() => issueLicense(privateKey, { machineFingerprint: machine, edition: '' }, ['standard']), /授权版本/);
  assert.throws(() => publicKeyFor(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), /Ed25519/);
  assert.throws(() => assertMatchingKey(privateKey, CLIENT_PUBLIC_KEY), /does not match/);
  assert.equal(assertMatchingKey(privateKey, publicKeyFor(privateKey)), privateKey);
});

test('interactive CLI initialization, confirmation, validation, persistence and duplicate refusal need no signing key', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pa-issuer-admin-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { DATABASE_PATH: join(directory, 'test.sqlite') };
  const output = [];
  const prompts = { askUsername: async () => 'owner', askPassword: async () => password, output: text => output.push(text) };
  let count = 0;
  await assert.rejects(runAdmin('init', env, { ...prompts, askPassword: async () => ++count === 1 ? password : 'mismatch' }), /do not match/);
  await assert.rejects(runAdmin('init', env, { ...prompts, askPassword: async () => '' }), /nonempty/);
  await assert.rejects(runAdmin('init', env, { ...prompts, askUsername: async () => 'bad username' }), /Username/);
  await runAdmin('init', env, prompts);
  await assert.rejects(runAdmin('init', env, { ...prompts, askUsername: async () => { assert.fail('Must refuse before prompting'); } }), /already initialized/);
  const db = openDatabase(env.DATABASE_PATH);
  try {
    const admin = requireAdministrator(db);
    assert.equal(admin.username, 'owner');
    assert.notEqual(admin.passwordHash, password);
    assert.ok(await verifyPassword(password, admin.passwordHash));
    assert.ok(!(await verifyPassword('incorrect', admin.passwordHash)));
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM administrators').all()).includes(password));
  } finally { db.close(); }
  assert.ok(output.every(text => !text.includes(password) && !text.includes('scrypt$')));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../admin.mjs', import.meta.url)), 'password-hash'], { encoding: 'utf8', input: password });
  assert.equal(result.status, 1); assert.match(result.stderr, /interactive terminal/);
  assert.ok(!result.stdout.includes(password));
});

test('CLI rename and password reset revoke live sessions and persist without ENV fallback', async t => {
  const f = await fixture(t);
  await f.login();
  const env = { DATABASE_PATH: f.config.database };
  const nextPassword = randomBytes(32).toString('base64url');
  const prompts = { askUsername: async () => 'renamed-owner', askPassword: async () => nextPassword, output: () => {} };
  await runAdmin('rename', env, prompts);
  assert.equal((await f.request('/api/session')).status, 401);
  assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password })).status, 401);
  const renamed = await f.request('/api/login', 'POST', { username: 'renamed-owner', password });
  assert.equal(renamed.status, 200);
  const headers = { Cookie: renamed.headers.get('set-cookie').split(';')[0] };
  assert.equal((await f.request('/api/session', 'GET', undefined, headers)).body.username, 'renamed-owner');
  await runAdmin('reset-password', env, prompts);
  assert.equal((await f.request('/api/session', 'GET', undefined, headers)).status, 401);
  assert.equal((await f.request('/api/login', 'POST', { username: 'renamed-owner', password })).status, 401);
  // Even obsolete config properties supplied by an old caller must not override SQLite.
  f.config.username = 'test-admin'; f.config.passwordHash = passwordHash;
  await f.restart();
  assert.equal((await f.request('/api/login', 'POST', { username: 'renamed-owner', password: nextPassword })).status, 200);
  assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password })).status, 401);
});

test('default initialization stores only a hash and preserves existing accounts', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pa-issuer-initial-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { DATABASE_PATH: join(directory, 'test.sqlite') };
  let delivered = '';
  await runAdmin('init-default', env, { output: text => { if (text.startsWith('Initial administrator')) delivered = text; } });
  const initialPassword = delivered.split(': ').at(-1);
  assert.equal(initialPassword, 'admin123');
  const db = openDatabase(env.DATABASE_PATH);
  try {
    const admin = requireAdministrator(db);
    assert.equal(admin.username, 'admin');
    assert.equal(admin.mustChangePassword, 1);
    assert.ok(await verifyPassword(initialPassword, admin.passwordHash));
    assert.ok(!JSON.stringify(admin).includes(initialPassword));
  } finally { db.close(); }
  await runAdmin('init-default', env, { output: text => assert.match(text, /already initialized/) });
});

test('credential revision prevents in-flight old login from restoring revoked sessions', async () => {
  const db = openDatabase(':memory:');
  try {
    initializeAdministrator(db, 'owner', passwordHash);
    const old = requireAdministrator(db);
    const verification = verifyPassword(password, old.passwordHash);
    updateAdministrator(db, { passwordHash: await hashPassword(randomBytes(32).toString('hex')) });
    assert.ok(await verification);
    assert.equal(createAdministratorSession(db, old, 'stale', 'csrf', Date.now() + 10000), false);
    assert.equal(createAdministratorSession(db, requireAdministrator(db), 'fresh', 'csrf', Date.now() + 10000), true);
    assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 1);
  } finally { db.close(); }
});

test('legacy schema migration preserves licenses and throttles, revokes unowned sessions; explicit ENV import only', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pa-issuer-migration-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'test.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    INSERT INTO sessions VALUES ('old','csrf',9999999999999);
    CREATE TABLE licenses (licenseId TEXT PRIMARY KEY, machineFingerprint TEXT NOT NULL, edition TEXT NOT NULL,
      issuedAt INTEGER NOT NULL, note TEXT NOT NULL, code TEXT NOT NULL, status TEXT NOT NULL);
    INSERT INTO licenses VALUES ('kept','synthetic','standard',1,'note','synthetic-code','active');
    CREATE TABLE login_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    INSERT INTO login_attempts VALUES ('global',100,9999999999999);`);
  legacy.close();
  let db = openDatabase(path);
  assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 0);
  assert.throws(() => requireAdministrator(db), /No administrator/);
  assert.throws(() => importAdministrator(db, { ADMIN_PASSWORD_HASH: passwordHash }), /requires ADMIN_USERNAME/);
  assert.throws(() => importAdministrator(db, { ADMIN_USERNAME: 'legacy', ADMIN_PASSWORD_HASH: password }), /scrypt hash/);
  db.close();
  await runAdmin('import-env', { DATABASE_PATH: path, ADMIN_USERNAME: 'legacy', ADMIN_PASSWORD_HASH: passwordHash }, { output: () => {} });
  await assert.rejects(runAdmin('import-env', { DATABASE_PATH: path, ADMIN_USERNAME: 'overwrite', ADMIN_PASSWORD_HASH: passwordHash }), /already initialized/);
  db = openDatabase(path);
  try {
    assert.equal(requireAdministrator(db).username, 'legacy');
    assert.ok(await verifyPassword(password, requireAdministrator(db).passwordHash));
    assert.equal(db.prepare('SELECT code FROM licenses').get().code, 'synthetic-code');
    assert.equal(allowLogin(db, 'one', { loginLimit: 10, globalLoginLimit: 100, loginWindowMs: 1000 }, 1), false);
  } finally { db.close(); }
});

test('authentication, headers, CSRF, session rotation, expiry and logout', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/licenses')).status, 401);
  assert.equal((await f.request('/api/licenses', 'POST', {})).status, 401);
  assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password }, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password }, { Origin: '' })).status, 403);
  assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password: randomBytes(32).toString('hex') })).status, 401);
  const login = await f.login();
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=3600/);
  const oldCookie = login.headers.get('set-cookie').split(';')[0];
  const page = await f.request('/');
  assert.equal(page.status, 200); assert.match(page.body, /name="viewport"/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal((await f.request('/api/licenses', 'POST', {}, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await f.request('/api/logout', 'POST', {}, { Origin: 'null' })).status, 403);
  // Fetch rewrites Host. Use the raw HTTP client to exercise the actual Host defense.
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(f.config.origin + '/', { headers: { Host: 'attacker.example' } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  await f.login();
  assert.equal((await f.request('/api/session', 'GET', undefined, { Cookie: oldCookie })).status, 401);
  assert.equal((await f.request('/api/logout', 'POST', {})).status, 200);
  assert.equal((await f.request('/api/session')).status, 401);
  await f.login(); f.advance(3600001);
  assert.equal((await f.request('/api/session')).status, 401);
});

test('account changes require current password and CSRF, then revoke every session', async t => {
  const f = await fixture(t);
  await f.login();
  assert.equal((await f.request('/api/account', 'PATCH', { currentPassword: password, username: 'renamed' }, { Cookie: '' })).status, 401);
  const second = await f.request('/api/login', 'POST', { username: 'test-admin', password }, { Cookie: '' });
  const secondCookie = second.headers.get('set-cookie').split(';')[0];
  const nextPassword = randomBytes(32).toString('base64url');
  assert.equal((await f.request('/api/account', 'PATCH', { currentPassword: 'wrong', username: 'renamed', newPassword: nextPassword })).status, 403);
  assert.equal((await f.request('/api/account', 'PATCH', { currentPassword: password, username: 'renamed', newPassword: nextPassword }, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await f.request('/api/account', 'PATCH', { currentPassword: password, username: 'renamed', newPassword: nextPassword }, { Cookie: secondCookie, 'X-CSRF-Token': '' })).status, 403);
  const changed = await f.request('/api/account', 'PATCH', { currentPassword: password, username: 'renamed', newPassword: nextPassword });
  assert.equal(changed.status, 200);
  assert.equal((await f.request('/api/session')).status, 401);
  assert.equal((await f.request('/api/session', 'GET', undefined, { Cookie: secondCookie })).status, 401);
  assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password })).status, 401);
  assert.equal((await f.request('/api/login', 'POST', { username: 'renamed', password: nextPassword })).status, 200);
});

test('batch creation and confirmed deletion are authorized, atomic and remove device records', async t => {
  const f = await fixture(t);
  const input = { productId: 'photoarchiver', edition: 'standard', quantity: 3, note: 'Batch customer' };
  assert.equal((await f.request('/api/cards/batch', 'POST', input)).status, 401);
  assert.equal((await f.request('/api/cards/batch', 'DELETE', { cardIds: [], confirmed: true })).status, 401);
  await f.login();
  assert.equal((await f.request('/api/cards/batch', 'POST', input, { 'X-CSRF-Token': '' })).status, 403);
  for (const quantity of [0, 101, 1.5, '3', null]) assert.equal((await f.request('/api/cards/batch', 'POST', { ...input, quantity })).status, 400);
  assert.equal((await f.request('/api/cards/batch', 'POST', { ...input, edition: 'invalid' })).status, 400);
  assert.equal((await f.request('/api/cards')).body.total, 0);
  const created = await f.request('/api/cards/batch', 'POST', input);
  assert.equal(created.status, 201);
  const cards = created.body.items;
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map(card => card.cardCode)).size, 3);
  assert.ok(cards.every(card => card.maxDevices === 2 && card.note === input.note));
  const activation = { cardCode: cards[0].cardCode, productId: 'photoarchiver', machineFingerprint: machine };
  assert.equal((await f.request('/api/v1/activate', 'POST', activation)).status, 200);
  const deletion = { cardIds: cards.slice(0, 2).map(card => card.cardId), confirmed: true };
  assert.equal((await f.request('/api/cards/batch', 'DELETE', deletion, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await f.request('/api/cards/batch', 'DELETE', deletion, { Origin: 'https://attacker.example' })).status, 403);
  for (const invalid of [{ cardIds: deletion.cardIds }, { ...deletion, confirmed: 'true' }, { ...deletion, cardIds: [] },
    { ...deletion, cardIds: [cards[0].cardId, cards[0].cardId] }, { ...deletion, cardIds: ['invalid'] }]) {
    assert.equal((await f.request('/api/cards/batch', 'DELETE', invalid)).status, 400);
  }
  assert.equal((await f.request('/api/cards/batch', 'DELETE', { ...deletion, cardIds: [cards[0].cardId, '00000000-0000-0000-0000-000000000000'] })).status, 404);
  assert.equal((await f.request('/api/cards')).body.total, 3);
  // A database failure after the first deletion must roll the entire batch back.
  const db = openDatabase(f.config.database);
  db.exec(`CREATE TRIGGER prevent_test_delete BEFORE DELETE ON cards WHEN OLD.cardId='${cards[1].cardId}' BEGIN SELECT RAISE(ABORT,'test rollback'); END;`);
  assert.equal((await f.request('/api/cards/batch', 'DELETE', deletion)).status, 500);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cards').get().count, 3);
  assert.equal(db.prepare('SELECT count(*) AS count FROM activations').get().count, 1);
  db.exec('DROP TRIGGER prevent_test_delete');
  const removed = await f.request('/api/cards/batch', 'DELETE', deletion);
  assert.equal(removed.status, 200); assert.equal(removed.body.deleted, 2);
  assert.equal(db.prepare('SELECT count(*) AS count FROM activations').get().count, 0);
  db.exec(`CREATE TRIGGER prevent_test_insert BEFORE INSERT ON cards WHEN (SELECT count(*) FROM cards)>=2 BEGIN SELECT RAISE(ABORT,'test rollback'); END;`);
  assert.equal((await f.request('/api/cards/batch', 'POST', input)).status, 500);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cards').get().count, 1);
  db.exec('DROP TRIGGER prevent_test_insert');
  db.close();
  await f.restart();
  assert.equal((await f.request('/api/cards')).body.total, 1);
  assert.equal((await f.request(`/api/cards/${cards[2].cardId}`)).status, 200);
  assert.equal((await f.request('/api/v1/activate', 'POST', activation)).status, 404);
});

test('dedicated password endpoint accepts short passwords and revokes sessions', async t => {
  const f = await fixture(t);
  await f.login();
  const path = '/api/account/password';
  assert.equal((await f.request(path, 'PATCH', { currentPassword: password, newPassword: '1' }, { Cookie: '' })).status, 401);
  assert.equal((await f.request(path, 'PATCH', { currentPassword: password, newPassword: '1' }, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await f.request(path, 'PATCH', { currentPassword: 'wrong', newPassword: '1' })).status, 403);
  for (const input of [{ currentPassword: password }, { currentPassword: password, newPassword: '' },
    { currentPassword: password, newPassword: 'a'.repeat(257) }, { currentPassword: password, newPassword: '1', username: 'other' }]) {
    assert.equal((await f.request(path, 'PATCH', input)).status, 400);
  }
  assert.equal((await f.request(path, 'PATCH', { currentPassword: password, newPassword: '1' })).status, 200);
  assert.equal((await f.request('/api/session')).status, 401);
  assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password })).status, 401);
  await f.restart();
  assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password: '1' })).status, 200);
  assert.ok(await verifyPassword('1', await hashPassword('1')));
});

test('temporary administrator can only update account until password is changed', async t => {
  const f = await fixture(t);
  const db = openDatabase(f.config.database);
  updateAdministrator(db, { passwordHash: await hashPassword(password), mustChangePassword: true });
  db.close();
  await f.login();
  assert.equal((await f.request('/api/licenses')).status, 403);
  assert.equal((await f.request('/api/cards')).status, 403);
  assert.equal((await f.request('/api/cards', 'POST', { productId: 'photoarchiver', edition: 'standard' })).status, 403);
  assert.equal((await f.request('/api/licenses', 'POST', { machineFingerprint: machine, edition: 'standard' })).status, 403);
  assert.equal((await f.request('/api/account', 'PATCH', { currentPassword: password, username: 'test-admin' })).status, 400);
  assert.equal((await f.request('/api/account', 'PATCH', { currentPassword: password, newPassword: password })).status, 400);
  const nextPassword = randomBytes(32).toString('base64url');
  assert.equal((await f.request('/api/account', 'PATCH', { currentPassword: password, username: 'test-admin', newPassword: nextPassword })).status, 200);
  const login = await f.request('/api/login', 'POST', { username: 'test-admin', password: nextPassword });
  assert.equal(login.status, 200);
  const loginCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/api/licenses', 'POST', { machineFingerprint: machine, edition: 'standard' }, { Cookie: loginCookie, 'X-CSRF-Token': login.body.csrf })).status, 201);
});

test('issuance, literal injection search, validation, concurrent persistence and local status', async t => {
  const f = await fixture(t); await f.login();
  const input = { machineFingerprint: machine, edition: 'standard', note: "<script>alert(1)</script> ' OR 1=1 -- %_" };
  const issued = await f.request('/api/licenses', 'POST', input);
  assert.equal(issued.status, 201); assert.match(issued.body.code, /^PA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/);
  const id = issued.body.licenseId;
  assert.equal((await f.request(`/api/licenses/${id}`)).body.note, input.note);
  assert.equal((await f.request('/api/licenses?q=' + encodeURIComponent("' OR 1=1 --"))).body.total, 1);
  assert.equal((await f.request('/api/licenses?q=' + encodeURIComponent("' OR 2=2 --"))).body.total, 0);
  for (const invalid of [{ ...input, edition: 'unknown' }, { ...input, issuedAt: 1 }, { ...input, note: 'x'.repeat(2001) }, { ...input, machineFingerprint: 'a' }, { ...input, note: 1 }]) {
    assert.equal((await f.request('/api/licenses', 'POST', invalid)).status, 400);
  }
  assert.equal((await f.request('/api/licenses', 'POST', { ...input, note: 'x'.repeat(20000) })).status, 413);
  assert.equal((await f.request('/api/licenses', 'POST', input, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.request('/api/licenses?offset=-1')).status, 400);
  assert.equal((await f.request('/api/licenses?offset=NaN')).status, 400);
  const batch = await Promise.all(Array.from({ length: 35 }, (_, n) => f.request('/api/licenses', 'POST', { ...input, note: `Synthetic ${n}` })));
  assert.ok(batch.every(x => x.status === 201));
  assert.equal(new Set(batch.map(x => x.body.licenseId)).size, 35);
  const archived = await f.request(`/api/licenses/${id}`, 'PATCH', { status: 'archived' });
  assert.equal(archived.body.code, issued.body.code); assert.equal(archived.body.status, 'archived');
  assert.equal((await f.request(`/api/licenses/${id}`, 'PATCH', { status: 'revoked' })).status, 400);
  await f.restart();
  const list = await f.request('/api/licenses');
  assert.equal(list.body.total, 36); assert.equal(list.body.items.length, 30);
  assert.equal((await f.request('/api/licenses?offset=30')).body.items.length, 6);
  assert.equal((await f.request(`/api/licenses/${id}`)).body.code, issued.body.code);
  assert.equal((await f.request(`/api/licenses/${id}`)).body.status, 'archived');
  for (const path of ['/.env', '/server.mjs', '/data/issuer.sqlite', '/%2e%2e/lib.mjs']) assert.equal((await f.request(path)).status, 404);
  for (const path of ['/app.js', '/js/dom.js', '/js/ui.js', '/js/card-drawer.js', '/js/generate.js', '/js/lookup.js', '/js/views/cards.js', '/js/views/overview.js', '/js/views/settings.js']) {
    const js = (await f.request(path)).body;
    assert.ok(js.length > 100, path); assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(js), path); assert.ok(!js.includes('privateKey'), path);
  }
});

test('login limit persists through restart and resets only after window', async t => {
  const f = await fixture(t, { loginLimit: 2 });
  for (let i = 0; i < 2; i++) assert.equal((await f.request('/api/login', 'POST', { username: 'test-admin', password: 'invalid' })).status, 401);
  await f.restart();
  const blocked = await f.request('/api/login', 'POST', { username: 'test-admin', password }, { 'X-Forwarded-For': '203.0.113.9' });
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '900');
  f.advance(900001); await f.login();
});

test('SQLite connections share transactional rate counters', t => {
  const directory = mkdtempSync(join(tmpdir(), 'pa-issuer-db-test-'));
  const a = openDatabase(join(directory, 'test.sqlite')); const b = openDatabase(join(directory, 'test.sqlite'));
  t.after(() => { a.close(); b.close(); rmSync(directory, { recursive: true, force: true }); });
  const config = { loginLimit: 2, globalLoginLimit: 3, loginWindowMs: 1000 };
  assert.equal(allowLogin(a, 'one', config, 1), true);
  assert.equal(allowLogin(b, 'one', config, 1), true);
  assert.equal(allowLogin(a, 'one', config, 1), false);
  assert.equal(allowLogin(b, 'two', config, 1), true);
  assert.equal(allowLogin(a, 'three', config, 1), false);
});

test('HTTPS deployment sets Secure host-only cookies and HSTS', async t => {
  // The fixture represents the loopback HTTP hop behind the TLS reverse proxy.
  const f = await fixture(t, { secure: true });
  const login = await f.login();
  assert.match(login.headers.get('set-cookie'), /^__Host-pa_session=/);
  assert.match(login.headers.get('set-cookie'), /; Secure$/);
  assert.ok(!login.headers.get('set-cookie').includes('Domain='));
  assert.equal(login.headers.get('strict-transport-security'), 'max-age=31536000');
});

test('card codes are stored encrypted, revealable, exportable and found by lookup', async t => {
  const f = await fixture(t); await f.login();
  const created = await f.request('/api/cards/batch', 'POST', { productId: 'wallpaper', edition: 'standard', quantity: 2, customer: '张三', channel: '闲鱼', orderNo: '=cmd', note: 'n' });
  assert.equal(created.status, 201);
  const [card] = created.body.items;
  assert.equal(card.customer, '张三'); assert.equal(card.state, 'unused'); assert.equal(card.hasCode, true);
  assert.equal(created.body.batchId, card.batchId);
  const db = openDatabase(f.config.database);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM cards').all()).includes(card.cardCode));
  db.close();
  assert.equal((await f.request(`/api/cards/${card.cardId}/reveal`, 'POST', {}, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await f.request(`/api/cards/${card.cardId}/reveal`, 'POST', {})).body.cardCode, card.cardCode);
  const found = await f.request('/api/lookup', 'POST', { query: ` ${card.cardCode.toLowerCase()} ` });
  assert.equal(found.body.kind, 'cardCode'); assert.equal(found.body.cards[0].cardId, card.cardId);
  assert.equal((await f.request('/api/lookup', 'POST', { query: '张三' })).body.cards.length, 2);
  await f.request('/api/v1/activate', 'POST', { cardCode: card.cardCode, productId: 'wallpaper', machineFingerprint: machine });
  const byMachine = await f.request('/api/lookup', 'POST', { query: machine.toUpperCase() });
  assert.equal(byMachine.body.kind, 'machine'); assert.deepEqual(byMachine.body.cards.map(x => x.cardId), [card.cardId]);
  const csv = await f.request(`/api/cards/export?batchId=${card.batchId}&codes=1`);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.body.includes(card.cardCode)); assert.ok(csv.body.includes("'=cmd"));
  assert.ok(!(await f.request(`/api/cards/export?batchId=${card.batchId}`)).body.includes(card.cardCode));
  assert.equal((await f.request('/api/cards?state=partial')).body.total, 1);
  assert.equal((await f.request('/api/cards?state=unused')).body.total, 1);
  assert.equal((await f.request('/api/cards?state=bogus')).status, 400);
  const audit = (await f.request('/api/audit-log')).body.items.map(x => x.action);
  assert.ok(audit.includes('card.reveal') && audit.includes('cards.export') && audit.includes('cards.create'));
});

test('activation log, device release, edits, batch status and dashboard trend', async t => {
  const f = await fixture(t); await f.login();
  const card = (await f.request('/api/cards', 'POST', { productId: 'photoarchiver', edition: 'standard', maxDevices: 1 })).body;
  const activate = fingerprint => f.request('/api/v1/activate', 'POST', { cardCode: card.cardCode, productId: 'photoarchiver', machineFingerprint: fingerprint }, { Cookie: '', 'X-CSRF-Token': '' });
  const other = 'sha256:' + 'b'.repeat(64);
  assert.equal((await activate(machine)).status, 200);
  f.advance(1000);
  assert.equal((await activate(machine)).status, 200);
  const limited = await activate(other);
  assert.equal(limited.status, 409); assert.equal(limited.body.code, 'device_limit');
  const log = (await f.request(`/api/activation-log?cardId=${card.cardId}`)).body;
  assert.deepEqual(log.items.map(x => x.result), ['device_limit', 'renewed', 'activated']);
  assert.equal((await f.request('/api/activation-log?result=failed')).body.total, 1);
  let detail = (await f.request(`/api/cards/${card.cardId}`)).body;
  assert.equal(detail.state, 'full'); assert.equal(detail.devices[0].lastSeenAt, detail.devices[0].issuedAt + 1000);
  const release = `/api/cards/${card.cardId}/devices/${detail.devices[0].activationId}/release`;
  assert.equal((await f.request(release, 'POST', {})).status, 400);
  detail = (await f.request(release, 'POST', { confirmed: true })).body;
  assert.equal(detail.devices.length, 0); assert.equal(detail.releases, 1);
  assert.equal((await activate(other)).status, 200);
  const edited = await f.request(`/api/cards/${card.cardId}`, 'PATCH', { customer: ' 李四 ', note: 'VIP' });
  assert.equal(edited.body.customer, '李四'); assert.equal(edited.body.note, 'VIP');
  assert.equal((await f.request(`/api/cards/${card.cardId}`, 'PATCH', { customer: 'x'.repeat(121) })).status, 400);
  assert.equal((await f.request(`/api/batches/${card.batchId}`, 'PATCH', { status: 'disabled' })).body.disabled, 1);
  assert.equal((await activate(other)).body.code, 'card_disabled');
  assert.equal((await f.request('/api/cards/batch', 'PATCH', { cardIds: [card.cardId], status: 'active' })).body.updated, 1);
  const batches = (await f.request('/api/batches')).body;
  assert.equal(batches.total, 1); assert.equal(batches.items[0].activatedCards, 1);
  const dashboard = (await f.request('/api/dashboard?tz=-480')).body;
  assert.equal(dashboard.trend.length, 30);
  assert.deepEqual(dashboard.trend.at(-1), { date: dashboard.trend.at(-1).date, activated: 2, renewed: 1, failed: 2 });
  assert.equal(dashboard.products.find(x => x.productId === 'photoarchiver').full, 1);
});

test('settings validate products, templates and presets; backup downloads a SQLite copy', async t => {
  const f = await fixture(t); await f.login();
  const settings = (await f.request('/api/settings')).body;
  assert.equal(settings.products[0].name, '照片归档');
  assert.equal((await f.request('/api/settings', 'PUT', { products: [{ id: 'unknown', name: 'x', color: 'teal' }] })).status, 400);
  assert.equal((await f.request('/api/settings', 'PUT', { presets: [{ name: 'p', productId: 'wallpaper', edition: 'standard', maxDevices: 0, quantity: 1 }] })).status, 400);
  const saved = await f.request('/api/settings', 'PUT', { products: [{ id: 'wallpaper', name: '动态壁纸', color: 'rose' }], templates: { wallpaper: '码：{cardCode}' },
    presets: [{ name: '壁纸单卡', productId: 'wallpaper', edition: 'standard', maxDevices: 2, quantity: 1 }] });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.products.find(x => x.id === 'wallpaper').name, '动态壁纸');
  assert.equal(saved.body.templates.wallpaper, '码：{cardCode}');
  assert.match(saved.body.presets[0].id, /^[a-f0-9-]{36}$/);
  assert.equal((await f.request('/api/session')).body.settings.presets.length, 1);
  const backup = await fetch(f.config.origin + '/api/backup', { headers: { Cookie: (await f.login()).headers.get('set-cookie').split(';')[0] } });
  assert.equal(backup.status, 200);
  assert.equal(Buffer.from(await backup.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3');
});

test('migration groups pre-existing cards into batches without changing them', t => {
  const directory = mkdtempSync(join(tmpdir(), 'pa-issuer-migrate-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'old.sqlite');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE cards (cardId TEXT PRIMARY KEY, codeHash TEXT NOT NULL UNIQUE, productId TEXT NOT NULL, edition TEXT NOT NULL,
    maxDevices INTEGER NOT NULL, issuedAt INTEGER NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL);
    INSERT INTO cards VALUES ('a','h1','wallpaper','standard',2,1,'x','active'),('b','h2','wallpaper','standard',2,1,'x','active'),('c','h3','wallpaper','standard',2,2,'y','disabled');`);
  old.close();
  const db = openDatabase(path);
  t.after(() => db.close());
  assert.deepEqual(db.prepare('SELECT quantity FROM batches ORDER BY createdAt').all().map(x => x.quantity), [2, 1]);
  assert.equal(db.prepare('SELECT count(DISTINCT batchId) AS n FROM cards').get().n, 2);
  assert.equal(db.prepare("SELECT status FROM cards WHERE cardId='c'").get().status, 'disabled');
});
