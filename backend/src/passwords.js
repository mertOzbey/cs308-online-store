import argon2 from 'argon2';
import { PASSWORD_MAX_BYTES, validateNewPassword } from './users.js';

export class PasswordHashError extends Error {
  constructor() {
    super('Password hashing is temporarily unavailable.');
    this.name = 'PasswordHashError';
    this.status = 503;
    this.code = 'PASSWORD_HASH_UNAVAILABLE';
  }
}

export async function hashPassword(password) {
  validateNewPassword(password);
  try {
    return await argon2.hash(password, { type: argon2.argon2id });
  } catch {
    throw new PasswordHashError();
  }
}

// Bound work requested by corrupt encoded credentials before entering native code.
function supportedHash(hash) {
  if (typeof hash !== 'string' || hash.length > 512) return false;
  const match = /^\$argon2id\$v=19\$m=(\d{1,6}),t=(\d{1,2}),p=(\d{1,2})\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/.exec(hash);
  if (!match) return false;
  const [, memory, time, parallelism] = match.map(Number);
  return memory >= 8192 && memory <= 262144 && time >= 1 && time <= 10 &&
    parallelism >= 1 && parallelism <= 16 && memory * time <= 786432;
}

export async function verifyPassword(hash, password) {
  if (!supportedHash(hash) || typeof password !== 'string' || !password.isWellFormed() || !password ||
      Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
