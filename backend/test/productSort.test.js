import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { ProductQueryError, SORT_OPTIONS, parseProductQuery, parseSortOrder } from '../src/productQuery.js';

test('the supported sort options are price ascending, price descending and popularity', () => {
  assert.deepEqual(SORT_OPTIONS, ['price_asc', 'price_desc', 'popularity']);
});

test('no sort keeps the catalog ordered by id', () => {
  assert.deepEqual(parseSortOrder({}), { id: 'asc' });
  assert.deepEqual(parseSortOrder({ sort: '  ' }), { id: 'asc' });
});

test('price sorts break ties by id so equal prices keep a stable order', () => {
  assert.deepEqual(parseSortOrder({ sort: 'price_asc' }), [{ price: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(parseSortOrder({ sort: 'price_desc' }), [{ price: 'desc' }, { id: 'asc' }]);
});

test('popularity puts the best sellers first', () => {
  assert.deepEqual(parseSortOrder({ sort: 'popularity' }), [{ salesCount: 'desc' }, { id: 'asc' }]);
});

test('unknown, differently cased and inherited sort names are rejected', () => {
  for (const sort of ['name', 'PRICE_ASC', 'price', 'toString', '__proto__', 'constructor']) {
    assert.throws(() => parseSortOrder({ sort }), ProductQueryError, sort);
  }
  assert.throws(() => parseSortOrder({ sort: ['price_asc', 'popularity'] }), /at most once/);
});

test('sort combines with search and category filters', () => {
  assert.deepEqual(parseProductQuery({ q: 'serum', category: '4', sort: 'price_desc' }).orderBy,
    [{ price: 'desc' }, { id: 'asc' }]);
  assert.equal(parseProductQuery({ q: 'serum', category: '4', sort: 'price_desc' }).where.categoryId, 4);
});

let server;
let baseUrl;
let lastArgs;
before(async () => {
  const fakePrisma = { product: { findMany: async (args) => { lastArgs = args; return []; } } };
  server = createApp(fakePrisma).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
beforeEach(() => { lastArgs = null; });

test('GET /api/products?sort=popularity sends the popularity order to the database', async () => {
  const response = await fetch(`${baseUrl}/api/products?sort=popularity`);
  assert.equal(response.status, 200);
  assert.deepEqual(lastArgs.orderBy, [{ salesCount: 'desc' }, { id: 'asc' }]);
});

test('GET /api/products with an unknown sort answers 400 and lists the valid options', async () => {
  const response = await fetch(`${baseUrl}/api/products?sort=cheapest`);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /price_asc, price_desc, popularity/);
  assert.equal(lastArgs, null);
});
