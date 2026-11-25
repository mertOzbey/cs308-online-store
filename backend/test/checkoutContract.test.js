import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { getSyntheticTestCard } from '../src/mockBankAdapter.js';

const fixture = JSON.parse(await readFile(
  new URL('../../docs/contracts/checkout/v1/examples.json', import.meta.url), 'utf8',
));
const { approved, unauthenticated, declined, stockConflict } = fixture.cases;

function minorUnits(price) {
  assert.match(price, /^\d+\.\d{2}$/);
  return BigInt(price.replace('.', ''));
}

test('shared checkout cases use distinct attempts on the same two-product cart', () => {
  const attempts = Object.values(fixture.cases);
  assert.equal(new Set(attempts.map(({ request }) => request.idempotencyKey)).size, 4);
  assert.equal(approved.request.items.length, 2);
  for (const { request } of attempts) {
    assert.deepEqual(Object.keys(request).sort(), ['idempotencyKey', 'items', 'paymentToken']);
    assert.deepEqual(request.items, approved.request.items);
  }
  assert.equal(approved.response.status, 201);
  assert.equal(approved.response.body.payment.status, 'approved');
  assert.equal(declined.response.status, 402);
  assert.equal(declined.response.body.code, 'PAYMENT_DECLINED');
  assert.equal(stockConflict.response.status, 409);
  assert.equal(stockConflict.response.body.code, 'STOCK_CONFLICT');
});

test('the live mock adapter accepts the payment tokens from the v1 contract', () => {
  assert.match(getSyntheticTestCard(approved.request.paymentToken).cardNumber, /^\d{16}$/);
  assert.match(getSyntheticTestCard(declined.request.paymentToken).cardNumber, /^\d{16}$/);
});

test('the purchase snapshot reconciles in kuruş and identifies the delivery', () => {
  const { order } = approved.response.body;
  assert.deepEqual(order.items.map(({ productId, quantity }) => ({ productId, quantity })), approved.request.items);
  let total = 0n;
  for (const item of order.items) {
    assert.equal(minorUnits(item.lineTotal), minorUnits(item.unitPrice) * BigInt(item.quantity));
    total += minorUnits(item.lineTotal);
  }
  assert.equal(total, minorUnits(order.total));
  assert.equal(order.currency, 'TRY');
  assert.equal(order.status, 'processing');
  assert.equal(fixture.delivery.response.orderId, order.orderId);
  assert.equal(fixture.delivery.response.status, fixture.delivery.request.status);
});

test('shared examples match the mounted session and cart routes', async (t) => {
  const catalog = [{ id: 101, stockQuantity: 1 }, { id: 202, stockQuantity: 3 }];
  const server = createApp({ product: { findMany: async () => catalog } }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const session = await fetch(base + '/api/auth/me');
  assert.equal(session.status, unauthenticated.response.status);
  assert.deepEqual(await session.json(), unauthenticated.response.body);
  const cart = await fetch(base + '/api/cart/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: stockConflict.request.items }),
  });
  assert.equal(cart.status, 200);
  const result = await cart.json();
  assert.equal(result.valid, false);
  assert.deepEqual(result.items.filter(item => item.reason), stockConflict.response.body.items);
});
