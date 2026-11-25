import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createMockBankAdapter } from '../src/mockBankAdapter.js';
import { createMockPaymentService, MockPaymentRequestError } from '../src/mockPaymentService.js';

const fixture = JSON.parse(await readFile(
  new URL('../../docs/contracts/checkout/v1/examples.json', import.meta.url), 'utf8',
));

test('payment service takes the amount from current catalog prices and uses the v1 token contract', async () => {
  let catalogQuery;
  const prisma = { product: { async findMany(query) {
    catalogQuery = query;
    return [{ id: 101, price: '125.50' }, { id: 202, price: '39.90' }];
  } } };
  const service = createMockPaymentService({ prisma, bank: createMockBankAdapter() });
  const result = await service.authorize(42, fixture.cases.approved.request);
  assert.equal(result.quote.amount, '290.90');
  assert.equal(result.quote.currency, 'TRY');
  assert.equal(result.payment.status, 'approved');
  assert.deepEqual(catalogQuery, {
    where: { id: { in: [101, 202] } },
    select: { id: true, price: true },
  });
});

test('client-supplied amounts are rejected instead of reaching the bank', async () => {
  let bankCalled = false;
  const service = createMockPaymentService({
    prisma: { product: { findMany: async () => [] } },
    bank: { authorize: async () => { bankCalled = true; } },
  });
  await assert.rejects(
    service.authorize(42, { ...fixture.cases.approved.request, amount: '0.01' }),
    (error) => error instanceof MockPaymentRequestError && error.code === 'INVALID_CHECKOUT',
  );
  assert.equal(bankCalled, false);
});
