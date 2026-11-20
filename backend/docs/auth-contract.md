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
