import { Router } from 'express';
import { createSessionService } from './sessions.js';
import { createAuthentication } from './authentication.js';
import {
  createUserRepository,
  EmailInUseError,
  UserInputError,
  validateRegistrationInput,
} from './users.js';
import { hashPassword, PasswordHashError, verifyPassword } from './passwords.js';

function validLoginBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(body)) &&
    Object.keys(body).length === 2 && Object.hasOwn(body, 'email') &&
    Object.hasOwn(body, 'password') && typeof body.password === 'string';
}

function invalidCredentials(res) {
  return res.status(401).json({ error: 'Invalid email or password.' });
}

export function createAuthRouter(prisma, config) {
  const router = Router();
  const sessions = createSessionService(prisma, { ttlSeconds: config.ttlSeconds });
  const auth = createAuthentication(sessions, config);
  const users = createUserRepository(prisma);

  router.post('/register', auth.requireTrustedOrigin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { profile, password } = validateRegistrationInput(req.body);
      const passwordHash = await hashPassword(password);
      const user = await users.createCustomer(profile, passwordHash);
      return res.status(201).json({ user });
    } catch (error) {
      if (error instanceof UserInputError) {
        return res.status(400).json({ error: 'Invalid registration.', code: error.code });
      }
      if (error instanceof EmailInUseError) {
        return res.status(409).json({ error: 'An account with this email already exists.', code: error.code });
      }
      if (!(error instanceof PasswordHashError)) console.error('Failed to create customer account.');
      return res.status(503).json({ error: 'Registration is temporarily unavailable.' });
    }
  });

  router.post('/login', auth.requireTrustedOrigin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Cookie');
    if (!validLoginBody(req.body)) return invalidCredentials(res);

    try {
      let credentials;
      try {
        credentials = await users.findCredentialsByEmail(req.body.email);
      } catch (error) {
        if (error instanceof UserInputError) return invalidCredentials(res);
        throw error;
      }
      if (!credentials || !await verifyPassword(credentials.passwordHash, req.body.password)) {
        return invalidCredentials(res);
      }

      const user = await users.findSafeById(credentials.id);
      if (!user) return invalidCredentials(res);
      const session = await sessions.issueSession(credentials.id);
      auth.setSessionCookie(res, session);
      return res.json({ user });
    } catch {
      console.error('Failed to authenticate customer account.');
      return res.status(503).json({ error: 'Login is temporarily unavailable.' });
    }
  });

  router.post('/logout', auth.requireTrustedOrigin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Cookie');
    let token;
    try {
      token = auth.readSessionToken(req);
    } catch {
      auth.clearSessionCookie(res);
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      if (token) await sessions.revokeSession(token);
    } catch {
      console.error('Failed to revoke customer session.');
      return res.status(503).json({ error: 'Logout is temporarily unavailable.' });
    }
    auth.clearSessionCookie(res);
    return res.sendStatus(204);
  });

  router.get('/me', auth.requireAuth, (req, res) => res.json({ user: req.user }));
  return router;
}
