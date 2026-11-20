import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { useTestDatabase } from './helpers/testDatabase.js';

const { db, migrate } = useTestDatabase({ legacyCatalog: true });
const data = (overrides = {}) => ({
  name: 'Demo Customer', taxId: '001-demo-tax', email: 'demo@example.test',
  homeAddress: 'Demo Street 1', passwordHash: 'test-only-encoded-password-hash', ...overrides,
});
beforeEach(async () => { await db.user.deleteMany(); });

test('user migration preserves the catalog created before it was applied', async () => {
  const product = await db.product.findUniqueOrThrow({ where: { serialNumber: 'LEGACY-1' }, include: { category: true } });
  assert.equal(product.price.toFixed(2), '12.34');
  assert.equal(product.stockQuantity, 3);
  assert.equal(product.category.name, 'Existing catalog');
});
test('stores required customer fields, zero-prefixed tax ID and default customer role', async () => {
  const user = await db.user.create({ data: data() });
  assert.ok(user.id > 0);
  assert.equal(user.taxId, '001-demo-tax');
  assert.equal(user.role, 'CUSTOMER');
  assert.ok(user.createdAt instanceof Date);
  assert.ok(user.updatedAt instanceof Date);
  assert.equal('password' in user, false);
});
test('allows all four specified roles and rejects an invented role', async () => {
  for (const role of ['CUSTOMER', 'SALES_MANAGER', 'PRODUCT_MANAGER', 'SUPPORT_AGENT']) {
    assert.equal((await db.user.create({ data: data({ role, email: role.toLowerCase() + '@example.test' }) })).role, role);
  }
  await assert.rejects(db.user.create({ data: data({ role: 'ADMIN' }) }));
});
test('database enforces canonical and unique emails even without application validation', async () => {
  await db.user.create({ data: data() });
  await assert.rejects(db.user.create({ data: data() }), { code: 'P2002' });
  for (const email of ['DEMO@example.test', ' demo@example.test ', 'bad email@example.test']) {
    await assert.rejects(db.user.create({ data: data({ email }) }));
  }
});
for (const field of ['name', 'taxId', 'email', 'homeAddress', 'passwordHash']) {
  test(`database rejects blank required ${field}`, async () => {
    await assert.rejects(db.user.create({ data: data({ [field]: '   ' }) }));
  });
}
test('database rejects oversized customer fields', async () => {
  for (const [field, length] of [['name', 201], ['taxId', 101], ['email', 255], ['homeAddress', 1001], ['passwordHash', 513]]) {
    await assert.rejects(db.user.create({ data: data({ [field]: 'x'.repeat(length) }) }));
  }
});
test('tax ID is required text but is not a unique person identifier', async () => {
  await db.user.create({ data: data() });
  await db.user.create({ data: data({ email: 'second@example.test' }) });
  assert.equal(await db.user.count(), 2);
});
test('reapplying migrations preserves existing users and catalog records', async () => {
  const user = await db.user.create({ data: data() });
  migrate();
  assert.equal(await db.user.count({ where: { id: user.id } }), 1);
  assert.equal(await db.product.count({ where: { serialNumber: 'LEGACY-1' } }), 1);
});
