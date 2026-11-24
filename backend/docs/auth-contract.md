# User and authentication contract (SCRUM-75 through SCRUM-78)

The account and authentication foundation provides HTTP endpoints for registration,
login and logout.
Product search/sort (SCRUM-79/81) and the guest cart remain public.

## User data

Registration uses `name`, `taxId`, `email`, `homeAddress` and `password`.
Persist only `passwordHash`, never the original password. Tax IDs are opaque
text (including leading zeroes), not unique or restricted to one country's format.
Limits: name 200 characters, taxId 100, email 254, homeAddress 1000, encoded hash 512.
Email addresses are ASCII-only (SMTPUTF8/Unicode addresses are not supported);
Unicode profile text and well-formed Unicode passwords remain supported.
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
| B6 Role/ownership policies | None | B1 roles, B5 requireAuth | None; future protected routes consume policies | No new migration |
| B7 Account endpoint/integration | None | B1-B6 | Damla's SCRUM-76/77 only for released register/login/logout flow | Apply B1/B4 and harden_user_text_constraints forward migration |

The final forward migration makes email canonicalization independent of database
locale and rejects fields containing only the full ECMAScript whitespace set.
Use a UTF-8 PostgreSQL database. It validates existing records atomically; if
invalid legacy data exists, stop and resolve that data deliberately instead of
silently deleting/rewriting accounts. Old published migrations remain unchanged.
Input validation rejects ill-formed UTF-16 strings rather than letting UTF-8
encoding silently replace credential characters. It never normalizes valid passwords.

## Account endpoint and integration status

GET /api/auth/me is implemented by the real application. A valid session returns
200 with { user: { id, name, email, homeAddress, role } }; absent/invalid/expired/
revoked cookies return 401. Storage errors return generic 503. Responses are
Cache-Control: no-store and Vary: Cookie. Another user's ID in the query string
never switches the returned account. No taxId, passwordHash or token is exposed.

The auth router also serves the following endpoints with an exact-origin guard:

- POST /api/auth/register accepts the registration fields above and returns 201
  with the created customer. Invalid input returns 400 and duplicate email 409.
- POST /api/auth/login accepts email and password, returns the safe account,
  and sets the session cookie. Invalid credentials return a generic 401.
- POST /api/auth/logout revokes the cookie's session and clears the cookie
  with a 204 response. Repeated logout is safe.

Serve the frontend and /api through the same origin. The frontend keeps the
guest cart in local storage across registration, login, and logout. The
/__test__/ contract harness stays in authIntegration.test.js.

### Huseyin's integration order

SCRUM-79/81 search and price sorting have no authentication dependency and remain
public. Do not wait for login. If his popularity work changes Product/migrations,
combine both schema additions without deleting User/AuthSession or salesCount.
Preserve each migration; regenerate the client and apply the complete history.
His backend app.js product/category routes must coexist with the /api/auth mount.
The branches also have independent backend README additions; retain both.

Compatibility was checked against scrum-79-81-search-sort at
1506eefe931045f040f2017fabfe25f7c69e6635 in a separate combined source snapshot;
his changes are not included in this branch. Retain both auth and product-query
imports if app.js conflicts. The combined schema/migration history passed 122
backend tests; the combined frontend passed 57 tests, production build and lint
(one existing Footer render-time Date warning). The legacy-catalog test seeds the
historical schema directly so it does not depend on later generated-client fields.

### Requirements covered and remaining

SCRUM-75 covers required user fields, roles, canonical/unique email, safe user
repository, validation and migrations. SCRUM-78 covers Argon2id, persistent
revocable sessions, secure cookies, CSRF origin guards, authentication, role and
ownership guards, and a protected current-account endpoint.
The registration/login forms call the auth endpoints. SCRUM-15 profile UI is
separate. Future order/payment handlers must explicitly
require authentication; future management routes must explicitly add role/
resource policies. Invoice/card storage, live support, checkout, wishlist and
refund implementations are outside this branch.

The library/security references are the official node-argon2 documentation,
jshttp/cookie API documentation, Node crypto documentation and Prisma 7 docs.
No JWT, Redis, external identity, payment, email or other hosted service is needed
for these two cards. No authentication secret environment variable is required
for random database-backed session tokens.

## Authorization handoff

Mount requireAuth first, followed by requireRoles(...roles) or
requireOwner(getOwnerId) from src/authorization.js. A policy without an
authenticated user returns 401; a denied role/owner returns 403. Unsupported
role configuration fails during startup. Session resolution reads the current
database role, so a role change is effective on the next request.

Role boundaries:
- CUSTOMER: customer operations on their own account/resources.
- SALES_MANAGER: pricing, discounts, invoices/reports and refunds.
- PRODUCT_MANAGER: product/category/stock, delivery and comment moderation.
- SUPPORT_AGENT: support conversations and customer context authorized for them.

requireOwner's callback must return a stored resource owner ID (positive integer)
from a trusted database lookup; it must not return req.body.userId or an unverified
URL ownerId. There is deliberately no blanket manager/support ownership bypass.
A support conversation must separately authorize its assigned agent and linked
customer. Missing/malformed owners deny access; lookup outages return generic 503.
These policies do not implement or mark complete the future management panels.

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

requireAuth checks Origin on unsafe authenticated requests. The auth POST routes
mount requireTrustedOrigin before their handlers. Missing/null/
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
