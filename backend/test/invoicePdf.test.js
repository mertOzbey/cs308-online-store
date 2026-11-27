import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createInvoiceDocuments, loadInvoiceDocuments } from '../src/invoicePdf.js';

function orderSnapshot(overrides = {}) {
  return {
    id: 7001,
    customerId: 42,
    invoiceNumber: 'INV-7001',
    purchasedAt: new Date('2026-11-25T12:00:00Z'),
    currency: 'TRY',
    total: '10.005',
    customerName: 'Çağla Şahin',
    customerEmail: 'cagla@example.test',
    deliveryAddress: 'Çiçek Sokak 7, Üsküdar / İstanbul',
    items: [{ productId: 101, name: 'Güneş Kremi', quantity: 1,
      unitPrice: '10.005', lineTotal: '10.005' }],
    ...overrides,
  };
}

async function readPdf(buffer) {
  const loading = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false });
  const pdf = await loading.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  const result = { pages: pdf.numPages, text: pages.join('\n') };
  await loading.destroy();
  return result;
}

test('screen and PDF consume the same rounded values and preserve Turkish text', async () => {
  const { screen, pdf } = await createInvoiceDocuments(orderSnapshot());
  const parsed = await readPdf(pdf);
  assert.equal(screen.total, '10.01');
  assert.equal(screen.items[0].unitPrice, '10.01');
  assert.match(pdf.subarray(0, 8).toString(), /^%PDF-/);
  assert.equal(parsed.pages, 1);
  for (const value of ['Çağla Şahin', 'Çiçek Sokak', 'Üsküdar', 'İstanbul', 'Güneş Kremi', '10.01 TRY']) {
    assert.match(parsed.text, new RegExp(value));
  }
});

test('a later catalog price change leaves the PDF and screen total unchanged', async () => {
  const stored = orderSnapshot({ total: '290.90', items: [{ productId: 101, name: 'Güneş Kremi',
    quantity: 2, unitPrice: '125.50', lineTotal: '251.00' }, { productId: 202, name: 'Tonik',
    quantity: 1, unitPrice: '39.90', lineTotal: '39.90' }] });
  let catalogPrice = '125.50';
  let catalogReads = 0;
  const db = {
    order: { findFirst: async () => structuredClone(stored) },
    product: { findUnique: async () => { catalogReads += 1; return { price: catalogPrice }; } },
  };
  const before = await loadInvoiceDocuments(db, { customerId: 42, orderId: 7001 });
  catalogPrice = '999.99';
  const after = await loadInvoiceDocuments(db, { customerId: 42, orderId: 7001 });
  const beforeText = await readPdf(before.pdf);
  const afterText = await readPdf(after.pdf);
  assert.deepEqual(after.screen, before.screen);
  assert.equal(after.screen.total, '290.90');
  assert.match(beforeText.text, /290.90 TRY/);
  assert.match(afterText.text, /290.90 TRY/);
  assert.equal(afterText.text.includes(catalogPrice), false);
  assert.equal(catalogReads, 0);
});

test('the persisted invoice number stays stable across PDF reads', async () => {
  const order = orderSnapshot({ invoiceNumber: 'INV-stable-93' });
  const first = await createInvoiceDocuments(order);
  const second = await createInvoiceDocuments(order);
  assert.equal(first.screen.invoiceNumber, second.screen.invoiceNumber);
  assert.match((await readPdf(first.pdf)).text, /INV-stable-93/);
  assert.match((await readPdf(second.pdf)).text, /INV-stable-93/);
});
