import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createHash } from 'node:crypto';
import { createSessionService } from '../src/sessions.js';
import { createDatabaseClient } from '../src/db.js';
import { useTestDatabase } from './helpers/testDatabase.js';

const { db, url } = useTestDatabase();
let clock;
let sessions;
beforeEach(async () => {
  await db.user.deleteMany();
  clock = new Date();
  sessions = createSessionService(db, { ttlSeconds: 60, now: () => new Date(clock) });
});
function customer(email = 'demo@example.test') {
  return db.user.create({ data: {
    name: 'Demo Customer', taxId: '001-demo', homeAddress: 'Demo Street',
    email, passwordHash: 'trusted-test-hash',
  } });
}
const digest = (token) => createHash('sha256').update(token).digest('hex');

test('issues distinct random tokens, stores only their hashes and keeps expiration', async () => {
  const user = await customer();
  const first = await sessions.issueSession(user.id);
  const second = await sessions.issueSession(user.id);
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(first.expiresAt.getTime(), clock.getTime() + 60000);
  const stored = await db.authSession.findUniqueOrThrow({ where: { tokenHash: digest(first.token) } });
  assert.equal(stored.userId, user.id);
  assert.equal('token' in stored, false);
  assert.equal(JSON.stringify(stored).includes(first.token), false);
});
test('resolves only safe current user data and notices a role change immediately', async () => {
  const user = await customer();
  const { token } = await sessions.issueSession(user.id);
  const profile = await sessions.resolveSession(token);
  assert.deepEqual(Object.keys(profile).sort(), ['email', 'homeAddress', 'id', 'name', 'role']);
  await db.user.update({ where: { id: user.id }, data: { role: 'SUPPORT_AGENT' } });
  assert.equal((await sessions.resolveSession(token)).role, 'SUPPORT_AGENT');
});
test('sessions survive recreating the database client and service', async () => {
  const { token } = await sessions.issueSession((await customer()).id);
  const second = createDatabaseClient(url);
  try {
    assert.equal((await createSessionService(second).resolveSession(token)).email, 'demo@example.test');
  } finally { await second.$disconnect(); }
});
test('expiration rejects the session exactly at its expiry boundary', async () => {
  const { token } = await sessions.issueSession((await customer()).id);
  clock = new Date(clock.getTime() + 59999);
  assert.ok(await sessions.resolveSession(token));
  clock = new Date(clock.getTime() + 1);
  assert.equal(await sessions.resolveSession(token), null);
});
test('malformed tokens fail before querying storage and unknown valid tokens do not authenticate', async () => {
  const noStorage = createSessionService({});
  for (const token of [undefined, '', 12, 'bad', 'A'.repeat(42), 'A'.repeat(42) + '!']) {
    assert.equal(await noStorage.resolveSession(token), null);
    assert.equal(await noStorage.revokeSession(token), false);
  }
  assert.equal(await sessions.resolveSession('A'.repeat(43)), null);
});
test('logout revocation is idempotent and does not revoke another device', async () => {
  const user = await customer();
  const first = await sessions.issueSession(user.id);
  const second = await sessions.issueSession(user.id);
  assert.equal(await sessions.revokeSession(first.token), true);
  assert.equal(await sessions.revokeSession(first.token), false);
  assert.equal(await sessions.resolveSession(first.token), null);
  assert.ok(await sessions.resolveSession(second.token));
});
test('session rotation replaces the old token and rejects its reuse', async () => {
  const user = await customer();
  const old = await sessions.issueSession(user.id);
  const replacement = await sessions.rotateSession(old.token, user.id);
  assert.notEqual(replacement.token, old.token);
  assert.equal(await sessions.resolveSession(old.token), null);
  assert.ok(await sessions.resolveSession(replacement.token));
  assert.equal(await sessions.rotateSession(old.token, user.id), null);
});
test('two concurrent rotations of one session create only one replacement', async () => {
  const user = await customer();
  const old = await sessions.issueSession(user.id);
  const results = await Promise.all([
    sessions.rotateSession(old.token, user.id), sessions.rotateSession(old.token, user.id),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await db.authSession.count({ where: { userId: user.id, revokedAt: null } }), 1);
});
test('rotation cannot attach another user and cannot revive an expired session', async () => {
  const first = await customer();
  const other = await customer('other@example.test');
  const old = await sessions.issueSession(first.id);
  assert.equal(await sessions.rotateSession(old.token, other.id), null);
  assert.equal((await sessions.resolveSession(old.token)).id, first.id);
  clock = new Date(clock.getTime() + 60000);
  assert.equal(await sessions.rotateSession(old.token, first.id), null);
});
test('a failed replacement insertion rolls back revocation in the same transaction', async () => {
  const user = await customer();
  const old = await sessions.issueSession(user.id);
  const failure = new Error('simulated insertion failure');
  const failingDb = db.$extends({ query: { authSession: { create: () => { throw failure; } } } });
  const failing = createSessionService(failingDb);
  await assert.rejects(failing.rotateSession(old.token, user.id), (error) => error === failure);
  assert.ok(await sessions.resolveSession(old.token));
  assert.equal(await db.authSession.count(), 1);
});
test('deleting the user cascades sessions so the deleted account cannot authenticate', async () => {
  const user = await customer();
  const { token } = await sessions.issueSession(user.id);
  await db.user.delete({ where: { id: user.id } });
  assert.equal(await db.authSession.count(), 0);
  assert.equal(await sessions.resolveSession(token), null);
});
test('session storage enforces valid hashes, foreign keys and positive lifetimes', async () => {
  const user = await customer();
  const valid = { tokenHash: 'a'.repeat(64), userId: user.id, createdAt: clock, expiresAt: new Date(clock.getTime() + 60000) };
  for (const change of [{ tokenHash: 'not-a-hash' }, { userId: 2147483647 }, { expiresAt: clock }]) {
    await assert.rejects(db.authSession.create({ data: { ...valid, ...change } }));
  }
});
test('invalid lifetime, user IDs and clock configuration fail explicitly', async () => {
  for (const ttlSeconds of [0, -1, 1.5, 59, 2592001, NaN]) {
    assert.throws(() => createSessionService(db, { ttlSeconds }));
  }
  assert.throws(() => createSessionService(db, { now: null }));
  for (const id of [0, -1, '1', 2147483648]) await assert.rejects(sessions.issueSession(id));
  await assert.rejects(createSessionService(db, { now: () => new Date(NaN) }).issueSession(1));
});
