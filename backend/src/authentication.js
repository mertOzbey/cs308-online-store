import { parseCookie, stringifySetCookie } from 'cookie';
import { SAFE_USER_SELECT } from './users.js';
import { validateAuthConfig } from './authConfig.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export class AuthCookieError extends Error {
  constructor() {
    super('Authentication required.');
    this.name = 'AuthCookieError';
    this.status = 401;
    this.code = 'AUTHENTICATION_REQUIRED';
  }
}
function isToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) &&
    Buffer.from(token, 'base64url').toString('base64url') === token;
}

export function createAuthentication(sessionService, configuration) {
  const config = validateAuthConfig(configuration);
  const options = {
    name: config.cookieName, path: '/', httpOnly: true, sameSite: 'lax', secure: config.secure,
  };
  function readSessionToken(req) {
    const header = req.get('Cookie');
    if (header === undefined) return null;
    if (typeof header !== 'string' || header.length > 8192) throw new AuthCookieError();
    const matches = header.split(';').map((part) => part.trim())
      .filter((part) => part.split('=')[0].trim() === config.cookieName);
    if (!matches.length) return null;
    if (matches.length !== 1 || !matches[0].includes('=')) throw new AuthCookieError();
    const rawValue = matches[0].slice(matches[0].indexOf('=') + 1).trim();
    if (!isToken(rawValue)) throw new AuthCookieError();
    const token = parseCookie(header)[config.cookieName];
    if (token !== rawValue) throw new AuthCookieError();
    return token;
  }
  function requireTrustedOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method) || config.allowedOrigins.includes(req.get('Origin'))) return next();
    return res.set('Cache-Control', 'no-store').status(403).json({ error: 'Request origin is not permitted.' });
  }
  function middleware(required) {
    return async (req, res, next) => {
      req.user = undefined; // Replace any upstream or client-supplied identity.
      res.set('Cache-Control', 'no-store');
      res.vary('Cookie');
      let token;
      try { token = readSessionToken(req); } catch {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      if (!token) return required ? res.status(401).json({ error: 'Authentication required.' }) : next();
      let user;
      try { user = await sessionService.resolveSession(token); } catch {
        return res.status(503).json({ error: 'Authentication is temporarily unavailable.' });
      }
      if (!user) return res.status(401).json({ error: 'Authentication required.' });
      req.user = Object.freeze(Object.fromEntries(Object.keys(SAFE_USER_SELECT).map((key) => [key, user[key]])));
      return requireTrustedOrigin(req, res, next);
    };
  }
  return {
    requireAuth: middleware(true),
    optionalAuth: middleware(false),
    requireTrustedOrigin,
    readSessionToken,
    setSessionCookie(res, session) {
      if (!session || !isToken(session.token) || !(session.expiresAt instanceof Date)) {
        throw new TypeError('A valid issued session is required.');
      }
      const maxAge = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
      if (!Number.isSafeInteger(maxAge) || maxAge < 1 || maxAge > config.ttlSeconds) {
        throw new TypeError('Session cookie expiration is invalid.');
      }
      res.append('Set-Cookie', stringifySetCookie({
        ...options, value: session.token, expires: session.expiresAt, maxAge,
      }));
    },
    clearSessionCookie(res) {
      res.append('Set-Cookie', stringifySetCookie({ ...options, value: '', expires: new Date(0), maxAge: 0 }));
    },
  };
}
