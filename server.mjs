import http from 'node:http';
import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve, join, extname, sep } from 'node:path';
import { productsFromEnv, createCard, createCards, deleteCards, getCard, listCards, exportCards, cardSummary, updateCard, setCardsStatus,
  revealCode, releaseDevice, lookup, listBatches, getBatch, setBatchStatus, allowActivation, activateCard, UUID } from './cards.mjs';
import { listActivationLog, listAuditLog, audit } from './logs.mjs';
import { getSettings, saveSettings, getPublicBranding } from './settings.mjs';
import { configFromEnv, openDatabase, verifyPassword, hashPassword, allowLogin, digest, token, publicKeyFor, HttpError, requireAdministrator, createAdministratorSession, updateAdministrator, validateUsername, ensureDefaultAdministrator } from './lib.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const distDir = fileURLToPath(new URL('./dist/', import.meta.url));
// Serve a fixed snapshot of the built console (npm run build) taken at startup; request paths are only looked up, never joined onto the file system.
function loadAssets() {
  let files = [];
  try { files = readdirSync(distDir, { recursive: true }); } catch { return new Map(); }
  const assets = new Map(files.filter(file => MIME[extname(file)] && statSync(join(distDir, file)).isFile())
    .map(file => ['/' + file.split(sep).join('/'), { body: readFileSync(join(distDir, file)), type: MIME[extname(file)] }]));
  if (assets.has('/index.html')) assets.set('/', assets.get('/index.html'));
  return assets;
}
const assets = loadAssets();
const MISSING_BUILD = Buffer.from('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>License Issuer</title><p>管理后台尚未构建：请在服务器上运行 <code>npm run build</code> 后重启服务。</p>');

