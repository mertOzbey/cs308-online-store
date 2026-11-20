import { randomBytes, createHash } from 'node:crypto';
import { SAFE_USER_SELECT, UserInputError } from './users.js';

export const DEFAULT_SESSION_TTL_SECONDS = 28800;
export function validateSessionLifetime(ttlSeconds) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 2592000) {
    throw new TypeError('Session lifetime must be an integer from 60 to 2592000 seconds.');
  }
  return ttlSeconds;
}
function validToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) &&
    Buffer.from(token, 'base64url').toString('base64url') === token;
}
function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}
function requireUserId(id) {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new UserInputError('Invalid user ID.');
}

export function createSessionService(prisma, { ttlSeconds = DEFAULT_SESSION_TTL_SECONDS, now = () => new Date() } = {}) {
  validateSessionLifetime(ttlSeconds);
  if (typeof now !== 'function') throw new TypeError('A session clock function is required.');
  function instant() {
    const date = now();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('Invalid session clock.');
    return date;
  }
  async function issue(storage, userId, createdAt) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
    if (!Number.isFinite(expiresAt.getTime())) throw new TypeError('Invalid session expiration.');
    await storage.authSession.create({
      data: { tokenHash: tokenHash(token), userId, createdAt, expiresAt },
      select: { tokenHash: true },
    });
    return { token, expiresAt };
  }
  return {
    async issueSession(userId) {
      requireUserId(userId);
      return issue(prisma, userId, instant());
    },
    async resolveSession(token) {
      if (!validToken(token)) return null;
      const session = await prisma.authSession.findFirst({
        where: { tokenHash: tokenHash(token), revokedAt: null, expiresAt: { gt: instant() } },
        select: { user: { select: SAFE_USER_SELECT } },
      });
      return session?.user ?? null;
    },
    async revokeSession(token) {
      if (!validToken(token)) return false;
      const result = await prisma.authSession.updateMany({
        where: { tokenHash: tokenHash(token), revokedAt: null },
        data: { revokedAt: instant() },
      });
      return result.count === 1;
    },
    async rotateSession(token, userId) {
      requireUserId(userId);
      if (!validToken(token)) return null;
      const date = instant();
      return prisma.$transaction(async (tx) => {
        // PostgreSQL rechecks the condition after a competing updater commits.
        // Only one concurrent rotation can consume the active old session.
        const result = await tx.authSession.updateMany({
          where: { tokenHash: tokenHash(token), userId, revokedAt: null, expiresAt: { gt: date } },
          data: { revokedAt: date },
        });
        if (result.count !== 1) return null;
        return issue(tx, userId, date);
      });
    },
  };
}
