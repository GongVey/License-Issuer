import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { configFromEnv, openDatabase, issueLicense, verifyPassword, hashPassword, allowLogin, digest, token, publicKeyFor, HttpError, requireAdministrator, createAdministratorSession, updateAdministrator, validateUsername } from './lib.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
].map(([url, [file, type]]) => [url, { body: readFileSync(new URL(`./public/${file}`, import.meta.url)), type }]));

async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'Use application/json');
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16384) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, 'Invalid JSON object'); }
}
export function createApp(config, { clock = Date.now } = {}) {
  const db = openDatabase(config.database);
  try { requireAdministrator(db); } catch (error) { db.close(); throw error; }
  const cookieName = config.secure ? '__Host-pa_session' : 'pa_session';
  let pendingLogins = 0;
  const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config.secure ? '; Secure' : ''}`;
  const server = http.createServer({ maxHeaderSize: 16384, requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
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
      if (req.headers.host !== new URL(config.origin).host) throw new HttpError(403, 'Host not allowed');
      if (mutating && (req.headers.origin !== config.origin || req.headers['sec-fetch-site'] === 'cross-site')) throw new HttpError(403, 'Origin not allowed');
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const asset = assets.get(url.pathname);
        res.writeHead(200, { 'Content-Type': asset.type }); res.end(asset.body); return;
      }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        if (!allowLogin(db, req.socket.remoteAddress || 'unknown', config, now)) {
          res.setHeader('Retry-After', String(Math.ceil(config.loginWindowMs / 1000)));
          throw new HttpError(429, 'Too many login attempts; try again later');
        }
        if (pendingLogins >= 4) throw new HttpError(429, 'Login busy; try again later');
        pendingLogins++;
        try {
          const input = await body(req);
          if (typeof input.username !== 'string' || input.username.length > 80 || typeof input.password !== 'string' || input.password.length > 256) throw new HttpError(400, 'Invalid credentials format');
          const admin = requireAdministrator(db);
          const valid = await verifyPassword(input.password, admin.passwordHash);
          if (!valid || input.username !== admin.username) throw new HttpError(401, 'Invalid credentials');
          const id = token(); const csrf = token();
          db.prepare('DELETE FROM sessions WHERE expires <= ?').run(clock());
          const oldId = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
          if (oldId) db.prepare('DELETE FROM sessions WHERE id=?').run(digest(oldId));
          if (!createAdministratorSession(db, admin, digest(id), csrf, clock() + config.sessionMs)) throw new HttpError(401, 'Invalid credentials');
          res.setHeader('Set-Cookie', cookie(id, Math.floor(config.sessionMs / 1000)));
          json(200, { csrf }); return;
        } finally { pendingLogins--; }
      }
      const id = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const session = id && /^[A-Za-z0-9_-]{43}$/.test(id) ? db.prepare(`SELECT sessions.*, administrators.username FROM sessions
        JOIN administrators ON administrators.id=sessions.adminId WHERE sessions.id=? AND expires>?`).get(digest(id), now) : null;
      if (!session) throw new HttpError(401, 'Please sign in');
      if (mutating && req.headers['x-csrf-token'] !== session.csrf) throw new HttpError(403, 'CSRF token required');
      const admin = requireAdministrator(db);
      if (url.pathname === '/api/session' && req.method === 'GET') {
        json(200, { username: session.username, mustChangePassword: Boolean(admin.mustChangePassword), csrf: session.csrf, expiresAt: session.expires, editions: config.editions, publicKey: publicKeyFor(config.privateKey) }); return;
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE id=?').run(session.id);
        res.setHeader('Set-Cookie', cookie('', 0)); json(200, { ok: true }); return;
      }
      if (url.pathname === '/api/account' && req.method === 'PATCH') {
        if (!allowLogin(db, req.socket.remoteAddress || 'unknown', config, now) || pendingLogins >= 4) throw new HttpError(429, 'Too many credential attempts; try again later');
        pendingLogins++;
        try {
        const input = await body(req);
        if (Object.keys(input).some(key => !['currentPassword', 'username', 'newPassword'].includes(key)) || typeof input.currentPassword !== 'string' || input.currentPassword.length > 256 ||
            (input.username === undefined && input.newPassword === undefined) ||
            (input.username !== undefined && typeof input.username !== 'string') ||
            (input.newPassword !== undefined && typeof input.newPassword !== 'string')) throw new HttpError(400, 'Invalid account settings');
        if (input.newPassword !== undefined && (input.newPassword.length < 16 || input.newPassword.length > 256 || input.newPassword === input.currentPassword)) throw new HttpError(400, 'Use a different password of 16 to 256 characters');
        if (admin.mustChangePassword && input.newPassword === undefined) throw new HttpError(400, 'Replace your temporary password');
        if (input.username !== undefined) {
          try { validateUsername(input.username); } catch (error) { throw new HttpError(400, error.message); }
        }
        if (!(await verifyPassword(input.currentPassword, admin.passwordHash))) throw new HttpError(403, 'Current password is incorrect');
        const passwordHash = input.newPassword === undefined ? undefined : await hashPassword(input.newPassword);
        updateAdministrator(db, { username: input.username, passwordHash, mustChangePassword: false, expectedRevision: admin.revision, sessionId: session.id, now: clock() });
        res.setHeader('Set-Cookie', cookie('', 0)); json(200, { ok: true, reauthenticate: true }); return;
        } finally { pendingLogins--; }
      }
      if (admin.mustChangePassword) {
        throw new HttpError(403, 'Change your temporary password before accessing licenses');
      }
      if (url.pathname === '/api/licenses' && req.method === 'POST') {
        const record = issueLicense(config.privateKey, await body(req), config.editions, clock());
        db.prepare('INSERT INTO licenses VALUES (?,?,?,?,?,?,?)').run(record.licenseId, record.machineFingerprint, record.edition, record.issuedAt, record.note, record.code, record.status);
        json(201, record); return;
      }
      if (url.pathname === '/api/licenses' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const offset = Number(url.searchParams.get('offset') || 0);
        if (q.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000000) throw new HttpError(400, 'Invalid search');
        // instr performs literal search: SQL metacharacters and LIKE wildcards have no special meaning.
        const where = 'WHERE instr(lower(licenseId || char(10) || machineFingerprint || char(10) || note || char(10) || edition), lower(?)) > 0';
        const total = db.prepare(`SELECT count(*) AS count FROM licenses ${where}`).get(q).count;
        const items = db.prepare(`SELECT licenseId,machineFingerprint,edition,issuedAt,note,status FROM licenses ${where} ORDER BY issuedAt DESC, licenseId LIMIT 30 OFFSET ?`).all(q, offset);
        json(200, { items, total, offset }); return;
      }
      const match = /^\/api\/licenses\/([a-f0-9-]{36})$/.exec(url.pathname);
      if (match) {
        const record = db.prepare('SELECT * FROM licenses WHERE licenseId=?').get(match[1]);
        if (!record) throw new HttpError(404, 'License not found');
        if (req.method === 'GET') { json(200, record); return; }
        if (req.method === 'PATCH') {
          const input = await body(req);
          if (Object.keys(input).length !== 1 || !['active', 'archived'].includes(input.status)) throw new HttpError(400, 'Invalid local status');
          db.prepare('UPDATE licenses SET status=? WHERE licenseId=?').run(input.status, record.licenseId);
          json(200, { ...record, status: input.status }); return;
        }
      }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      // Never log request bodies, credentials, license codes, PEM data or raw crypto exceptions.
      if (!res.destroyed) json(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Internal server error' });
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
    const { server } = createApp(config);
    server.on('error', () => { console.error('Server failed to listen'); process.exitCode = 1; server.close(); });
    server.listen(config.port, config.host, () => console.log(`License issuer listening on ${config.host}:${config.port}; public origin ${config.origin}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
