import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { readAuthConfig } from '../src/authConfig.js';
import { useTestDatabase } from './helpers/testDatabase.js';

const { db } = useTestDatabase();
const config = readAuthConfig({ SESSION_TTL_SECONDS: '300' });
let sessionToken;
let buyer;
let product;
let server;
let base;

async function createCustomer(name = 'Checkout Customer') {
  return db.user.create({ data: {
    name,
    email: `${randomUUID()}@example.test`,
    taxId: randomUUID(),
    passwordHash: 'test-only-hash',
    homeAddress: 'Çiçek Sokak 7, İstanbul',
  } });
}

async function createProduct(stockQuantity, price = '12.34') {
  return db.product.create({ data: {
    name: 'Güneş Kremi',
    model: 'SPF 50',
    serialNumber: randomUUID(),
    description: 'Test catalog product',
    stockQuantity,
    price,
    warrantyStatus: '24 months',
    distributorInformation: 'Sulina test distributor',
    category: { create: { name: randomUUID() } },
  } });
}

function requestBody(idempotencyKey, paymentToken = 'mock_approve', quantity = 2) {
  return {
    idempotencyKey,
    items: [{ productId: product.id, quantity, price: '0.01', customerId: 999999 }],
    paymentToken,
  };
}

function checkout(body, { authenticated = true, origin = config.allowedOrigins[0] } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (authenticated) headers.Cookie = `${config.cookieName}=${sessionToken}`;
  return fetch(`${base}/api/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function counts(target = product) {
  return db.product.findUniqueOrThrow({
    where: { id: target.id },
    select: { stockQuantity: true, salesCount: true },
  });
}

beforeEach(async () => {
  sessionToken = randomBytes(32).toString('base64url');
  buyer = await createCustomer();
  product = await createProduct(5);
  await db.authSession.create({ data: {
    tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
    userId: buyer.id,
    expiresAt: new Date(Date.now() + 300000),
  } });
  server = createApp(db, { authConfig: config }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

test('checkout authenticates before trusting body identity or creating an attempt', async () => {
  const key = randomUUID();
  const guest = await checkout({ ...requestBody(key), customerId: 999999 }, { authenticated: false });
  assert.equal(guest.status, 401);
  assert.deepEqual(await guest.json(), { error: 'Authentication required.' });

  const untrusted = await checkout(requestBody(key), { origin: 'https://attacker.example.test' });
  assert.equal(untrusted.status, 403);
  assert.deepEqual(await counts(), { stockQuantity: 5, salesCount: 0 });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 0);
});

test('decline then approval uses server prices, commits once and replays exactly', async () => {
  const decline = await checkout(requestBody(randomUUID(), 'mock_decline'));
  assert.equal(decline.status, 402);
  assert.deepEqual(await decline.json(), {
    code: 'PAYMENT_DECLINED',
    error: 'The mock bank declined the payment.',
  });
  assert.deepEqual(await counts(), { stockQuantity: 5, salesCount: 0 });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 0);

  const key = randomUUID();
  const firstResponse = await checkout(requestBody(key));
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();
  assert.equal(first.payment.status, 'approved');
  assert.match(first.payment.reference, /^mock-pay-[0-9a-f]{16}$/);
  assert.equal(first.order.customerId, buyer.id);
  assert.equal(first.order.total, '24.68');
  assert.equal(first.order.items[0].unitPrice, '12.34');
  assert.equal(first.order.items[0].quantity, 2);
  assert.deepEqual(await counts(), { stockQuantity: 3, salesCount: 2 });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 1);

  const replayResponse = await checkout(requestBody(key));
  assert.equal(replayResponse.status, 201);
  assert.deepEqual(await replayResponse.json(), first);
  assert.deepEqual(await counts(), { stockQuantity: 3, salesCount: 2 });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 1);

  const changed = await checkout(requestBody(key, 'mock_approve', 1));
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).code, 'IDEMPOTENCY_KEY_REUSED');
  assert.deepEqual(await counts(), { stockQuantity: 3, salesCount: 2 });
});

test('client totals and customer IDs are rejected instead of reaching payment', async () => {
  for (const extra of [{ amount: '0.01' }, { customerId: 999999 }]) {
    const response = await checkout({ ...requestBody(randomUUID()), ...extra });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_CHECKOUT');
  }
  assert.deepEqual(await counts(), { stockQuantity: 5, salesCount: 0 });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 0);
});

test('a stock conflict is terminal and never becomes an order or successful payment', async () => {
  const conflictBuyer = await createCustomer('Conflict Customer');
  const conflictToken = randomBytes(32).toString('base64url');
  await db.authSession.create({ data: {
    tokenHash: createHash('sha256').update(conflictToken).digest('hex'),
    userId: conflictBuyer.id,
    expiresAt: new Date(Date.now() + 300000),
  } });
  const scarce = await createProduct(1);
  const key = randomUUID();
  const body = {
    idempotencyKey: key,
    items: [{ productId: scarce.id, quantity: 2 }],
    paymentToken: 'mock_approve',
  };
  const headers = {
    'Content-Type': 'application/json',
    Origin: config.allowedOrigins[0],
    Cookie: `${config.cookieName}=${conflictToken}`,
  };
  const send = () => fetch(`${base}/api/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const firstResponse = await send();
  assert.equal(firstResponse.status, 409);
  const first = await firstResponse.json();
  assert.equal(first.code, 'STOCK_CONFLICT');
  assert.deepEqual(first.items, [{
    productId: scarce.id,
    requestedQuantity: 2,
    availableQuantity: 1,
    reason: 'INSUFFICIENT_STOCK',
  }]);
  assert.deepEqual(await counts(scarce), { stockQuantity: 1, salesCount: 0 });
  assert.equal(await db.order.count({ where: { customerId: conflictBuyer.id } }), 0);

  await db.product.update({ where: { id: scarce.id }, data: { stockQuantity: 5 } });
  const replayResponse = await send();
  assert.equal(replayResponse.status, 409);
  assert.deepEqual(await replayResponse.json(), first);
  assert.deepEqual(await counts(scarce), { stockQuantity: 5, salesCount: 0 });
  assert.equal(await db.order.count({ where: { customerId: conflictBuyer.id } }), 0);
});
