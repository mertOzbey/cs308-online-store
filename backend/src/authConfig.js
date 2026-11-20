import { DEFAULT_SESSION_TTL_SECONDS, validateSessionLifetime } from './sessions.js';

export function validateAuthConfig(config) {
  if (!config || typeof config.secure !== 'boolean' ||
      typeof config.cookieName !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(config.cookieName) ||
      !Array.isArray(config.allowedOrigins) || config.allowedOrigins.length < 1 || config.allowedOrigins.length > 10) {
    throw new TypeError('Invalid authentication configuration.');
  }
  validateSessionLifetime(config.ttlSeconds);
  const origins = config.allowedOrigins.map((value) => {
    let url;
    try { url = new URL(value); } catch { throw new TypeError('Configure explicit application origins.'); }
    if (typeof value !== 'string' || url.origin !== value || url.username || url.password ||
        !['https:', 'http:'].includes(url.protocol) || (config.secure && url.protocol !== 'https:')) {
      throw new TypeError('Configure canonical HTTP(S) origins; production requires HTTPS.');
    }
    return value;
  });
  return Object.freeze({
    cookieName: config.cookieName, secure: config.secure, ttlSeconds: config.ttlSeconds,
    allowedOrigins: Object.freeze([...new Set(origins)]),
  });
}

export function readAuthConfig(env = process.env) {
  if (env.NODE_ENV !== undefined && !['development', 'test', 'production'].includes(env.NODE_ENV)) {
    throw new TypeError('NODE_ENV must be development, test or production.');
  }
  const secure = env.NODE_ENV === 'production';
  const origin = env.APP_ORIGIN ?? (secure ? undefined : 'http://localhost:5173');
  const rawTtl = env.SESSION_TTL_SECONDS;
  if (rawTtl !== undefined && (typeof rawTtl !== 'string' || !/^[1-9][0-9]*$/.test(rawTtl))) {
    throw new TypeError('SESSION_TTL_SECONDS must be an integer.');
  }
  const extras = env.AUTH_ALLOWED_ORIGINS === undefined ? []
    : env.AUTH_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  return validateAuthConfig({
    cookieName: env.SESSION_COOKIE_NAME ?? 'sulina_session',
    secure, ttlSeconds: rawTtl === undefined ? DEFAULT_SESSION_TTL_SECONDS : Number(rawTtl),
    allowedOrigins: [origin, ...extras],
  });
}
