import { USER_ROLES } from './users.js';

function authenticated(req, res) {
  if (!req.user || !Number.isSafeInteger(req.user.id) || req.user.id <= 0 || !USER_ROLES.includes(req.user.role)) {
    res.set('Cache-Control', 'no-store').status(401).json({ error: 'Authentication required.' });
    return false;
  }
  return true;
}
function forbidden(res) {
  return res.set('Cache-Control', 'no-store').status(403).json({ error: 'Access is not permitted.' });
}

// Mount requireAuth before these policies; roles must come from its trusted user.
export function requireRoles(...roles) {
  if (!roles.length || roles.some((role) => !USER_ROLES.includes(role))) {
    throw new TypeError('An explicit list of supported roles is required.');
  }
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!authenticated(req, res)) return;
    if (!allowed.has(req.user.role)) return forbidden(res);
    return next();
  };
}

// getOwnerId must resolve a stored resource's owner, never trust a client claim.
// Role-specific exceptions need their own resource/context authorization.
export function requireOwner(getOwnerId) {
  if (typeof getOwnerId !== 'function') throw new TypeError('A trusted resource owner resolver is required.');
  return async (req, res, next) => {
    if (!authenticated(req, res)) return;
    let ownerId;
    try { ownerId = await getOwnerId(req); } catch {
      return res.set('Cache-Control', 'no-store').status(503).json({ error: 'Access could not be checked.' });
    }
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || ownerId !== req.user.id) return forbidden(res);
    return next();
  };
}
