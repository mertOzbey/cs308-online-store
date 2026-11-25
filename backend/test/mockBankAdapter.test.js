import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMockBankAdapter,
  getSyntheticTestCard,
  MOCK_PAYMENT_TOKENS,
  MockBankValidationError,
} from '../src/mockBankAdapter.js';

const basePayment = (overrides = {}) => ({
  customerId: 42,
  idempotencyKey: 'c2b94c79-8a21-4f27-b317-c3e3e85c2000',
  amount: '290.90',
  currency: 'TRY',
  card: getSyntheticTestCard(MOCK_PAYMENT_TOKENS.approved),
  ...overrides,
});

test('synthetic approval card returns an approved result with a transaction reference', async () => {
  const result = await createMockBankAdapter().authorize(basePayment());
  assert.equal(result.status, 'approved');
  assert.match(result.reference, /^mock-pay-[0-9a-f]{16}$/);
  assert.equal(result.replayed, false);
});

test('synthetic decline card deterministically returns a declined result and reference', async () => {
  const result = await createMockBankAdapter().authorize(basePayment({
    idempotencyKey: 'c2b94c79-8a21-4f27-b317-c3e3e85c2002',
    card: getSyntheticTestCard(MOCK_PAYMENT_TOKENS.declined),
  }));
  assert.equal(result.status, 'declined');
  assert.match(result.reference, /^mock-pay-[0-9a-f]{16}$/);
});

test('missing card fields are rejected without echoing card values', async () => {
  const card = getSyntheticTestCard(MOCK_PAYMENT_TOKENS.approved);
  delete card.securityCode;
  await assert.rejects(
    createMockBankAdapter().authorize(basePayment({ card })),
    (error) => {
      assert.equal(error instanceof MockBankValidationError, true);
      assert.equal(error.code, 'INVALID_MOCK_PAYMENT');
      assert.match(error.message, /securityCode is required/);
      assert.equal(error.message.includes(card.cardNumber), false);
      return true;
    },
  );
});

test('replaying the same attempt returns one payment instead of creating a second one', async () => {
  let referencesCreated = 0;
  const bank = createMockBankAdapter({ referenceFactory: () => {
    referencesCreated += 1;
    return 'mock-pay-one-attempt';
  } });
  const first = await bank.authorize(basePayment());
  const retry = await bank.authorize(basePayment());
  assert.deepEqual(retry, { ...first, replayed: true });
  assert.equal(referencesCreated, 1);
});
