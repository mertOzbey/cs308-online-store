# Database setup (SCRUM-69 and SCRUM-70)

This contribution configures PostgreSQL and Prisma, and defines the Product and
Category models. Express setup (SCRUM-68) and GET Products (SCRUM-71) belong to
other team members.

## Run locally

Prerequisites: Node.js 24.11 or newer on the **24.x** release line, npm, and
Docker with Compose. Alternatively, use an existing local PostgreSQL 17 server
with separate `cs308` and `cs308_test` databases and update `.env` accordingly.

Run these commands from `backend/`:

```sh
npm ci
cp .env.example .env
docker compose up -d --wait
npm run db:generate
npm run db:validate
npm run db:deploy
npm run db:check
npm test
```

The Compose service binds PostgreSQL to `127.0.0.1:5432`. The example password
is for local development only. Keep real credentials in `.env`, which is already
ignored by Git. No shared or hosted database credentials were provided.

`db:deploy` applies the committed migration. To develop a later schema change,
use `npm run db:migrate -- --name describe_change`, inspect the SQL, and commit
the new migration. Regenerate the client after schema changes. Do not edit an
already shared/applied migration, use `db push` instead of migration history, or
reset a teammate's database.

`docker compose stop` preserves local data. The test database creation script
runs only when a new Compose volume is initialized. For an existing volume,
create the test database once with:

```sh
docker compose exec db psql -U cs308 -d cs308 -c 'CREATE DATABASE cs308_test;'
```

## How the pieces fit

1. `.env` supplies the database URL; `prisma.config.js` configures the Prisma CLI.
2. `prisma/schema.prisma` describes the models and their relationships.
3. `prisma/migrations/` holds the SQL applied to PostgreSQL.
4. `npm run db:generate` creates a client in `generated/prisma/` (ignored by Git).
5. `src/db.js` uses Prisma's PostgreSQL adapter and exports one shared client.

Prisma CLI, client, and PostgreSQL adapter are pinned to **7.10.1**. Avoid mixing
Prisma 6 tutorials/configuration with this setup. The recommended Prisma 7 client
generator emits TypeScript; Node 24 runs the generated files with native type
stripping, so the handwritten backend modules remain ordinary ESM JavaScript.

For the teammates implementing Express and GET Products, import the shared
client from their backend module:

```js
import { prisma } from './db.js'; // example from another file in src/

const products = await prisma.product.findMany({
  include: { category: true },
  orderBy: { id: 'asc' },
});
```

This is a database query example, not an HTTP endpoint. Reuse the client instead
of creating one per request. The server owner should call `prisma.$disconnect()`
when the process shuts down, not after every request. Prisma Decimal values
serialize as strings; agree on the API response with the frontend owner and do
not silently convert money to floating point.

## Models and requirements

Course Project, page 2, requirement 9 specifies the minimum product properties:

| Requirement | Field | Storage |
| --- | --- | --- |
| ID | `id` | Auto-incrementing integer primary key |
| Name | `name` | Required text |
| Model | `model` | Required text |
| Serial number | `serialNumber` | Required unique text |
| Description | `description` | Required text |
| Quantity in stock | `stockQuantity` | Integer, default 0, nonnegative |
| Price | `price` | `DECIMAL(12,2)`, nonnegative |
| Warranty status | `warrantyStatus` | Required text |
| Distributor information | `distributorInformation` | Required text |

`Category` has an ID, unique name, optional description, and a collection of
products. Both models record creation and update timestamps. A required
`Product.categoryId` foreign key enforces one category per product; an index
supports category lookups. Deleting a category with products is restricted.

The SQL migration also contains nonnegative price/stock and nonblank required
text CHECK constraints. Prisma cannot represent CHECK constraints in its schema
language, so preserve those SQL rules in future migrations. Out-of-stock products
remain stored and queryable (Course Project, pages 1-2, requirement 7).

Review these business assumptions with the team before merging:

- `serialNumber` identifies a catalog product, not each physical unit in stock.
  Per-unit serial tracking would need another model.
- Each product belongs to one category. Category names and serial numbers have
  PostgreSQL's default case-sensitive uniqueness.
- Warranty and distributor information are text until the team defines a more
  detailed policy. One store currency is assumed; no currency conversion is added.
- The team has not supplied a detailed acceptance description on the two Jira
  cards. These choices implement the course minimum and remain reviewable.

## Tests

`npm test` requires `TEST_DATABASE_URL` pointing at a dedicated database whose
name ends in `_test`. It never falls back to `DATABASE_URL`. Tests create a
randomly named schema, deploy the real migration into it, and remove only that
schema at the end. The test account needs schema creation privileges there.

The 16 integration tests cover connectivity, all required product properties,
category relationships, foreign keys, restricted deletion, unique identifiers,
default/zero stock, exact decimal prices, rejected negative values and blank
names, free products, and reapplying migrations without losing records.
Missing database configuration fails the suite rather than skipping it.

## References and contribution review

- Course Project, pages 2 and 6-7: product fields, responsible AI use and grading.
- [Prisma 7 configuration](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)
- [Generating Prisma Client](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client)
- [One-to-many relationships](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations/one-to-many-relations)

Prepared with AI assistance. Bedirhan must review and understand the code and
design decisions before submission/demo. Passing automated tests does not
replace that review. No Jira card is marked Done by this contribution.
