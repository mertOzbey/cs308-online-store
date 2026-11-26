import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.ts';
import { parseCartItems, validateCartStock } from './cartValidation.js';

// Order.total has 24 digits. Keep every digit when multiplying or summing catalog prices.
const Money = Prisma.Decimal.clone({ precision: 32 });
const include = { items: { orderBy: { productId: 'asc' } } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkoutError(code, message, fields = {}) {
  return Object.assign(new Error(message), { code, ...fields });
}

// The caller authenticates the customer and supplies the server-side mock payment service result.
// The returned order includes purchase-time item and invoice customer snapshots.
export async function confirmApprovedOrder(db, { customerId, idempotencyKey, payment, quote, items }) {
  if (payment?.status === 'declined') {
    throw checkoutError('PAYMENT_DECLINED', 'The mock bank declined the payment.');
  }
  const approvedTotal = quote?.amount;
  let lines;
  try {
    lines = parseCartItems({ items }).sort((a, b) => a.productId - b.productId);
  } catch (error) {
    throw checkoutError('INVALID_CHECKOUT', error.message);
  }
  if (!lines.length || typeof idempotencyKey !== 'string' || !uuid.test(idempotencyKey)) {
    throw checkoutError('INVALID_CHECKOUT', 'Provide a non-empty cart and a UUID idempotency key.');
  }
  if (payment?.status !== 'approved' || quote?.currency !== 'TRY' ||
      typeof approvedTotal !== 'string' || !/^\d{1,22}\.\d{2}$/.test(approvedTotal)) {
    throw checkoutError('INVALID_CHECKOUT', 'Provide the server-approved amount in TRY.');
  }
  const where = { customerId_idempotencyKey: { customerId, idempotencyKey } };

  // Stock diagnostics and purchase prices must see the same database snapshot.
  // A competing write restarts only the database work, never the bank approval.
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(writeOrder, { isolationLevel: 'RepeatableRead' });
    } catch (error) {
      if (error.code !== 'P2034' || attempt >= 5) throw error;
    }
  }

  async function writeOrder(tx) {
    const customer = await tx.user.findUniqueOrThrow({ where: { id: customerId },
      select: { name: true, email: true, homeAddress: true } });
    const claimed = await tx.order.createMany({ skipDuplicates: true, data: {
      customerId, idempotencyKey, customerName: customer.name, customerEmail: customer.email,
      deliveryAddress: customer.homeAddress, invoiceNumber: 'INV-' + randomUUID(), total: '0.00',
    } });
    if (!claimed.count) {
      const existing = await tx.order.findUniqueOrThrow({ where, include });
      if (existing.items.length !== lines.length || existing.items.some((item, i) =>
        item.productId !== lines[i].productId || item.quantity !== lines[i].quantity)) {
        throw checkoutError('IDEMPOTENCY_KEY_REUSED', 'This payment attempt belongs to a different cart.');
      }
      return existing;
    }

    const orderItems = [];
    const failed = [];
    let total = new Money(0);
    // Lock products in ID order across competing baskets. RETURNING captures the
    // catalog price and name from the exact row whose stock we consumed.
    for (const line of lines) {
      const { productId, quantity } = line;
      const [product] = quantity > 2147483647 ? [] : await tx.product.updateManyAndReturn({
        where: { id: productId, stockQuantity: { gte: quantity } },
        data: { stockQuantity: { decrement: quantity }, salesCount: { increment: quantity } },
        select: { name: true, price: true },
      });
      if (!product) {
        failed.push(line);
        continue;
      }
      const lineTotal = new Money(product.price.toString()).times(quantity);
      total = total.plus(lineTotal);
      orderItems.push({ productId, quantity, name: product.name, unitPrice: product.price, lineTotal: lineTotal.toFixed(2) });
    }
    if (failed.length) {
      const stock = await tx.product.findMany({ where: { id: { in: failed.map(line => line.productId) } },
        select: { id: true, stockQuantity: true } });
      const conflicts = validateCartStock(failed, stock).items.filter(line => line.reason);
      throw checkoutError('STOCK_CONFLICT', 'Some items are no longer available in the requested quantity.', { items: conflicts });
    }
    if (!total.eq(approvedTotal)) {
      throw checkoutError('INVALID_CHECKOUT', 'Catalog total changed since payment approval.');
    }
    return tx.order.update({ where, data: { total: total.toFixed(2), items: { create: orderItems } }, include });
  }
}
