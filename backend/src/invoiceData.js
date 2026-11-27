const decimalPattern = /^(\d+)(?:\.(\d+))?$/;

export class InvoiceDataError extends Error {
  constructor(message, code = 'INVALID_INVOICE_DATA') {
    super(message);
    this.name = 'InvoiceDataError';
    this.code = code;
  }
}

// Format base-10 values exactly. Avoid Number so large totals and .005 boundaries
// cannot differ between the screen DTO and the PDF.
export function formatInvoiceMoney(value) {
  const text = typeof value === 'string' ? value : value?.toString?.();
  const match = typeof text === 'string' ? decimalPattern.exec(text.trim()) : null;
  if (!match) throw new InvoiceDataError('Invoice money must be a nonnegative base-10 value.');

  const [, whole, fraction = ''] = match;
  let minorUnits = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (fraction.length > 2 && fraction[2] >= '5') minorUnits += 1n;
  const digits = minorUnits.toString().padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvoiceDataError(`${field} must be a positive integer.`);
  }
  return value;
}

function requiredText(value, field, maximum = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new InvoiceDataError(`${field} is required.`);
  }
  return value;
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new InvoiceDataError('purchasedAt must be a valid date.');
  return date.toISOString();
}

function invoiceCurrency(value) {
  if (value !== 'TRY') throw new InvoiceDataError('Invoice currency must be TRY.');
  return value;
}

// This is the single presentation boundary for both the screen API and PDF.
// It reads only purchase-time snapshots from Order and OrderItem, never Product.
export function createInvoiceData(order) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) {
    throw new InvoiceDataError('A persisted order snapshot is required.');
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new InvoiceDataError('An invoice requires at least one purchased item.');
  }

  const items = order.items.map((item) => ({
    productId: positiveInteger(item.productId, 'item.productId'),
    name: requiredText(item.name, 'item.name'),
    quantity: positiveInteger(item.quantity, 'item.quantity'),
    unitPrice: formatInvoiceMoney(item.unitPrice),
    lineTotal: formatInvoiceMoney(item.lineTotal),
  })).sort((left, right) => left.productId - right.productId);

  return {
    invoiceNumber: requiredText(order.invoiceNumber, 'invoiceNumber', 100),
    orderId: positiveInteger(order.id, 'orderId'),
    customerId: positiveInteger(order.customerId, 'customerId'),
    purchasedAt: isoDate(order.purchasedAt),
    currency: invoiceCurrency(order.currency),
    customer: {
      name: requiredText(order.customerName, 'customer.name', 200),
      email: requiredText(order.customerEmail, 'customer.email', 254),
      deliveryAddress: requiredText(order.deliveryAddress, 'customer.deliveryAddress'),
    },
    items,
    total: formatInvoiceMoney(order.total),
  };
}

export const invoiceOrderInclude = Object.freeze({
  items: Object.freeze({ orderBy: Object.freeze({ productId: 'asc' }) }),
});

export async function loadInvoiceData(db, { customerId, orderId }) {
  positiveInteger(customerId, 'customerId');
  positiveInteger(orderId, 'orderId');
  const order = await db.order.findFirst({
    where: { id: orderId, customerId },
    include: invoiceOrderInclude,
  });
  if (!order) throw new InvoiceDataError('Invoice not found.', 'INVOICE_NOT_FOUND');
  return createInvoiceData(order);
}
