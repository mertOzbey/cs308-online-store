import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/passwords.js';
import { UserInputError } from '../src/users.js';

test('Argon2id hashes use separate salts and verify the original password', async () => {
  const password = 'A complete demo password';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^\$argon2id\$v=19\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, password), true);
  assert.equal(await verifyPassword(first, 'The wrong demo password'), false);
});
test('password hashing preserves whitespace, Unicode and embedded zero bytes', async () => {
  for (const password of ['  do not trim me  ', 'Şifre-😀-deneme-2026', 'demo' + String.fromCharCode(0) + '-password-2026']) {
    const hash = await hashPassword(password);
    assert.equal(await verifyPassword(hash, password), true);
    assert.equal(await verifyPassword(hash, password.trim() + '!'), false);
  }
});
test('new password policy is shared with registration and uses UTF-8 bounds', async () => {
  for (const password of [undefined, 123, '', 'too short', ' '.repeat(12), '😀'.repeat(257)]) {
    await assert.rejects(hashPassword(password), UserInputError);
  }
  const password = '😀'.repeat(256);
  assert.equal(await verifyPassword(await hashPassword(password), password), true);
});
test('verification fails safely for malformed hashes and invalid password inputs', async () => {
  const hash = await hashPassword('A valid test password');
  for (const encoded of [null, '', 'plain-text', hash.slice(0, -8), '$argon2id$v=19$m=999999999,t=3,p=4$salt$hash', 'x'.repeat(513)]) {
    assert.equal(await verifyPassword(encoded, 'A valid test password'), false);
  }
  for (const password of [undefined, 42, '', 'x'.repeat(1025)]) {
    assert.equal(await verifyPassword(hash, password), false);
  }
});

test('distinct unpaired surrogates cannot collapse into the same UTF-8 credential', async () => {
  const broken = 'demo-password-' + String.fromCharCode(0xd800);
  await assert.rejects(hashPassword(broken), UserInputError);
  const validReplacement = 'demo-password-' + String.fromCodePoint(0xfffd);
  const hash = await hashPassword(validReplacement);
  assert.equal(await verifyPassword(hash, broken), false);
  assert.equal(await verifyPassword(hash, 'demo-password-' + String.fromCharCode(0xd801)), false);
  assert.equal(await verifyPassword(hash, validReplacement), true);
});
