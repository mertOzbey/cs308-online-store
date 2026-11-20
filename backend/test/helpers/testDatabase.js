import 'dotenv/config';
import assert from 'node:assert/strict';
import { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient, prisma } from '../../src/db.js';

// Every test file owns a new schema in an explicitly dedicated test database.
export function useTestDatabase({ legacyCatalog = false } = {}) {
  assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL is required.');
  const base = new URL(process.env.TEST_DATABASE_URL);
  assert.match(base.pathname, /_test$/, 'Use a dedicated *_test database.');
  const schema = `cs308_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(base);
  url.searchParams.set('schema', schema);
  const admin = createDatabaseClient(base.href);
  const db = createDatabaseClient(url.href);
  const cwd = fileURLToPath(new URL('../../', import.meta.url));
  let created = false;
  function cli(args) {
    return execFileSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
      cwd, env: { ...process.env, DATABASE_URL: url.href }, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  const migrate = () => cli(['migrate', 'deploy']);
  before(async () => {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    if (legacyCatalog) {
      const initial = '20261104140000_create_product_category';
      const sql = readFileSync(new URL(`../../prisma/migrations/${initial}/migration.sql`, import.meta.url), 'utf8')
        .replaceAll('"Category"', `"${schema}"."Category"`)
        .replaceAll('"Product"', `"${schema}"."Product"`);
      for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
        await db.$executeRawUnsafe(statement);
      }
      const category = await db.category.create({ data: { name: 'Existing catalog' } });
      await db.product.create({ data: {
        name: 'Existing product', model: 'Legacy', serialNumber: 'LEGACY-1',
        description: 'Created before the user migration', stockQuantity: 3, price: '12.34',
        warrantyStatus: 'One year', distributorInformation: 'Demo distributor', categoryId: category.id,
      } });
      cli(['migrate', 'resolve', '--applied', initial]);
    }
    migrate();
  });
  after(async () => {
    await db.$disconnect();
    try {
      if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.$disconnect();
      await prisma.$disconnect();
    }
  });
  return { db, url: url.href, migrate };
}
