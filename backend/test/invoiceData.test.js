import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createInvoiceData, formatInvoiceMoney, loadInvoiceData } from '../src/invoiceData.js';

const fixture = JSON.parse(await readFile(
  new URL('../../docs/contracts/checkout/v1/examples.json', import.meta.url), 'utf8',
));

function orderSnapshot(overrides = {}) {
  const expected = fixture.cases.approved.response.body.order;
  return {
    id: expected.orderId,
    customerId: expected.customerId,
    invoiceNumber: expected.invoiceNumber,
    purchasedAt: new Date(expected.purchasedAt),
    currency: expected.currency,
    total: expected.total,
    customerName: 'Çağla Şahin',
    customerEmail: 'cagla@example.test',
    deliveryAddress: 'Çiçek Sokak 7, Üsküdar / İstanbul',
    items: expected.items.map((item) => ({ ...item })),
    ...overrides,
  };
}

test('the v1 purchase snapshot becomes the shared screen and PDF invoice data', () => {
  const invoice = createInvoiceData(orderSnapshot());
  assert.deepEqual(invoice, {
    invoiceNumber: 'INV-7001',
    orderId: 7001,
    customerId: 42,
    purchasedAt: '2026-11-25T12:00:00.000Z',
    currency: 'TRY',
    customer: {
      name: 'Çağla Şahin',
      email: 'cagla@example.test',
      deliveryAddress: 'Çiçek Sokak 7, Üsküdar / İstanbul',
    },
    items: fixture.cases.approved.response.body.order.items,
    total: '290.90',
  });
});

test('invoice money uses exact half-up rounding without binary floating point', () => {
  assert.equal(formatInvoiceMoney('10.0049'), '10.00');
  assert.equal(formatInvoiceMoney('10.005'), '10.01');
  assert.equal(formatInvoiceMoney('9999999999999999999999.995'), '10000000000000000000000.00');
});

test('a later catalog price change cannot change the screen invoice', async () => {
  const stored = orderSnapshot();
  let catalogPrice = '125.50';
  let catalogReads = 0;
  let query;
  const db = {
    order: { findFirst: async (args) => { query = args; return structuredClone(stored); } },
    product: { findUnique: async () => { catalogReads += 1; return { price: catalogPrice }; } },
  };
  const before = await loadInvoiceData(db, { customerId: 42, orderId: 7001 });
  catalogPrice = '999.99';
  const after = await loadInvoiceData(db, { customerId: 42, orderId: 7001 });
  assert.deepEqual(after, before);
  assert.equal(after.total, '290.90');
  assert.equal(catalogReads, 0);
  assert.deepEqual(query, {
    where: { id: 7001, customerId: 42 },
    include: { items: { orderBy: { productId: 'asc' } } },
  });
});

test('the persisted invoice number stays stable across data reads', () => {
  const order = orderSnapshot({ invoiceNumber: 'INV-stable-93' });
  const first = createInvoiceData(order);
  const second = createInvoiceData(order);
  assert.equal(first.invoiceNumber, 'INV-stable-93');
  assert.equal(second.invoiceNumber, first.invoiceNumber);
});
