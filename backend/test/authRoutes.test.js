import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { readAuthConfig } from '../src/authConfig.js';

const config = readAuthConfig({ SESSION_TTL_SECONDS: '60' });
const registration = (overrides = {}) => ({
  name: 'Demo Customer',
  taxId: '001-demo-tax',
  email: 'Demo@Example.Test',
  homeAddress: 'Demo Street 1',
  password: 'A complete demo password',
  ...overrides,
});

let createFailure;
let createdData;
let server;
let base;

const prisma = {
  user: {
    async create({ data }) {
      if (createFailure) throw createFailure;
      createdData = structuredClone(data);
      return {
        id: 17,
        name: data.name,
        email: data.email,
        homeAddress: data.homeAddress,
        role: data.role,
      };
    },
  },
};

before(async () => {
  server = createApp(prisma, { authConfig: config }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

beforeEach(() => {
  createFailure = undefined;
  createdData = undefined;
});

function register(body, origin = config.allowedOrigins[0]) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin !== null) headers.Origin = origin;
  return fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('registration creates a customer with an Argon2id hash and returns only the safe profile', async () => {
  const request = registration();
  const response = await register(request);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    user: {
      id: 17,
      name: request.name,
      email: request.email.toLowerCase(),
      homeAddress: request.homeAddress,
      role: 'CUSTOMER',
    },
  });
  assert.equal(createdData.role, 'CUSTOMER');
  assert.equal(createdData.taxId, request.taxId);
  assert.match(createdData.passwordHash, /^\$argon2id\$/);
  assert.equal(createdData.passwordHash.includes(request.password), false);
  assert.equal(Object.hasOwn(createdData, 'password'), false);
});

test('registration rejects invalid input and attempts to choose a privileged role', async () => {
  const shortPassword = await register(registration({ password: 'too short' }));
  assert.equal(shortPassword.status, 400);
  assert.deepEqual(await shortPassword.json(), {
    error: 'Invalid registration.',
    code: 'INVALID_USER_INPUT',
  });

  const privileged = await register(registration({ role: 'PRODUCT_MANAGER' }));
  assert.equal(privileged.status, 400);
  assert.equal(createdData, undefined);
});

test('registration maps an atomic duplicate-email conflict to 409', async () => {
  createFailure = Object.assign(new Error('private unique constraint detail'), { code: 'P2002' });
  const response = await register(registration());

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: 'An account with this email already exists.',
    code: 'EMAIL_IN_USE',
  });
});

test('registration rejects missing and untrusted origins before creating an account', async () => {
  assert.equal((await register(registration(), null)).status, 403);
  assert.equal((await register(registration(), 'https://attacker.example.test')).status, 403);
  assert.equal(createdData, undefined);
});

test('registration returns a generic 503 response for storage failures', async () => {
  createFailure = new Error('private database diagnostic');
  const response = await register(registration());

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Registration is temporarily unavailable.' });
});
