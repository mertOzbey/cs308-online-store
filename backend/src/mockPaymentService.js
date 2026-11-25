import { createHash } from 'node:crypto';
import { parseCartItems } from './cartValidation.js';
import { getSyntheticTestCard } from './mockBankAdapter.js';

const CHECKOUT_FIELDS = ['idempotencyKey', 'items', 'paymentToken'];

export class MockPaymentRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MockPaymentRequestError';
    this.code = 'INVALID_CHECKOUT';
  }
}

function parsePrice(value) {
  const text = typeof value?.toFixed === 'function' ? value.toFixed(2) : String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new MockPaymentRequestError('A catalog price could not be represented in TRY.');
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function formatAmount(minorUnits) {
  const text = minorUnits.toString().padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

function normalizeCheckoutRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new MockPaymentRequestError('Checkout details are required.');
  }
  const keys = Object.keys(request).sort();
  if (keys.length !== CHECKOUT_FIELDS.length ||
      keys.some((key, index) => key !== CHECKOUT_FIELDS[index])) {
    throw new MockPaymentRequestError('Checkout accepts only idempotencyKey, items and paymentToken.');
  }
  let items;
  try {
    items = parseCartItems({ items: request.items });
  } catch (error) {
    throw new MockPaymentRequestError(error.message);
  }
  if (items.length === 0) throw new MockPaymentRequestError('Checkout requires at least one item.');
  return {
    idempotencyKey: request.idempotencyKey,
    items,
    paymentToken: request.paymentToken,
  };
}

async function quoteCurrentCatalog(prisma, items) {
  const products = await prisma.product.findMany({
    where: { id: { in: items.map(({ productId }) => productId) } },
    select: { id: true, price: true },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  let total = 0n;
  for (const item of items) {
    const product = productsById.get(item.productId);
    if (!product) throw new MockPaymentRequestError('Every checkout item must exist in the current catalog.');
    total += parsePrice(product.price) * BigInt(item.quantity);
  }
  if (total <= 0n) throw new MockPaymentRequestError('The checkout total must be positive.');
  return { amount: formatAmount(total), currency: 'TRY' };
}

export function createMockPaymentService({ prisma, bank }) {
  if (!prisma?.product?.findMany || typeof bank?.authorize !== 'function') {
    throw new TypeError('The mock payment service requires a catalog and bank adapter.');
  }
  return Object.freeze({
    async authorize(customerId, request) {
      const checkout = normalizeCheckoutRequest(request);
      const card = getSyntheticTestCard(checkout.paymentToken);
      const quote = await quoteCurrentCatalog(prisma, checkout.items);
      const requestFingerprint = createHash('sha256').update(JSON.stringify({
        items: checkout.items,
        paymentToken: checkout.paymentToken,
      })).digest('hex');
      const payment = await bank.authorize({
        customerId,
        idempotencyKey: checkout.idempotencyKey,
        amount: quote.amount,
        currency: quote.currency,
        requestFingerprint,
        card,
      });
      return { payment, quote, items: checkout.items };
    },
  });
}
