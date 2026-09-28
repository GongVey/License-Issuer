import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.mjs';
import { runAdmin } from '../admin.mjs';
import { DatabaseSync } from 'node:sqlite';
import { CLIENT_PUBLIC_KEY, publicKeyFor, assertMatchingKey, hashPassword, verifyPassword, configFromEnv, issueLicense, openDatabase, allowLogin, initializeAdministrator, importAdministrator, updateAdministrator, requireAdministrator, createAdministratorSession } from '../lib.mjs';

const { privateKey } = generateKeyPairSync('ed25519');
const machine = 'sha256:' + 'a'.repeat(64);
const password = randomBytes(32).toString('base64url');
const passwordHash = await hashPassword(password);

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
  assert.throws(() => issueLicense(privateKey, { machineFingerprint: machine.toUpperCase(), edition: 'standard' }, ['standard']), /Machine/);
  assert.throws(() => issueLicense(privateKey, { machineFingerprint: machine, edition: '' }, ['standard']), /Edition/);
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
  await assert.rejects(runAdmin('init', env, { ...prompts, askPassword: async () => 'short' }), /16 to 256/);
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

test('random temporary initialization stores only a hash and refuses existing accounts', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pa-issuer-initial-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { DATABASE_PATH: join(directory, 'test.sqlite') };
  let delivered = '';
  await runAdmin('init-default', env, { output: text => { if (text.startsWith('Initial administrator')) delivered = text; } });
  const initialPassword = delivered.split(': ').at(-1);
  assert.match(initialPassword, /^[A-Za-z0-9_-]{32}$/);
  const db = openDatabase(env.DATABASE_PATH);
  try {
    const admin = requireAdministrator(db);
    assert.equal(admin.username, 'admin');
    assert.equal(admin.mustChangePassword, 1);
    assert.ok(await verifyPassword(initialPassword, admin.passwordHash));
    assert.ok(!JSON.stringify(admin).includes(initialPassword));
  } finally { db.close(); }
  await assert.rejects(runAdmin('init-default', env, { output: () => assert.fail('Must not deliver another password') }), /already initialized/);
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

test('temporary administrator can only update account until password is changed', async t => {
  const f = await fixture(t);
  const db = openDatabase(f.config.database);
  updateAdministrator(db, { passwordHash: await hashPassword(password), mustChangePassword: true });
  db.close();
  await f.login();
  assert.equal((await f.request('/api/licenses')).status, 403);
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
  const js = (await f.request('/app.js')).body;
  assert.ok(!js.includes('innerHTML')); assert.ok(!js.includes('privateKey'));
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
