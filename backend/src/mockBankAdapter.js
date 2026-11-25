import { createHash } from 'node:crypto';

export const MOCK_PAYMENT_TOKENS = Object.freeze({
  approved: 'mock_approve',
  declined: 'mock_decline',
});

// These deliberately non-production numbers are only fixtures for the in-process mock.
const SYNTHETIC_TEST_CARDS = Object.freeze({
  [MOCK_PAYMENT_TOKENS.approved]: Object.freeze({
    cardNumber: '9999000000000001',
    cardholderName: 'SULINA TEST APPROVED',
    expiryMonth: '12',
    expiryYear: '2099',
    securityCode: '000',
  }),
  [MOCK_PAYMENT_TOKENS.declined]: Object.freeze({
    cardNumber: '9999000000000002',
    cardholderName: 'SULINA TEST DECLINED',
    expiryMonth: '12',
    expiryYear: '2099',
    securityCode: '000',
  }),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^[0-9]+\.[0-9]{2}$/;

export class MockBankValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MockBankValidationError';
    this.code = 'INVALID_MOCK_PAYMENT';
  }
}

export class MockBankIdempotencyError extends Error {
  constructor() {
    super('The payment attempt key was already used for different payment details.');
    this.name = 'MockBankIdempotencyError';
    this.code = 'IDEMPOTENCY_KEY_REUSED';
  }
}

export function getSyntheticTestCard(paymentToken) {
  const card = SYNTHETIC_TEST_CARDS[paymentToken];
  if (!card) throw new MockBankValidationError('Unsupported mock payment token.');
  return { ...card };
}

function requireCardField(card, field) {
  if (!Object.hasOwn(card, field)) {
    throw new MockBankValidationError(`card.${field} is required.`);
  }
}

export function validateSyntheticCard(card, now = new Date()) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    throw new MockBankValidationError('card is required.');
  }
  for (const field of ['cardNumber', 'cardholderName', 'expiryMonth', 'expiryYear', 'securityCode']) {
    requireCardField(card, field);
  }
  if (!/^\d{16}$/.test(card.cardNumber)) {
    throw new MockBankValidationError('card.cardNumber must be a 16-digit synthetic test number.');
  }
  if (typeof card.cardholderName !== 'string' || card.cardholderName.trim().length < 2 ||
      card.cardholderName.trim().length > 100) {
    throw new MockBankValidationError('card.cardholderName must contain 2 to 100 characters.');
  }
  if (!/^(0[1-9]|1[0-2])$/.test(card.expiryMonth) || !/^20\d{2}$/.test(card.expiryYear)) {
    throw new MockBankValidationError('card expiry must use MM and YYYY fields.');
  }
  const expiryMonth = Number(card.expiryMonth);
  const expiryYear = Number(card.expiryYear);
  if (expiryYear < now.getUTCFullYear() ||
      (expiryYear === now.getUTCFullYear() && expiryMonth < now.getUTCMonth() + 1)) {
    throw new MockBankValidationError('The synthetic test card is expired.');
  }
  if (!/^\d{3}$/.test(card.securityCode)) {
    throw new MockBankValidationError('card.securityCode must contain 3 digits.');
  }
  return card;
}

function validateAuthorization(request, now) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new MockBankValidationError('Payment authorization details are required.');
  }
  if (!Number.isSafeInteger(request.customerId) || request.customerId <= 0) {
    throw new MockBankValidationError('customerId must be a positive integer.');
  }
  if (typeof request.idempotencyKey !== 'string' || !UUID_PATTERN.test(request.idempotencyKey)) {
    throw new MockBankValidationError('idempotencyKey must be a UUID.');
  }
  if (request.currency !== 'TRY') {
    throw new MockBankValidationError('The mock bank supports TRY only.');
  }
  if (typeof request.amount !== 'string' || !MONEY_PATTERN.test(request.amount) ||
      BigInt(request.amount.replace('.', '')) <= 0n) {
    throw new MockBankValidationError('amount must be a positive decimal string with two fractional digits.');
  }
  if (request.requestFingerprint !== undefined &&
      (typeof request.requestFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(request.requestFingerprint))) {
    throw new MockBankValidationError('requestFingerprint must be a SHA-256 hex digest.');
  }
  validateSyntheticCard(request.card, now);
}

function defaultReferenceFactory({ customerId, idempotencyKey }) {
  const digest = createHash('sha256').update(`${customerId}:${idempotencyKey}`).digest('hex');
  return `mock-pay-${digest.slice(0, 16)}`;
}

export function createMockBankAdapter({
  now = () => new Date(),
  referenceFactory = defaultReferenceFactory,
} = {}) {
  // Stored attempts contain no card number, security code or cardholder data.
  const attempts = new Map();

  return Object.freeze({
    async authorize(request) {
      validateAuthorization(request, now());
      const status = request.card.cardNumber === SYNTHETIC_TEST_CARDS[MOCK_PAYMENT_TOKENS.approved].cardNumber
        ? 'approved' : 'declined';
      const scope = `${request.customerId}:${request.idempotencyKey}`;
      const fingerprint = JSON.stringify({
        amount: request.amount,
        currency: request.currency,
        status,
        requestFingerprint: request.requestFingerprint ?? null,
      });
      const previous = attempts.get(scope);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new MockBankIdempotencyError();
        return { ...previous.result, replayed: true };
      }

      const reference = referenceFactory({
        customerId: request.customerId,
        idempotencyKey: request.idempotencyKey,
        status,
      });
      if (typeof reference !== 'string' || reference.length < 1 || reference.length > 100) {
        throw new MockBankValidationError('The mock transaction reference is invalid.');
      }
      const result = Object.freeze({ status, reference, replayed: false });
      attempts.set(scope, { fingerprint, result });
      return { ...result };
    },
  });
}
