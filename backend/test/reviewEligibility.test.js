import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { useTestDatabase } from './helpers/testDatabase.js';
import { canReviewProduct } from '../src/reviewEligibility.js';

const { db } = useTestDatabase();
async function fixtures() {
  const category = await db.category.create({ data: { name: randomUUID() } });
  const [owner, other] = await Promise.all(['Owner', 'Other'].map(name => db.user.create({ data: {
    name, email: randomUUID() + '@example.test', passwordHash: 'fixture', taxId: name, homeAddress: 'Demo street',
  } })));
  const [lamp, book] = await Promise.all(['Lamp', 'Book'].map(name => db.product.create({ data: {
    name, price: '10.00', serialNumber: randomUUID(), model: name, categoryId: category.id,
    distributorInformation: 'Demo', description: name, warrantyStatus: 'Standard',
  } })));
  return { owner, other, lamp, book };
}

async function order(customer, product, status) {
  return db.order.create({ data: {
    customerId: customer.id, customerName: customer.name, customerEmail: customer.email,
    deliveryAddress: customer.homeAddress, invoiceNumber: randomUUID(), idempotencyKey: randomUUID(),
    total: '10.00', status, items: { create: { productId: product.id, name: product.name,
      unitPrice: '10.00', quantity: 1, lineTotal: '10.00' } },
  } });
}

test('eligibility requires owner, product and delivered status on the same purchase', async () => {
  const { owner, other, lamp, book } = await fixtures();
  await order(other, book, 'delivered');
  const purchase = await order(owner, lamp, 'processing');
  assert.equal(await canReviewProduct(db, owner.id, lamp.id), false);
  await db.order.update({ where: { id: purchase.id }, data: { status: 'in_transit' } });
  assert.equal(await canReviewProduct(db, owner.id, lamp.id), false);
  await db.order.update({ where: { id: purchase.id }, data: { status: 'delivered' } });
  assert.equal(await canReviewProduct(db, owner.id, lamp.id), true);
  assert.equal(await canReviewProduct(db, other.id, lamp.id), false);
  assert.equal(await canReviewProduct(db, owner.id, book.id), false);
  assert.equal(await canReviewProduct(db, other.id, book.id), true);
});

test('ratings and moderated comments can be stored independently', async () => {
  const { owner, lamp } = await fixtures();
  const pair = { customerId: owner.id, productId: lamp.id };
  for (const value of [0, 6]) {
    await assert.rejects(db.rating.create({ data: { ...pair, value } }));
  }
  const rating = await db.rating.create({ data: { ...pair, value: 1 } });
  await db.rating.update({ where: { id: rating.id }, data: { value: 5 } });
  const comment = await db.comment.create({ data: { ...pair, text: 'Works well' } });
  assert.equal(comment.status, 'pending');
  assert.equal(await db.comment.count({ where: { ...pair, status: 'approved' } }), 0);
  assert.equal((await db.rating.aggregate({ where: pair, _avg: { value: true } }))._avg.value, 5);
});
