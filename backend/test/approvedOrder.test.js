import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { useTestDatabase } from './helpers/testDatabase.js';
import { confirmApprovedOrder } from '../src/approvedOrder.js';

import { createMockPaymentService } from '../src/mockPaymentService.js';
import { createMockBankAdapter } from '../src/mockBankAdapter.js';

const { db } = useTestDatabase();

function approval(amount) {
  return { payment: { status: 'approved' }, quote: { currency: 'TRY', amount } };
}

async function customer() {
  return db.user.create({ data: { name: 'Buyer', email: randomUUID() + '@example.test',
    taxId: 'fixture', passwordHash: 'fixture', homeAddress: 'Demo street' } });
}

async function product(stockQuantity) {
  return db.product.create({ data: { name: 'Lamp', price: '12.34', stockQuantity, model: 'L',
    serialNumber: randomUUID(), warrantyStatus: 'standard', description: 'Desk lamp',
    distributorInformation: 'Demo', category: { create: { name: randomUUID() } } } });
}

async function counts(id) {
  return db.product.findUniqueOrThrow({ where: { id }, select: { stockQuantity: true, salesCount: true } });
}

test('two customers competing for the last unit create one order', async () => {
  const buyers = await Promise.all([customer(), customer()]);
  const lamp = await product(1);
  const results = await Promise.allSettled(buyers.map(buyer => confirmApprovedOrder(db, {
    customerId: buyer.id, idempotencyKey: randomUUID(), ...approval('12.34'), items: [{ productId: lamp.id, quantity: 1 }],
  })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const error = results.find(r => r.status === 'rejected').reason;
  assert.equal(error.code, 'STOCK_CONFLICT');
  assert.deepEqual(error.items, [{ productId: lamp.id, requestedQuantity: 1, availableQuantity: 0, reason: 'OUT_OF_STOCK' }]);
  assert.equal(await db.order.count({ where: { items: { some: { productId: lamp.id } } } }), 1);
  assert.deepEqual(await counts(lamp.id), { stockQuantity: 0, salesCount: 1 });
});

test('a failed line rolls back the order and all inventory changes', async () => {
  const buyer = await customer();
  const first = await product(5);
  const last = await product(1);
  await assert.rejects(confirmApprovedOrder(db, { customerId: buyer.id, idempotencyKey: randomUUID(), ...approval('49.36'),
    items: [first, last].map(p => ({ productId: p.id, quantity: 2 })) }), { code: 'STOCK_CONFLICT' });
  assert.deepEqual(await counts(first.id), { stockQuantity: 5, salesCount: 0 });
  assert.deepEqual(await counts(last.id), { stockQuantity: 1, salesCount: 0 });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 0);
});

test('concurrent duplicates and later retries return the purchase snapshot once', async () => {
  const buyer = await customer();
  const lamp = await product(2);
  const line = { productId: lamp.id, quantity: 1 };
  const request = { customerId: buyer.id, idempotencyKey: randomUUID(), ...approval('24.68'), items: [line, line] };
  const [a, b] = await Promise.all([confirmApprovedOrder(db, request), confirmApprovedOrder(db, request)]);
  assert.deepEqual(a, b);
  assert.equal(a.status, 'processing');
  assert.equal(a.customerName, buyer.name);
  assert.equal(a.deliveryAddress, buyer.homeAddress);
  assert.equal(a.total.toFixed(2), '24.68');
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0].quantity, 2);
  assert.equal(a.items[0].unitPrice.toFixed(2), '12.34');
  await db.product.update({ where: { id: lamp.id }, data: { price: '99.99', name: 'Updated lamp' } });
  assert.deepEqual(await confirmApprovedOrder(db, { ...request, items: [{ ...line, quantity: 2 }] }), a);
  await assert.rejects(confirmApprovedOrder(db, { ...request, items: [line] }), { code: 'IDEMPOTENCY_KEY_REUSED' });
  assert.deepEqual(await counts(lamp.id), { stockQuantity: 0, salesCount: 2 });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 1);
});

test('a catalog price change after bank approval rolls the purchase back', async () => {
  const buyer = await customer();
  const lamp = await product(2);
  await assert.rejects(confirmApprovedOrder(db, { customerId: buyer.id, idempotencyKey: randomUUID(),
    ...approval('10.00'), items: [{ productId: lamp.id, quantity: 1 }] }), { code: 'INVALID_CHECKOUT' });
  assert.deepEqual(await counts(lamp.id), { stockQuantity: 2, salesCount: 0 });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 0);
});

test('SCRUM-88 bank results feed the order service directly', async () => {
  const buyer = await customer();
  const lamp = await product(5);
  const service = createMockPaymentService({ prisma: db, bank: createMockBankAdapter() });
  async function confirm(paymentToken) {
    const idempotencyKey = randomUUID();
    const result = await service.authorize(buyer.id, { idempotencyKey, paymentToken,
      items: [{ productId: lamp.id, quantity: 2 }] });
    return confirmApprovedOrder(db, { customerId: buyer.id, idempotencyKey, ...result });
  }
  await assert.rejects(confirm('mock_decline'), { code: 'PAYMENT_DECLINED' });
  assert.equal(await db.order.count({ where: { customerId: buyer.id } }), 0);
  assert.deepEqual(await counts(lamp.id), { stockQuantity: 5, salesCount: 0 });
  const order = await confirm('mock_approve');
  assert.equal(order.total.toFixed(2), '24.68');
  assert.deepEqual(await counts(lamp.id), { stockQuantity: 3, salesCount: 2 });
});
