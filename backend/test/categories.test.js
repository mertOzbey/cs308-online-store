import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let lastArgs;
let fail;
const categories = [{ id: 2, name: 'Makeup' }, { id: 1, name: 'Skincare' }];

before(async () => {
  const fakePrisma = {
    category: { findMany: async (args) => {
      lastArgs = args;
      if (fail) throw new Error('database unavailable');
      return categories;
    } },
  };
  server = createApp(fakePrisma).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
beforeEach(() => { lastArgs = null; fail = false; });

test('GET /api/categories returns id and name sorted by name', async () => {
  const response = await fetch(`${baseUrl}/api/categories`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), categories);
  assert.deepEqual(lastArgs, { select: { id: true, name: true }, orderBy: { name: 'asc' } });
});

test('GET /api/categories hides database errors behind a 500', async () => {
  fail = true;
  const response = await fetch(`${baseUrl}/api/categories`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Categories could not be retrieved.' });
});
