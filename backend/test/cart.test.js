import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { parseCartItems, validateCartStock } from '../src/cartValidation.js';

test('combines duplicate lines before comparing stock', () => {
  const items = parseCartItems({ items: [{ productId: 1, quantity: 3 }, { productId: 1, quantity: 3 }] });
  assert.deepEqual(items, [{ productId: 1, quantity: 6 }]);
  assert.equal(validateCartStock(items, [{ id: 1, stockQuantity: 5 }]).items[0].reason, 'INSUFFICIENT_STOCK');
});

test('accepts exact available stock and an empty cart', () => {
  assert.equal(validateCartStock([{ productId: 1, quantity: 5 }], [{ id: 1, stockQuantity: 5 }]).valid, true);
  assert.deepEqual(validateCartStock([], []), { valid: true, items: [] });
});

test('rejects invalid payloads, fractional quantities and unsafe totals', () => {
  for (const body of [null, {}, { items: {} }, { items: Array(101).fill({ productId: 1, quantity: 1 }) },
    ...[0, -1, 1.5, '2', null].map((quantity) => ({ items: [{ productId: 1, quantity }] })),
    ...[0, -1, '1', 2147483648].map((productId) => ({ items: [{ productId, quantity: 1 }] })),
    { items: [{ productId: 1, quantity: Number.MAX_SAFE_INTEGER }, { productId: 1, quantity: 1 }] }]) {
    assert.throws(() => parseCartItems(body));
  }
});

let server;
let baseUrl;
let catalog = [];
let fail = false;
let lastQuery;
before(async () => {
  const app = createApp({ product: { findMany: async (query) => {
    lastQuery = query;
    if (fail) throw new Error('database unavailable');
    return catalog;
  } } });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

function post(body) {
  return fetch(`${baseUrl}/api/cart/validate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('HTTP stock check reads current stock and ignores client-supplied stock values', async () => {
  catalog = [{ id: 1, stockQuantity: 2 }, { id: 2, stockQuantity: 0 }];
  const body = { items: [{ productId: 1, quantity: 2, stockQuantity: 999 }, { productId: 2, quantity: 1 }, { productId: 3, quantity: 1 }] };
  const response = await post(body);
  assert.equal(response.status, 200);
  assert.deepEqual(lastQuery, { where: { id: { in: [1, 2, 3] } }, select: { id: true, stockQuantity: true } });
  assert.deepEqual(await response.json(), { valid: false, items: [
    { productId: 1, requestedQuantity: 2, availableQuantity: 2, reason: null },
    { productId: 2, requestedQuantity: 1, availableQuantity: 0, reason: 'OUT_OF_STOCK' },
    { productId: 3, requestedQuantity: 1, availableQuantity: 0, reason: 'PRODUCT_NOT_FOUND' },
  ] });
  catalog = [{ id: 1, stockQuantity: 1 }];
  const updated = await post({ items: [{ productId: 1, quantity: 2 }] });
  assert.equal((await updated.json()).items[0].reason, 'INSUFFICIENT_STOCK');
});

test('HTTP rejects malformed requests without querying the catalog', async () => {
  lastQuery = null;
  assert.equal((await post({ items: [{ productId: 1, quantity: 0 }] })).status, 400);
  assert.equal(lastQuery, null);
  const response = await fetch(`${baseUrl}/api/cart/validate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 400);
});

test('HTTP database failures do not report stock as available', async () => {
  fail = true;
  try {
    const response = await post({ items: [{ productId: 1, quantity: 1 }] });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /Stock could not be checked/);
  } finally { fail = false; }
});

test('existing product API keeps its catalog contract', async () => {
  catalog = [{ id: 1, name: 'Product', category: { id: 1, name: 'Category' } }];
  const response = await fetch(`${baseUrl}/api/products`);
  assert.deepEqual(await response.json(), catalog);
  assert.deepEqual(lastQuery, { include: { category: true }, orderBy: { id: 'asc' } });
});
