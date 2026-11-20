import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { useTestDatabase } from './helpers/testDatabase.js';
import { createUserRepository, normalizeEmail, validateRegistrationInput, UserInputError, EmailInUseError } from '../src/users.js';

const { db } = useTestDatabase();
const users = createUserRepository(db);
const input = (overrides = {}) => ({
  name: ' Demo Customer ', taxId: '001-demo-tax', email: ' Demo@Example.test ',
  homeAddress: ' Demo Street 1 ', password: '  twelve characters  ', ...overrides,
});
const profile = (overrides = {}) => validateRegistrationInput(input(overrides)).profile;
beforeEach(() => db.user.deleteMany());

test('registration normalizes profile fields without trimming or persisting the password', () => {
  const result = validateRegistrationInput(input());
  assert.deepEqual(result.profile, {
    name: 'Demo Customer', taxId: '001-demo-tax', email: 'demo@example.test', homeAddress: 'Demo Street 1',
  });
  assert.equal(result.password, '  twelve characters  ');
  assert.equal(normalizeEmail('Upper@EXAMPLE.test'), 'upper@example.test');
});
test('rejects missing, wrong-type, blank, malformed and oversized registration fields', () => {
  for (const body of [null, [], 'user', {}, input({ name: 12 }), input({ taxId: '\t' }),
    input({ email: 'a@@example.test' }), input({ email: 'a b@example.test' }),
    input({ homeAddress: 'x'.repeat(1001) }), input({ name: '\u0000invalid' }),
    input({ password: 'too short' }), input({ password: 'x'.repeat(1025) })]) {
    assert.throws(() => validateRegistrationInput(body), UserInputError);
  }
});
test('rejects privileged or unexpected registration keys rather than mass assigning them', () => {
  for (const extras of [{ role: 'PRODUCT_MANAGER' }, { id: 10 }, { passwordHash: 'injected' }, { extra: true }]) {
    assert.throws(() => validateRegistrationInput(input(extras)), UserInputError);
  }
});
test('password limits use Unicode characters for minimum and UTF-8 bytes for maximum', () => {
  assert.doesNotThrow(() => validateRegistrationInput(input({ password: '😀'.repeat(12) })));
  assert.throws(() => validateRegistrationInput(input({ password: '😀'.repeat(11) })), UserInputError);
  assert.throws(() => validateRegistrationInput(input({ password: '😀'.repeat(257) })), UserInputError);
});
test('customer persistence always defaults to customer and returns an explicit safe projection', async () => {
  const created = await users.createCustomer(profile(), 'trusted-test-encoded-hash');
  assert.deepEqual(Object.keys(created).sort(), ['email', 'homeAddress', 'id', 'name', 'role']);
  assert.equal(created.role, 'CUSTOMER');
  const stored = await db.user.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stored.passwordHash, 'trusted-test-encoded-hash');
  assert.equal(stored.taxId, '001-demo-tax');
  assert.deepEqual(await users.findSafeById(created.id), created);
  assert.equal(await users.findSafeById(created.id + 1), null);
});
test('repository rejects privileged profile keys and invalid separately supplied hashes', async () => {
  await assert.rejects(users.createCustomer({ ...profile(), role: 'SALES_MANAGER' }, 'trusted-test-hash'), UserInputError);
  for (const hash of [undefined, '', '  ', 42, 'x'.repeat(513)]) {
    await assert.rejects(users.createCustomer(profile(), hash), UserInputError);
  }
  assert.equal(await db.user.count(), 0);
});
test('credential lookup is canonical and returns only internal authentication fields', async () => {
  const created = await users.createCustomer(profile(), 'trusted-test-hash');
  assert.deepEqual(await users.findCredentialsByEmail(' DEMO@example.test '), { id: created.id, passwordHash: 'trusted-test-hash' });
  assert.equal(await users.findCredentialsByEmail('missing@example.test'), null);
});
test('concurrent registrations with the same canonical email have one winner and a controlled conflict', async () => {
  const results = await Promise.allSettled([
    users.createCustomer(profile({ email: ' SAME@example.test ' }), 'trusted-test-hash'),
    users.createCustomer(profile({ email: 'same@EXAMPLE.test' }), 'trusted-test-hash'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const conflict = results.find((r) => r.status === 'rejected').reason;
  assert.ok(conflict instanceof EmailInUseError);
  assert.equal(conflict.status, 409);
  assert.equal(await db.user.count(), 1);
});
test('database infrastructure failures are not mislabeled as duplicate email conflicts', async () => {
  const failure = new Error('database unavailable');
  const broken = createUserRepository({ user: { create: async () => { throw failure; } } });
  await assert.rejects(broken.createCustomer(profile(), 'trusted-test-hash'), (error) => error === failure);
});
