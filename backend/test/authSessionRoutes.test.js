import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { parseSetCookie } from 'cookie';
import { createApp } from '../src/app.js';
import { readAuthConfig } from '../src/authConfig.js';
import { hashPassword } from '../src/passwords.js';

const config = readAuthConfig({ SESSION_TTL_SECONDS: '60' });
const password = 'A complete demo password';
const safeUser = {
  id: 23,
  name: 'Demo Customer',
  email: 'demo@example.test',
  homeAddress: 'Demo Street 1',
  role: 'CUSTOMER',
};

let passwordHash;
let userFailure;
let sessionFailure;
let createdSession;
let server;
let base;
const activeSessionHashes = new Set();

const prisma = {
  user: {
    async findUnique({ where }) {
      if (userFailure) throw userFailure;
      if (where.email !== undefined) {
        return where.email === safeUser.email ? { id: safeUser.id, passwordHash } : null;
      }
      if (where.id !== undefined) return where.id === safeUser.id ? { ...safeUser } : null;
      return null;
    },
  },
  authSession: {
    async create({ data }) {
      if (sessionFailure) throw sessionFailure;
      createdSession = structuredClone(data);
      activeSessionHashes.add(data.tokenHash);
      return { tokenHash: data.tokenHash };
    },
    async updateMany({ where }) {
      if (sessionFailure) throw sessionFailure;
      const active = activeSessionHashes.delete(where.tokenHash);
      return { count: active ? 1 : 0 };
    },
  },
};

before(async () => {
  passwordHash = await hashPassword(password);
  server = createApp(prisma, { authConfig: config }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

beforeEach(() => {
  userFailure = undefined;
  sessionFailure = undefined;
  createdSession = undefined;
  activeSessionHashes.clear();
});

function post(path, body, { cookie, origin = config.allowedOrigins[0] } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin !== null) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const login = (body = { email: safeUser.email.toUpperCase(), password }, options) =>
  post('/api/auth/login', body, options);

test('login verifies credentials, issues a secure session cookie and returns only the safe profile', async () => {
  const response = await login();
  const responseBody = await response.json();
  const cookie = parseSetCookie(response.headers.get('set-cookie'));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(responseBody, { user: safeUser });
  assert.equal(cookie.name, config.cookieName);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'lax');
  assert.equal(cookie.path, '/');
  assert.ok(cookie.maxAge > 0 && cookie.maxAge <= config.ttlSeconds);
  assert.equal(createdSession.userId, safeUser.id);
  assert.match(createdSession.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(createdSession.tokenHash, cookie.value);
  for (const secret of ['password', 'passwordHash', 'taxId', cookie.value]) {
    assert.equal(JSON.stringify(responseBody).includes(secret), false);
  }
});

test('login uses the same generic response for unknown, wrong and malformed credentials', async () => {
  const attempts = [
    { email: 'unknown@example.test', password },
    { email: safeUser.email, password: 'the wrong password' },
    { email: 'not-an-email', password },
    { email: safeUser.email },
    { email: safeUser.email, password, role: 'SALES_MANAGER' },
  ];
  for (const body of attempts) {
    const response = await login(body);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid email or password.' });
  }
  assert.equal(createdSession, undefined);
});

test('login rejects missing and untrusted origins before checking credentials', async () => {
  assert.equal((await login(undefined, { origin: null })).status, 403);
  assert.equal((await login(undefined, { origin: 'https://attacker.example.test' })).status, 403);
  assert.equal(createdSession, undefined);
});

test('login returns a generic 503 response for user and session storage failures', async () => {
  userFailure = new Error('private user database diagnostic');
  let response = await login();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Login is temporarily unavailable.' });

  userFailure = undefined;
  sessionFailure = new Error('private session database diagnostic');
  response = await login();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Login is temporarily unavailable.' });
});

test('logout revokes the current session, clears its cookie and remains idempotent', async () => {
  const loginResponse = await login();
  const cookieHeader = loginResponse.headers.get('set-cookie');
  const cookie = cookieHeader.split(';')[0];
  assert.equal(activeSessionHashes.size, 1);

  let response = await post('/api/auth/logout', {}, { cookie });
  assert.equal(response.status, 204);
  assert.equal(activeSessionHashes.size, 0);
  let cleared = parseSetCookie(response.headers.get('set-cookie'));
  assert.equal(cleared.name, config.cookieName);
  assert.equal(cleared.value, '');
  assert.equal(cleared.maxAge, 0);

  response = await post('/api/auth/logout', {}, { cookie });
  assert.equal(response.status, 204);
  response = await post('/api/auth/logout', {});
  assert.equal(response.status, 204);
  cleared = parseSetCookie(response.headers.get('set-cookie'));
  assert.equal(cleared.value, '');
});

test('logout rejects malformed cookies and untrusted origins without revoking a session', async () => {
  let response = await post('/api/auth/logout', {}, { cookie: `${config.cookieName}=invalid` });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required.' });
  assert.equal(parseSetCookie(response.headers.get('set-cookie')).value, '');

  const loginResponse = await login();
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  response = await post('/api/auth/logout', {}, {
    cookie,
    origin: 'https://attacker.example.test',
  });
  assert.equal(response.status, 403);
  assert.equal(activeSessionHashes.size, 1);
});

test('logout returns a generic 503 response when session revocation is unavailable', async () => {
  const loginResponse = await login();
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  sessionFailure = new Error('private revocation diagnostic');

  const response = await post('/api/auth/logout', {}, { cookie });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Logout is temporarily unavailable.' });
  assert.equal(response.headers.get('set-cookie'), null);
});
