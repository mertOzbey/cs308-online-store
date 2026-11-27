import { createHash } from 'node:crypto';
import { Router } from 'express';
import { confirmApprovedOrder } from './approvedOrder.js';
import { createAuthentication } from './authentication.js';
import {
  createMockBankAdapter,
  MockBankIdempotencyError,
  MockBankValidationError,
} from './mockBankAdapter.js';
import {
  createMockPaymentService,
  MockPaymentRequestError,
  normalizeCheckoutRequest,
} from './mockPaymentService.js';
import { createSessionService } from './sessions.js';

function requestFingerprint(checkout) {
  return createHash('sha256').update(JSON.stringify({
    items: checkout.items,
    paymentToken: checkout.paymentToken,
  })).digest('hex');
}

function money(value) {
  return typeof value?.toFixed === 'function' ? value.toFixed(2) : String(value);
}

function serializeOrder(order) {
  return {
    orderId: order.id,
    customerId: order.customerId,
    purchasedAt: order.purchasedAt instanceof Date
      ? order.purchasedAt.toISOString()
      : new Date(order.purchasedAt).toISOString(),
    status: order.status === 'in_transit' ? 'in-transit' : order.status,
    currency: order.currency,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
    })),
    total: money(order.total),
    invoiceNumber: order.invoiceNumber,
  };
}

function knownFailure(error) {
  if (!error || typeof error !== 'object') return null;
  if (error instanceof MockPaymentRequestError || error instanceof MockBankValidationError) {
    return { status: 400, body: { code: 'INVALID_CHECKOUT', error: error.message } };
  }
  if (error instanceof MockBankIdempotencyError || error.code === 'IDEMPOTENCY_KEY_REUSED') {
    return { status: 409, body: { code: 'IDEMPOTENCY_KEY_REUSED', error: error.message } };
  }
  if (error.code === 'PAYMENT_DECLINED') {
    return { status: 402, body: { code: error.code, error: error.message } };
  }
  if (error.code === 'STOCK_CONFLICT') {
    return { status: 409, body: { code: error.code, error: error.message, items: error.items } };
  }
  if (error.code === 'INVALID_CHECKOUT') {
    return { status: 400, body: { code: error.code, error: error.message } };
  }
  return null;
}

export function createCheckoutRouter(prisma, authConfig, {
  bank = createMockBankAdapter(),
} = {}) {
  const router = Router();
  const auth = createAuthentication(
    createSessionService(prisma, { ttlSeconds: authConfig.ttlSeconds }),
    authConfig,
  );
  let payments;
  const attempts = new Map();

  function paymentService() {
    payments ??= createMockPaymentService({ prisma, bank });
    return payments;
  }

  async function complete(customerId, checkout) {
    try {
      const authorization = await paymentService().authorize(customerId, checkout);
      const order = await confirmApprovedOrder(prisma, {
        customerId,
        idempotencyKey: checkout.idempotencyKey,
        ...authorization,
      });
      return {
        status: 201,
        body: {
          payment: {
            status: authorization.payment.status,
            reference: authorization.payment.reference,
          },
          order: serializeOrder(order),
        },
      };
    } catch (error) {
      const failure = knownFailure(error);
      if (failure) return failure;
      throw error;
    }
  }

  router.post('/', auth.requireAuth, async (req, res) => {
    let checkout;
    try {
      checkout = normalizeCheckoutRequest(req.body);
    } catch (error) {
      const failure = knownFailure(error);
      if (failure) return res.status(failure.status).json(failure.body);
      throw error;
    }

    const scope = `${req.user.id}:${checkout.idempotencyKey}`;
    const fingerprint = requestFingerprint(checkout);
    let attempt = attempts.get(scope);
    if (attempt && attempt.fingerprint !== fingerprint) {
      return res.status(409).json({
        code: 'IDEMPOTENCY_KEY_REUSED',
        error: 'The payment attempt key was already used for different payment details.',
      });
    }

    if (!attempt) {
      attempt = { fingerprint };
      attempt.result = complete(req.user.id, checkout).catch((error) => {
        if (attempts.get(scope) === attempt) attempts.delete(scope);
        throw error;
      });
      attempts.set(scope, attempt);
    }

    try {
      const result = await attempt.result;
      return res.status(result.status).json(result.body);
    } catch {
      console.error('Checkout could not be completed.');
      return res.status(503).json({ error: 'Checkout is temporarily unavailable.' });
    }
  });

  return router;
}
