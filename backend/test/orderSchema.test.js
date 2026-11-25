import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { useTestDatabase } from './helpers/testDatabase.js';

const { db } = useTestDatabase();
const fixture = JSON.parse(readFileSync(new URL('../../docs/contracts/checkout/v1/examples.json', import.meta.url)));
const { request, response } = fixture.cases.approved;
const expected = response.body.order;
const buyer = fixture.invoiceCustomer;

test('approved checkout survives catalog and profile changes and isolates customer retries', async () => {
  const account = { id: expected.customerId, name: buyer.name, email: buyer.email,
    homeAddress: buyer.deliveryAddress, taxId: '001', passwordHash: 'fixture-only' };
  const customer = await db.user.create({ data: account });
  const category = await db.category.create({ data: { name: 'Office' } });
  const items = [];
  for (const entry of request.items) {
    const sample = expected.items.find(item => item.productId === entry.productId);
    const product = await db.product.create({ data: { id: entry.productId, name: sample.name,
      price: sample.unitPrice, categoryId: category.id, model: 'Fixture', serialNumber: String(entry.productId),
      description: 'Office supply', warrantyStatus: 'Standard', distributorInformation: 'Demo' } });
    items.push({ ...entry, name: product.name, unitPrice: product.price, lineTotal: product.price.times(entry.quantity) });
  }
  const data = { customerId: customer.id, customerName: customer.name, customerEmail: customer.email,
    deliveryAddress: customer.homeAddress, idempotencyKey: request.idempotencyKey,
    invoiceNumber: expected.invoiceNumber, purchasedAt: new Date(expected.purchasedAt),
    total: items[0].lineTotal.plus(items[1].lineTotal), items: { create: items } };
  const order = await db.order.create({ data: { ...data, id: expected.orderId } });
  await db.product.update({ where: { id: items[0].productId }, data: { price: '999.99', name: 'New name' } });
  await db.user.update({ where: { id: customer.id }, data: { homeAddress: 'New address' } });

  await assert.rejects(db.order.create({ data: { ...data, invoiceNumber: 'INV-duplicate' } }), { code: 'P2002' });
  const other = await db.user.create({ data: { ...account, id: customer.id + 1, email: 'other@example.test' } });
  await db.order.create({ data: { ...data, customerId: other.id, invoiceNumber: 'INV-other' } });
  const history = await db.order.findMany({ where: { customerId: customer.id },
    orderBy: [{ purchasedAt: 'desc' }, { id: 'desc' }], include: { items: { orderBy: { productId: 'asc' } } } });
  assert.equal(history.length, 1);
  const [stored] = history;
  assert.deepEqual({ name: stored.customerName, email: stored.customerEmail, deliveryAddress: stored.deliveryAddress }, buyer);
  assert.deepEqual({ orderId: stored.id, customerId: stored.customerId, purchasedAt: stored.purchasedAt.toISOString(),
    status: stored.status, currency: stored.currency, invoiceNumber: stored.invoiceNumber, total: stored.total.toFixed(2),
    items: stored.items.map(({ productId, name, quantity, unitPrice, lineTotal }) =>
      ({ productId, name, quantity, unitPrice: unitPrice.toFixed(2), lineTotal: lineTotal.toFixed(2) })) },
    { ...expected, purchasedAt: new Date(expected.purchasedAt).toISOString() });
  await assert.rejects(db.orderItem.update({ where: { orderId_productId: { orderId: order.id, productId: items[0].productId } },
    data: { quantity: 0, lineTotal: 0 } }));
});
