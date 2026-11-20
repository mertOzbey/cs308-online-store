import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { useTestDatabase } from './helpers/testDatabase.js';
import { readAuthConfig } from '../src/authConfig.js';
import { createAuthentication } from '../src/authentication.js';
import { createSessionService } from '../src/sessions.js';
import { createUserRepository, validateRegistrationInput } from '../src/users.js';
import { hashPassword, verifyPassword } from '../src/passwords.js';
import { requireRoles } from '../src/authorization.js';
import { createHash } from 'node:crypto';

const { db } = useTestDatabase();
const config = readAuthConfig({ SESSION_TTL_SECONDS: '60' });
const sessions = createSessionService(db, { ttlSeconds: config.ttlSeconds });
const auth = createAuthentication(sessions, config);
const users = createUserRepository(db);
let outage = false;
const appDb = db.$extends({ query: { authSession: { findFirst: ({ args, query }) => {
  if (outage) throw new Error('private authentication storage error');
  return query(args);
} } } });
let server;
let releaseServer;
let base;
let releaseBase;
async function listen(app) {
  const instance = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { instance.once('listening', resolve); instance.once('error', reject); });
  return instance;
}
before(async () => {
  const app = createApp(appDb, { authConfig: config });
  // Contract harness only: Damla owns the real registration/login/logout routes.
  app.post('/__test__/register', auth.requireTrustedOrigin, async (req, res) => {
    try {
      const { profile, password } = validateRegistrationInput(req.body);
      res.status(201).json({ user: await users.createCustomer(profile, await hashPassword(password)) });
    } catch (error) {
      res.status(error.status ?? 503).json({ error: error.status === 400 ? 'Invalid registration.' : 'Registration could not be completed.' });
    }
  });
  app.post('/__test__/login', auth.requireTrustedOrigin, async (req, res) => {
    const credentials = await users.findCredentialsByEmail(req.body.email);
    if (!credentials || !await verifyPassword(credentials.passwordHash, req.body.password)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    auth.setSessionCookie(res, await sessions.issueSession(credentials.id));
    return res.json({ user: await users.findSafeById(credentials.id) });
  });
  app.post('/__test__/logout', auth.requireTrustedOrigin, async (req, res) => {
    const token = auth.readSessionToken(req);
    if (token) await sessions.revokeSession(token);
    auth.clearSessionCookie(res);
    res.sendStatus(204);
  });
  app.get('/__test__/sales', auth.requireAuth, requireRoles('SALES_MANAGER'), (_req, res) => res.sendStatus(204));
  server = await listen(app);
  releaseServer = await listen(createApp(db, { authConfig: config }));
  base = 'http://127.0.0.1:' + server.address().port;
  releaseBase = 'http://127.0.0.1:' + releaseServer.address().port;
});
after(async () => {
  await Promise.all([server, releaseServer].map((instance) => new Promise((resolve, reject) =>
    instance.close((error) => error ? reject(error) : resolve()))));
});
beforeEach(async () => {
  await db.user.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
});
const registration = (overrides = {}) => ({
  name: 'Demo Customer', taxId: '001-demo-tax', email: 'demo@example.test',
  homeAddress: 'Demo Street 1', password: 'A complete demo password', ...overrides,
});
function post(path, body, cookie, origin = config.allowedOrigins[0]) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin !== null) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  return fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
}
async function login(overrides = {}) {
  const body = registration(overrides);
  assert.equal((await post('/__test__/register', body)).status, 201);
  const response = await post('/__test__/login', { email: body.email, password: body.password });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], user: (await response.json()).user };
}
const get = (path, cookie) => fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });

