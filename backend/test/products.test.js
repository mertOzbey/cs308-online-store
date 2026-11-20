import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

// A fake Prisma client: records the last findMany arguments instead of hitting PostgreSQL.
let server;
let baseUrl;
let calls;
let fail;
const catalog = [
  { id: 1, name: 'Lipstick', category: { id: 1, name: 'Makeup' } },
  { id: 2, name: 'Face Mask', category: { id: 2, name: 'Skincare' } },
];

before(async () => {
  const fakePrisma = {
    product: { findMany: async (args) => {
      calls.push(args);
      if (fail) throw new Error('database unavailable');
      return catalog;
    } },
  };
  server = createApp(fakePrisma).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
beforeEach(() => { calls = []; fail = false; });

const get = (path) => fetch(`${baseUrl}${path}`);

test('GET /api/products?q= passes a case-insensitive keyword filter to the database', async () => {
  const response = await get('/api/products?q=%20lip%20');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), catalog);
  assert.deepEqual(calls[0].where.OR[0], { name: { contains: 'lip', mode: 'insensitive' } });
  assert.equal(calls[0].where.OR.length, 3);
});

test('GET /api/products?category= filters by category id', async () => {
  await get('/api/products?category=2');
  assert.deepEqual(calls[0].where, { categoryId: 2 });
});

test('keyword and category can be combined', async () => {
  await get('/api/products?q=mask&category=2');
  assert.equal(calls[0].where.categoryId, 2);
  assert.equal(calls[0].where.OR[2].description.contains, 'mask');
});

test('search keeps including the category in each product', async () => {
  await get('/api/products?q=mask');
  assert.deepEqual(calls[0].include, { category: true });
});

test('invalid search parameters get 400 and never reach the database', async () => {
  for (const path of ['/api/products?category=abc', '/api/products?category=0',
    `/api/products?q=${'x'.repeat(101)}`, '/api/products?q=a&q=b']) {
    const response = await get(path);
    assert.equal(response.status, 400, path);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(calls.length, 0);
});

test('a database failure during search returns 500 without details', async () => {
  fail = true;
  const response = await get('/api/products?q=lip');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Products could not be retrieved.' });
});
