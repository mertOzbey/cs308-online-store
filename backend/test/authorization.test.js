import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import express from 'express';
import { useTestDatabase } from './helpers/testDatabase.js';
import { createSessionService } from '../src/sessions.js';
import { createAuthentication } from '../src/authentication.js';
import { readAuthConfig } from '../src/authConfig.js';
import { requireRoles, requireOwner } from '../src/authorization.js';

const { db } = useTestDatabase();
const sessions = createSessionService(db);
const config = readAuthConfig({});
const auth = createAuthentication(sessions, config);
let server;
let base;
let resourceOwner;
let ownerFailure = false;
before(async () => {
  const app = express();
  for (const [path, role] of [['customer', 'CUSTOMER'], ['sales', 'SALES_MANAGER'],
    ['products', 'PRODUCT_MANAGER'], ['support', 'SUPPORT_AGENT']]) {
    app.get('/' + path, auth.requireAuth, requireRoles(role), (_req, res) => res.sendStatus(204));
  }
  app.get('/owned', auth.requireAuth, requireOwner(async () => {
    if (ownerFailure) throw new Error('private resource database detail');
    return resourceOwner; // Trusted stored resource owner, not a request parameter.
  }), (_req, res) => res.sendStatus(204));
  app.get('/missing-auth', requireRoles('CUSTOMER'), (_req, res) => res.sendStatus(204));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
beforeEach(async () => { await db.user.deleteMany(); resourceOwner = undefined; });
async function login(role, suffix = role.toLowerCase()) {
  const user = await db.user.create({ data: {
    name: 'Demo Account', taxId: '001-demo', email: suffix + '@example.test',
    homeAddress: 'Demo Street', passwordHash: 'trusted-test-hash', role,
  } });
  const { token } = await sessions.issueSession(user.id);
  return { user, cookie: config.cookieName + '=' + token };
}
const request = (path, cookie) => fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });

test('each basic role can enter only its explicitly allowed management boundary', async () => {
  const paths = { CUSTOMER: 'customer', SALES_MANAGER: 'sales', PRODUCT_MANAGER: 'products', SUPPORT_AGENT: 'support' };
  for (const [role, allowed] of Object.entries(paths)) {
    const { cookie } = await login(role);
    for (const path of Object.values(paths)) assert.equal((await request('/' + path, cookie)).status, path === allowed ? 204 : 403);
  }
});
test('policy boundaries return 401 for unauthenticated users, including incorrectly mounted roles', async () => {
  assert.equal((await request('/sales')).status, 401);
  assert.equal((await request('/missing-auth')).status, 401);
});
test('customer-supplied role claims cannot grant managerial access', async () => {
  const { cookie } = await login('CUSTOMER');
  const response = await fetch(base + '/sales?role=SALES_MANAGER&userId=1', {
    headers: { Cookie: cookie, 'X-User-Role': 'SALES_MANAGER' },
  });
  assert.equal(response.status, 403);
});
test('role changes take effect on an already existing session', async () => {
  const { user, cookie } = await login('SALES_MANAGER');
  assert.equal((await request('/sales', cookie)).status, 204);
  await db.user.update({ where: { id: user.id }, data: { role: 'CUSTOMER' } });
  assert.equal((await request('/sales', cookie)).status, 403);
  assert.equal((await request('/customer', cookie)).status, 204);
});
test('ownership compares the authenticated ID with the trusted stored owner', async () => {
  const first = await login('CUSTOMER', 'first');
  const second = await login('CUSTOMER', 'second');
  resourceOwner = first.user.id;
  assert.equal((await request('/owned', first.cookie)).status, 204);
  assert.equal((await request('/owned?ownerId=' + second.user.id, second.cookie)).status, 403);
});
test('support and manager roles do not override private-resource ownership', async () => {
  const owner = await login('CUSTOMER', 'owner');
  resourceOwner = owner.user.id;
  for (const role of ['SALES_MANAGER', 'PRODUCT_MANAGER', 'SUPPORT_AGENT']) {
    assert.equal((await request('/owned', (await login(role)).cookie)).status, 403);
  }
});
test('missing, malformed or string owner IDs never grant access through coercion', async () => {
  const { user, cookie } = await login('CUSTOMER');
  for (const owner of [undefined, null, String(user.id), 0, -1, NaN]) {
    resourceOwner = owner;
    assert.equal((await request('/owned', cookie)).status, 403);
  }
});
test('resource lookup outages deny access with a generic 503', async () => {
  const { cookie } = await login('CUSTOMER');
  ownerFailure = true;
  try {
    const response = await request('/owned', cookie);
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes('private resource database detail'), false);
  } finally { ownerFailure = false; }
});
test('empty or invented roles and invalid ownership callbacks fail at setup', () => {
  for (const args of [[], ['ADMIN'], [null], [['CUSTOMER']]]) assert.throws(() => requireRoles(...args));
  for (const callback of [null, 3, 'ownerId']) assert.throws(() => requireOwner(callback));
});
