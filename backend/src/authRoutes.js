import { Router } from 'express';
import { createSessionService } from './sessions.js';
import { createAuthentication } from './authentication.js';

export function createAuthRouter(prisma, config) {
  const router = Router();
  const sessions = createSessionService(prisma, { ttlSeconds: config.ttlSeconds });
  const auth = createAuthentication(sessions, config);
  router.get('/me', auth.requireAuth, (req, res) => res.json({ user: req.user }));
  return router;
}
