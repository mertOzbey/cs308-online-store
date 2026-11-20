import { Router } from 'express';
import { createSessionService } from './sessions.js';
import { createAuthentication } from './authentication.js';
import {
  createUserRepository,
  EmailInUseError,
  UserInputError,
  validateRegistrationInput,
} from './users.js';
import { hashPassword, PasswordHashError } from './passwords.js';

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

  router.get('/me', auth.requireAuth, (req, res) => res.json({ user: req.user }));
  return router;
}
