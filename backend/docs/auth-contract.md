# User and authentication contract (SCRUM-75, SCRUM-78)

This branch provides the account and authentication foundation. Registration,
login and logout HTTP endpoints belong to SCRUM-76/77; their delivery is separate.
Product search/sort (SCRUM-79/81) and the guest cart remain public.

## User data

Registration uses `name`, `taxId`, `email`, `homeAddress` and `password`.
Persist only `passwordHash`, never the original password. Tax IDs are opaque
text (including leading zeroes), not unique or restricted to one country's format.
Limits: name 200 characters, taxId 100, email 254, homeAddress 1000, encoded hash 512.
Email is trimmed/lowercased before persistence. The SQL canonical-email check and
unique index enforce this even for simultaneous requests bypassing application code.

Roles are CUSTOMER (default), SALES_MANAGER, PRODUCT_MANAGER and SUPPORT_AGENT.
Public registration must always create CUSTOMER; privileged account provisioning
is a separate trusted operation, not a public registration input.

Safe account output is restricted to id, name, email, homeAddress and role.
Tax IDs, password hashes and session secrets are not public response fields.
Profile authorization is server-side and always tied to the authenticated user.

## Delivery and dependencies

| Delivery | New npm package | Previous delivery | Team dependency | Database |
| --- | --- | --- | --- | --- |
| B1 User model | None | None | None | PostgreSQL 17, Prisma 7.10.1; create_users migration |
| B2 Validated repository | None | B1 | None; consumed by Damla's SCRUM-76/77 | B1 migration; no additional migration |
| B3 Password helpers | argon2 0.45.2; cookie 2.0.2 installed for B5 | B2 validation policy | None; consumed by Damla | No new migration |
| B4 Persistent sessions | None; built-in node:crypto | B1/B2 | None; consumed by Damla's SCRUM-77 | create_auth_sessions migration |
| B5 Cookies/middleware | cookie 2.0.2 already installed by B3 | B4 | Frontend uses configured origin/proxy; Damla consumes guards | No new migration |

## HTTP authentication handoff

readAuthConfig(process.env) from src/authConfig.js validates configuration at
startup. APP_ORIGIN is mandatory HTTPS in production. Development defaults to
http://localhost:5173. AUTH_ALLOWED_ORIGINS optionally lists additional exact
canonical origins. Paths, credentials, wildcard origins and insecure production
origins are rejected. SESSION_TTL_SECONDS is 60..2592000 (default 28800).
SESSION_COOKIE_NAME defaults to sulina_session.

createAuthentication(sessionService, config) from src/authentication.js exports:
- requireAuth: reject absent/invalid/expired/revoked sessions with 401.
- optionalAuth: absent cookie means anonymous; supplied invalid cookie means 401.
- requireTrustedOrigin: require an exact trusted Origin for unsafe methods.
- readSessionToken(req): token or null; malformed/duplicate cookies raise AuthCookieError (401).
- setSessionCookie(res, issuedSession) and clearSessionCookie(res).

Cookies are host-only, HttpOnly, SameSite=Lax and Path=/; production always adds
Secure. Set/clear helpers use the same scope. Session cookies expire with the
underlying session; raw tokens are not sent in JSON. Auth responses are no-store.
Storage outages return generic 503, never an authenticated or silently anonymous user.

requireAuth checks Origin on unsafe authenticated requests. For public auth
POSTs (registration/login), Damla must explicitly mount requireTrustedOrigin
before the handler, since callers do not have a session yet. Missing/null/
untrusted Origin is rejected with 403, including CLI calls without an Origin.
SameSite cookies alone are not the CSRF protection. Do not configure credentialed
wildcard CORS, infer trusted origins from the Host header or put tokens in URLs.
These guards are route-scoped; do not require login for catalog/search/guest cart.

## Session handoff

createSessionService(prisma, { ttlSeconds, now }) from src/sessions.js provides:
- issueSession(userId) -> { token, expiresAt } for a successful authenticated login.
- resolveSession(token) -> current safe user or null.
- revokeSession(token) -> boolean; repeated logout is safe.
- rotateSession(token, userId) -> replacement { token, expiresAt } or null.

Never issue a session merely because an unverified request supplies a user ID:
the login endpoint must verify credentials first. Raw tokens belong only in the
HttpOnly cookie, never a JSON response/log or localStorage. Random 256-bit tokens
are represented by SHA-256 hashes in PostgreSQL. This is appropriate for random
tokens; passwords require the separate slow Argon2id helper.

Default lifetime is 8 hours; allowed configuration is 60 seconds to 30 days.
Expiration and revocation are checked on every resolution, alongside the current
user role. Rotation is transactional and may consume an old session only once,
only for the same user; insertion failure rolls back the revocation. Other
devices remain logged in. Deleting the user cascades only their sessions.
No Redis/JWT package or external service is required.

## Password handoff

Import hashPassword(password) and verifyPassword(hash, password) from
src/passwords.js. Hashing uses Argon2id with the library's security defaults and
a fresh random salt per password. Validation is shared with registration.
Verification returns false for a wrong password, malformed encoded hash or
invalid input, without logging credentials. Hashing infrastructure errors are
PasswordHashError (503); endpoints must return a generic service error.
The accepted PHC format is this application's Argon2id v19, 16-byte salt,
32-byte hash, with bounded cost parameters; other legacy formats require an
explicit migration rather than silently weakening verification.

## Registration handoff

`validateRegistrationInput(body)` returns `{ profile, password }`. It accepts only
the five registration fields; id/role/passwordHash and other keys are rejected.
New passwords require at least 12 Unicode characters and at most 1024 UTF-8 bytes;
their whitespace/Unicode content is preserved. Profile text is trimmed, email
lowercased. Validation errors are `UserInputError` (400, INVALID_USER_INPUT).

`createUserRepository(prisma)` exports:
- `createCustomer(profile, passwordHash)`: persist only a separately supplied trusted
  encoded hash; always CUSTOMER; return the safe projection.
- `findCredentialsByEmail(email)`: internal-only `{ id, passwordHash }` or null.
- `findSafeById(id)`: safe profile or null.

The endpoint owner must validate the input, hash the password with the shared
password helper, then call createCustomer. Never pass a request body as its hash
argument. An atomic database unique violation maps to `EmailInUseError`
(409, EMAIL_IN_USE); infrastructure errors propagate for a generic 5xx response.

After pulling a schema change, run `npm ci`, `npm run db:generate`,
`npm run db:validate` and `npm run db:deploy` from backend.
Never reset shared data or edit an already applied migration.

The complete project also needs role-restricted orders, invoices, refunds,
wishlists and customer-context support conversations. These are consumers of this
foundation; their features and UI are not implemented by these two cards.
