import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { parseSetCookie } from 'cookie';
import { readAuthConfig } from '../src/authConfig.js';
import { createAuthentication } from '../src/authentication.js';

const token = 'A'.repeat(43);
const config = readAuthConfig({});
const user = { id: 7, name: 'Demo Customer', email: 'demo@example.test', homeAddress: 'Demo Street', role: 'CUSTOMER' };
let outage = false;
let server;
let base;
const service = { resolveSession: async (value) => {
  if (outage) throw new Error('private database diagnostic');
  return value === token ? { ...user, passwordHash: 'must-not-leak', taxId: 'must-not-leak' } : null;
} };
const auth = createAuthentication(service, config);
before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 999, role: 'SALES_MANAGER' }; next(); });
  app.get('/private', auth.requireAuth, (req, res) => res.json(req.user));
  app.post('/private', auth.requireAuth, (req, res) => res.json(req.user));
  app.get('/optional', auth.optionalAuth, (req, res) => res.json({ user: req.user ?? null }));
  app.post('/public-auth', auth.requireTrustedOrigin, (_req, res) => res.sendStatus(204));
  app.get('/set', (_req, res) => {
    auth.setSessionCookie(res, { token, expiresAt: new Date(Date.now() + 60000) });
    res.sendStatus(204);
  });
  app.get('/clear', (_req, res) => { auth.clearSessionCookie(res); res.sendStatus(204); });
  app.get('/secure-cookie', (_req, res) => {
    createAuthentication(service, readAuthConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://store.example.test' }))
      .setSessionCookie(res, { token, expiresAt: new Date(Date.now() + 60000) });
    res.sendStatus(204);
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
function request(path, { cookie, origin, method = 'GET', body } = {}) {
  const headers = {};
  if (cookie !== undefined) headers.Cookie = cookie;
  if (origin !== undefined) headers.Origin = origin;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
}
const sessionCookie = () => config.cookieName + '=' + token;

test('development defaults and production cookie/origin settings are explicit', () => {
  assert.equal(config.cookieName, 'sulina_session');
  assert.equal(config.ttlSeconds, 28800);
  assert.equal(config.secure, false);
  assert.deepEqual(config.allowedOrigins, ['http://localhost:5173']);
  const production = readAuthConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://store.example.test', SESSION_TTL_SECONDS: '120' });
  assert.equal(production.secure, true);
  assert.equal(production.ttlSeconds, 120);
});
test('invalid production config, origins, cookie names and lifetimes fail at setup', () => {
  for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', APP_ORIGIN: 'http://store.example.test' },
    { APP_ORIGIN: '*' }, { APP_ORIGIN: 'https://user:secret@store.example.test' },
    { APP_ORIGIN: 'https://store.example.test/path' }, { APP_ORIGIN: 'null' },
    { SESSION_COOKIE_NAME: 'bad;cookie' }, { SESSION_TTL_SECONDS: '60junk' },
    { SESSION_TTL_SECONDS: '0' }, { SESSION_TTL_SECONDS: '' }, { AUTH_ALLOWED_ORIGINS: '*' },
    { NODE_ENV: 'production', APP_ORIGIN: 'https://*.example.test' },
    { AUTH_ALLOWED_ORIGINS: 'https://*.example.test' }]) {
    assert.throws(() => readAuthConfig(env));
  }
});
test('required authentication rejects absent cookies and spoofed body/query/header identities', async () => {
  const response = await request('/private?userId=7&role=SALES_MANAGER');
  assert.equal(response.status, 401);
  const post = await request('/private', { method: 'POST', origin: config.allowedOrigins[0], body: { userId: 7, role: 'SALES_MANAGER' } });
  assert.equal(post.status, 401);
});
test('verified sessions replace upstream identity and expose only safe user fields', async () => {
  const response = await request('/private', { cookie: sessionCookie() });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), user);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('invalid, malformed, duplicated and encoded authentication cookies fail closed', async () => {
  for (const cookie of [config.cookieName + '=bad', config.cookieName,
    sessionCookie() + '; ' + sessionCookie(), config.cookieName + '=%',
    config.cookieName + '="%41"', config.cookieName + '=' + 'B'.repeat(43)]) {
    assert.equal((await request('/private', { cookie })).status, 401);
  }
});
test('optional authentication permits no cookie but rejects an invalid supplied session', async () => {
  assert.deepEqual(await (await request('/optional')).json(), { user: null });
  assert.equal((await request('/optional', { cookie: config.cookieName + '=invalid' })).status, 401);
  assert.deepEqual(await (await request('/optional', { cookie: sessionCookie() })).json(), { user });
});
test('unsafe authenticated requests require the exact configured Origin', async () => {
  assert.equal((await request('/private', { method: 'POST', cookie: sessionCookie(), origin: config.allowedOrigins[0] })).status, 200);
  for (const origin of [undefined, 'null', 'https://attacker.example.test', 'http://localhost:5173.attacker.test']) {
    assert.equal((await request('/private', { method: 'POST', cookie: sessionCookie(), origin })).status, 403);
  }
});
test('public authentication POSTs can require an Origin without requiring a prior session', async () => {
  assert.equal((await request('/public-auth', { method: 'POST', origin: config.allowedOrigins[0] })).status, 204);
  assert.equal((await request('/public-auth', { method: 'POST' })).status, 403);
});
test('storage outages return generic 503 rather than authenticating or returning 401', async () => {
  outage = true;
  try {
    const response = await request('/private', { cookie: sessionCookie() });
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes('private database diagnostic'), false);
    assert.equal((await request('/optional', { cookie: sessionCookie() })).status, 503);
  } finally { outage = false; }
});
test('session cookie is HttpOnly, Lax, host-only, scoped and expires with the session', async () => {
  const response = await request('/set');
  const cookie = parseSetCookie(response.headers.get('set-cookie'));
  assert.equal(cookie.name, config.cookieName);
  assert.equal(cookie.value, token);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'lax');
  assert.equal(cookie.path, '/');
  assert.equal(cookie.domain, undefined);
  assert.equal(cookie.secure, undefined);
  assert.ok(cookie.maxAge > 0 && cookie.maxAge <= 60);
  assert.ok(cookie.expires instanceof Date);
});
test('production session cookies require HTTPS and logout clears the same cookie scope', async () => {
  const production = parseSetCookie((await request('/secure-cookie')).headers.get('set-cookie'));
  assert.equal(production.secure, true);
  const cleared = parseSetCookie((await request('/clear')).headers.get('set-cookie'));
  assert.equal(cleared.name, config.cookieName);
  assert.equal(cleared.value, '');
  assert.equal(cleared.maxAge, 0);
  assert.equal(cleared.expires.getTime(), 0);
  assert.equal(cleared.path, '/');
  assert.equal(cleared.httpOnly, true);
});