test('the actual account endpoint is protected even when no session exists', async () => {
  assert.equal((await get('/api/auth/me')).status, 401);
  assert.equal((await get('/api/auth/me', config.cookieName + '=invalid')).status, 401);
});
test('real registration helpers, password verification, session cookie and account endpoint compose', async () => {
  const { user, cookie } = await login();
  const response = await get('/api/auth/me', cookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { user });
  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.match(stored.passwordHash, /^\$argon2id\$/);
  assert.equal(stored.passwordHash.includes(registration().password), false);
  assert.equal((await post('/__test__/login', { email: user.email, password: 'the wrong password' })).status, 401);
});
test('logout revokes the old token in storage and repeated logout remains safe', async () => {
  const { cookie } = await login();
  assert.equal((await post('/__test__/logout', {}, cookie)).status, 204);
  assert.equal((await get('/api/auth/me', cookie)).status, 401);
  assert.equal((await post('/__test__/logout', {}, cookie)).status, 204);
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const stored = await db.authSession.findUniqueOrThrow({ where: {
    tokenHash: createHash('sha256').update(token).digest('hex'),
  } });
  assert.ok(stored.revokedAt);
});
test('account responses always identify the session owner and never expose sensitive fields', async () => {
  const first = await login();
  const second = await login({ email: 'second@example.test' });
  const response = await get('/api/auth/me?userId=' + second.user.id, first.cookie);
  const body = await response.json();
  assert.equal(body.user.id, first.user.id);
  for (const value of ['taxId', 'passwordHash', 'tokenHash', registration().password]) {
    assert.equal(JSON.stringify(body).includes(value), false);
  }
});
test('the actual account endpoint rejects expired and deleted-user sessions', async () => {
  const { cookie, user } = await login();
  await db.authSession.updateMany({ where: { userId: user.id }, data: {
    createdAt: new Date(Date.now() - 120000), expiresAt: new Date(Date.now() - 60000),
  } });
  assert.equal((await get('/api/auth/me', cookie)).status, 401);
  const fresh = await sessions.issueSession(user.id);
  await db.user.delete({ where: { id: user.id } });
  assert.equal((await get('/api/auth/me', config.cookieName + '=' + fresh.token)).status, 401);
});
test('the same authenticated identity enforces current role permissions at a route boundary', async () => {
  const { user, cookie } = await login();
  assert.equal((await get('/__test__/sales', cookie)).status, 403);
  await db.user.update({ where: { id: user.id }, data: { role: 'SALES_MANAGER' } });
  assert.equal((await get('/__test__/sales', cookie)).status, 204);
});
test('database failures at the real account endpoint fail closed with a generic service error', async () => {
  const { cookie } = await login();
  outage = true;
  try {
    const response = await get('/api/auth/me', cookie);
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes('private authentication storage error'), false);
  } finally { outage = false; }
});
test('anonymous catalog and stock validation still work even with an expired authentication cookie', async () => {
  const category = await db.category.create({ data: { name: 'Demo category' } });
  const product = await db.product.create({ data: {
    name: 'Demo product', model: 'P1', serialNumber: 'DEMO-1', description: 'Demo item',
    stockQuantity: 2, price: '12.34', warrantyStatus: 'One year',
    distributorInformation: 'Demo distributor', categoryId: category.id,
  } });
  const response = await get('/api/products', config.cookieName + '=invalid');
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].id, product.id);
  const validation = await post('/api/cart/validate', { items: [{ productId: product.id, quantity: 1 }] }, null, null);
  assert.equal(validation.status, 200);
  assert.equal((await validation.json()).valid, true);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity, 2);
});
test('contract harness rejects privileged registration, duplicate emails and cross-origin auth mutations', async () => {
  assert.equal((await post('/__test__/register', registration({ role: 'PRODUCT_MANAGER' }))).status, 400);
  await login();
  assert.equal((await post('/__test__/register', registration())).status, 409);
  assert.equal((await post('/__test__/login', registration(), null, 'https://attacker.example.test')).status, 403);
  assert.equal((await post('/__test__/login', registration(), null, null)).status, 403);
});
test('test registration/login/logout harness endpoints are not shipped by createApp', async () => {
  for (const path of ['/__test__/register', '/__test__/login', '/__test__/logout']) {
    assert.equal((await fetch(releaseBase + path, { method: 'POST' })).status, 404);
  }
});