async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, '请使用 application/json', 'unsupported_media_type');
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16384) throw new HttpError(413, '请求内容过大', 'request_too_large');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, '请求不是有效的 JSON 对象', 'invalid_json'); }
}
const reply = (status, value) => ({ reply: true, status, value });
const file = (bodyValue, type, name) => ({ reply: true, status: 200, raw: bodyValue, headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"` } });
const timestamp = now => new Date(now).toISOString().slice(0, 16).replace(/[-:T]/g, '');

export function createApp(config, { clock = Date.now } = {}) {
  const db = openDatabase(config.database);
  try { requireAdministrator(db); } catch (error) { db.close(); throw error; }
  const cookieName = config.secure ? '__Host-pa_session' : 'pa_session';
  let pendingLogins = 0;
  const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config.secure ? '; Secure' : ''}`;
  const sessionCookie = req => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);

  // Each route: [method, path or RegExp, handler(context, ...captures)]. Handlers return JSON (200) or reply()/file().
  const id = '([a-f0-9-]{36})';
  const routes = [
    ['GET', '/api/dashboard', c => {
      const tz = Number(c.url.searchParams.get('tz') || 0);
      return cardSummary(db, config, c.now, Number.isInteger(tz) && Math.abs(tz) <= 840 ? tz : 0);
    }],
    ['POST', '/api/lookup', async c => lookup(db, await c.body(), config)],
    ['GET', '/api/cards', c => listCards(db, c.url.searchParams, config)],
    ['POST', '/api/cards', async c => reply(201, createCard(db, await c.body(), config, c.now))],
    ['POST', '/api/cards/batch', async c => reply(201, createCards(db, await c.body(), config, c.now))],
    ['PATCH', '/api/cards/batch', async c => setCardsStatus(db, await c.body(), c.now)],
    ['DELETE', '/api/cards/batch', async c => deleteCards(db, await c.body(), c.now)],
    ['GET', '/api/cards/export', c => file(exportCards(db, c.url.searchParams, config, c.now), 'text/csv; charset=utf-8', `cards-${timestamp(c.now)}.csv`)],
    ['GET', new RegExp(`^/api/cards/${id}$`), (c, cardId) => getCard(db, cardId)],
    ['PATCH', new RegExp(`^/api/cards/${id}$`), async (c, cardId) => updateCard(db, cardId, await c.body(), c.now)],
    ['POST', new RegExp(`^/api/cards/${id}/reveal$`), (c, cardId) => revealCode(db, cardId, config, c.now)],
    ['POST', new RegExp(`^/api/cards/${id}/devices/${id}/release$`), async (c, cardId, activationId) => releaseDevice(db, cardId, activationId, await c.body(), c.now)],
    ['GET', '/api/batches', c => listBatches(db, c.url.searchParams, config)],
    ['GET', new RegExp(`^/api/batches/${id}$`), (c, batchId) => getBatch(db, batchId)],
    ['PATCH', new RegExp(`^/api/batches/${id}$`), async (c, batchId) => setBatchStatus(db, batchId, await c.body(), c.now)],
    ['GET', '/api/activation-log', c => listActivationLog(db, c.url.searchParams, config)],
    ['GET', '/api/audit-log', c => listAuditLog(db, c.url.searchParams)],
    ['GET', '/api/settings', () => getSettings(db, config)],
    ['PUT', '/api/settings', async c => saveSettings(db, await c.body(), config, c.now)],
    ['GET', '/api/backup', c => {
      const path = join(tmpdir(), `license-issuer-backup-${token()}.sqlite`);
      try {
        db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
        audit(db, c.now, 'backup.download');
        return file(readFileSync(path), 'application/vnd.sqlite3', `issuer-backup-${timestamp(c.now)}.sqlite`);
      } finally { try { unlinkSync(path); } catch {} }
    }],
  ];

  async function changeAccount(req, url, admin, session) {
    if (!allowLogin(db, req.socket.remoteAddress || 'unknown', config, clock()) || pendingLogins >= 4) throw new HttpError(429, '尝试次数过多，请稍后再试', 'rate_limited');
    pendingLogins++;
    try {
      const input = await body(req);
      if (url.pathname === '/api/account/password' && (Object.keys(input).some(key => !['currentPassword', 'newPassword'].includes(key)) || typeof input.newPassword !== 'string')) throw new HttpError(400, '需要当前密码和新密码', 'invalid_account');
      if (Object.keys(input).some(key => !['currentPassword', 'username', 'newPassword'].includes(key)) || typeof input.currentPassword !== 'string' || input.currentPassword.length > 256 ||
          (input.username === undefined && input.newPassword === undefined) ||
          (input.username !== undefined && typeof input.username !== 'string') ||
          (input.newPassword !== undefined && typeof input.newPassword !== 'string')) throw new HttpError(400, '账号设置格式无效', 'invalid_account');
      if (input.newPassword !== undefined && (input.newPassword.length < 1 || input.newPassword.length > 256)) throw new HttpError(400, '密码不能为空，且最多 256 个字符', 'invalid_password');
      if (input.newPassword !== undefined && input.newPassword === input.currentPassword) throw new HttpError(400, '新密码不能与当前密码相同', 'same_password');
      if (admin.mustChangePassword && input.newPassword === undefined) throw new HttpError(400, '请先设置新密码替换初始密码', 'password_change_required');
      if (input.username !== undefined) {
        try { validateUsername(input.username); } catch { throw new HttpError(400, '用户名为 1–80 位字母、数字或 _ . @ -', 'invalid_username'); }
      }
      if (!(await verifyPassword(input.currentPassword, admin.passwordHash))) throw new HttpError(403, '当前密码不正确', 'wrong_password');
      const passwordHash = input.newPassword === undefined ? undefined : await hashPassword(input.newPassword);
      updateAdministrator(db, { username: input.username, passwordHash, mustChangePassword: false, expectedRevision: admin.revision, sessionId: session.id, now: clock() });
      audit(db, clock(), 'account.update', input.username ?? admin.username);
    } finally { pendingLogins--; }
  }

  const server = http.createServer({ maxHeaderSize: 16384, requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
    if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const now = clock();
      const url = new URL(req.url, config.origin);
      const mutating = !['GET', 'HEAD'].includes(req.method);
      // Do not trust forwarded headers. Proxy must preserve Host; PUBLIC_ORIGIN is authoritative.
      if (req.headers.host !== new URL(config.origin).host) throw new HttpError(403, 'Host not allowed', 'forbidden_host');
      const clientActivation = url.pathname === '/api/v1/activate' && req.method === 'POST';
      if (mutating && ((!clientActivation && req.headers.origin !== config.origin) || (clientActivation && req.headers.origin !== undefined && req.headers.origin !== config.origin) || req.headers['sec-fetch-site'] === 'cross-site')) throw new HttpError(403, 'Origin not allowed', 'forbidden_origin');
      if (clientActivation) {
        if (!allowActivation(db, req.socket.remoteAddress || 'unknown', now)) {
          res.setHeader('Retry-After', '60');
          throw new HttpError(429, 'Too many activation attempts; try again later', 'rate_limited');
        }
        json(200, activateCard(db, await body(req), config, clock())); return;
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const asset = assets.get(url.pathname);
        // Vite file names carry a content hash, so they can be cached forever; everything else stays no-store.
        if (url.pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.writeHead(200, { 'Content-Type': asset.type }); res.end(asset.body); return;
      }
      if (req.method === 'GET' && url.pathname === '/' && !assets.size) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(MISSING_BUILD); return;
      }
      if (url.pathname === '/api/branding' && req.method === 'GET') { json(200, getPublicBranding(db, config)); return; }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        if (!allowLogin(db, req.socket.remoteAddress || 'unknown', config, now)) {
          res.setHeader('Retry-After', String(Math.ceil(config.loginWindowMs / 1000)));
          throw new HttpError(429, '登录尝试次数过多，请稍后再试', 'rate_limited');
        }
        if (pendingLogins >= 4) throw new HttpError(429, '登录繁忙，请稍后再试', 'rate_limited');
        pendingLogins++;
        try {
          const input = await body(req);
          if (typeof input.username !== 'string' || input.username.length > 80 || typeof input.password !== 'string' || input.password.length > 256) throw new HttpError(400, '用户名或密码格式无效', 'invalid_credentials');
          const admin = requireAdministrator(db);
          const valid = await verifyPassword(input.password, admin.passwordHash);
          if (!valid || input.username !== admin.username) throw new HttpError(401, '用户名或密码不正确', 'invalid_credentials');
          const sessionId = token(); const csrf = token();
          db.prepare('DELETE FROM sessions WHERE expires <= ?').run(clock());
          const oldId = sessionCookie(req);
          if (oldId) db.prepare('DELETE FROM sessions WHERE id=?').run(digest(oldId));
          if (!createAdministratorSession(db, admin, digest(sessionId), csrf, clock() + config.sessionMs)) throw new HttpError(401, '用户名或密码不正确', 'invalid_credentials');
          res.setHeader('Set-Cookie', cookie(sessionId, Math.floor(config.sessionMs / 1000)));
          json(200, { csrf }); return;
        } finally { pendingLogins--; }
      }
      const sessionId = sessionCookie(req);
      const session = sessionId && /^[A-Za-z0-9_-]{43}$/.test(sessionId) ? db.prepare(`SELECT sessions.*, administrators.username FROM sessions
        JOIN administrators ON administrators.id=sessions.adminId WHERE sessions.id=? AND expires>?`).get(digest(sessionId), now) : null;
      if (!session) throw new HttpError(401, '请先登录', 'unauthenticated');
      if (mutating && req.headers['x-csrf-token'] !== session.csrf) throw new HttpError(403, '安全校验失败，请刷新页面', 'csrf');
      const admin = requireAdministrator(db);
      if (url.pathname === '/api/session' && req.method === 'GET') {
        json(200, { username: session.username, mustChangePassword: Boolean(admin.mustChangePassword), csrf: session.csrf, expiresAt: session.expires,
          editions: config.editions, products: config.products || productsFromEnv({}), publicKey: publicKeyFor(config.privateKey), origin: config.origin,
          settings: getSettings(db, config) }); return;
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE id=?').run(session.id);
        res.setHeader('Set-Cookie', cookie('', 0)); json(200, { ok: true }); return;
      }
      if (['/api/account', '/api/account/password'].includes(url.pathname) && req.method === 'PATCH') {
        await changeAccount(req, url, admin, session);
        res.setHeader('Set-Cookie', cookie('', 0)); json(200, { ok: true, reauthenticate: true }); return;
      }
      if (admin.mustChangePassword) throw new HttpError(403, '请先修改初始密码', 'password_change_required');
      for (const [method, path, handler] of routes) {
        const match = typeof path === 'string' ? (url.pathname === path ? [] : null) : path.exec(url.pathname)?.slice(1);
        if (!match || method !== req.method || !match.every(x => UUID.test(x))) continue;
        const result = await handler({ req, url, now, body: () => body(req) }, ...match);
        if (result?.reply && result.raw) { res.writeHead(result.status, result.headers); res.end(result.raw); }
        else if (result?.reply) json(result.status, result.value);
        else json(200, result);
        return;
      }
      throw new HttpError(404, '接口不存在', 'not_found');
    } catch (error) {
      // Never log request bodies, credentials, license codes, PEM data or raw crypto exceptions.
      if (!res.destroyed) json(error instanceof HttpError ? error.status : 500, error instanceof HttpError
        ? { error: error.message, ...(error.code ? { code: error.code } : {}) } : { error: '服务内部错误', code: 'internal' });
    }
  });
  server.timeout = 20000;
  server.keepAliveTimeout = 5000;
  server.on('close', () => db.close());
  return { server, db };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = configFromEnv(process.env);
    config.products = productsFromEnv(process.env);
    const bootstrapDb = openDatabase(config.database);
    try { await ensureDefaultAdministrator(bootstrapDb); } finally { bootstrapDb.close(); }
    const { server } = createApp(config);
    server.on('error', () => { console.error('Server failed to listen'); process.exitCode = 1; server.close(); });
    server.listen(config.port, config.host, () => console.log(`License issuer listening on ${config.host}:${config.port}; public origin ${config.origin}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
