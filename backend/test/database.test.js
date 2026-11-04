import 'dotenv/config';
import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient, prisma } from '../src/db.js';

// No skipped tests or fallback to the development database.
assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated *_test database.');
const baseUrl = new URL(process.env.TEST_DATABASE_URL);
assert.match(baseUrl.pathname, /_test$/, 'Tests require a database whose name ends in _test.');
const schema = `cs308_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(baseUrl);
testUrl.searchParams.set('schema', schema);
const admin = createDatabaseClient(baseUrl.href);
const db = createDatabaseClient(testUrl.href);
const cwd = fileURLToPath(new URL('..', import.meta.url));
let schemaCreated = false;

function migrate() {
  return execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd, env: { ...process.env, DATABASE_URL: testUrl.href }, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

before(async () => {
  // This identifier is generated above and contains only letters, digits and underscores.
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  migrate();
});

beforeEach(async () => {
  await db.product.deleteMany();
  await db.category.deleteMany();
});

after(async () => {
  await db.$disconnect();
  try {
    if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await admin.$disconnect();
    await prisma.$disconnect();
  }
});

async function productData(overrides = {}) {
  const category = await db.category.create({ data: { name: 'Electronics' } });
  return {
    name: 'Demo Headphones', model: 'H1', serialNumber: 'CS308-H1',
    description: 'Example catalog product', stockQuantity: 5, price: '19.99',
    warrantyStatus: '2-year manufacturer warranty', distributorInformation: 'Demo Distributor',
    categoryId: category.id, ...overrides,
  };
}

test('connects to real PostgreSQL', async () => {
  const rows = await db.$queryRaw`SELECT 1 AS value`;
  assert.equal(rows[0].value, 1);
});

test('stores and reads every required product property', async () => {
  const data = await productData();
  const saved = await db.product.create({ data });
  const found = await db.product.findUniqueOrThrow({ where: { id: saved.id } });
  for (const [key, value] of Object.entries(data)) {
    assert.equal(key === 'price' ? found.price.toFixed(2) : found[key], value);
  }
  assert.ok(found.id > 0);
});

test('one category can contain multiple products', async () => {
  const data = await productData();
  await db.product.create({ data });
  await db.product.create({ data: { ...data, serialNumber: 'CS308-H2' } });
  const category = await db.category.findUniqueOrThrow({
    where: { id: data.categoryId }, include: { products: true },
  });
  assert.equal(category.products.length, 2);
});

test('rejects a product referencing a nonexistent category', async () => {
  const data = await productData();
  await db.category.delete({ where: { id: data.categoryId } });
  await assert.rejects(db.product.create({ data }), { code: 'P2003' });
});

test('cannot delete a category that still contains products', async () => {
  const saved = await db.product.create({ data: await productData() });
  await assert.rejects(db.category.delete({ where: { id: saved.categoryId } }), { code: 'P2003' });
  assert.equal(await db.product.count(), 1);
});

test('deleting a product preserves its category', async () => {
  const saved = await db.product.create({ data: await productData() });
  await db.product.delete({ where: { id: saved.id } });
  assert.equal(await db.category.count(), 1);
});

test('rejects duplicate product serial numbers', async () => {
  const data = await productData();
  await db.product.create({ data });
  await assert.rejects(db.product.create({ data }), { code: 'P2002' });
});

test('rejects duplicate category names', async () => {
  await db.category.create({ data: { name: 'Electronics' } });
  await assert.rejects(db.category.create({ data: { name: 'Electronics' } }), { code: 'P2002' });
});

test('defaults stock to zero and retains out-of-stock products', async () => {
  const data = await productData();
  delete data.stockQuantity;
  await db.product.create({ data });
  const products = await db.product.findMany();
  assert.equal(products.length, 1);
  assert.equal(products[0].stockQuantity, 0);
});

test('preserves exact decimal money values', async () => {
  const saved = await db.product.create({ data: await productData({ price: '9999999999.99' }) });
  const found = await db.product.findUniqueOrThrow({ where: { id: saved.id } });
  assert.equal(found.price.toFixed(2), '9999999999.99');
});

for (const [field, value, constraint] of [
  ['stockQuantity', -1, 'Product_stockQuantity_nonnegative'],
  ['price', '-0.01', 'Product_price_nonnegative'],
  ['name', '   ', 'Product_required_text_not_blank'],
]) {
  test(`database rejects invalid ${field}`, async () => {
    const data = await productData({ [field]: value });
    await assert.rejects(db.product.create({ data }), error => error.message.includes(constraint));
  });
}

test('database rejects blank category names', async () => {
  await assert.rejects(db.category.create({ data: { name: '   ' } }),
    error => error.message.includes('Category_name_not_blank'));
});

test('allows a free product with zero stock', async () => {
  const saved = await db.product.create({ data: await productData({ price: '0.00', stockQuantity: 0 }) });
  assert.equal(saved.price.toFixed(2), '0.00');
  assert.equal(saved.stockQuantity, 0);
});

test('reapplying migrations does not remove existing records', async () => {
  const saved = await db.product.create({ data: await productData() });
  migrate();
  assert.equal(await db.product.count({ where: { id: saved.id } }), 1);
});
