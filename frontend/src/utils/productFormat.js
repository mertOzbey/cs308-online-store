// Display helpers for product data coming from GET /api/products.

const priceFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

// The backend stores price as a Prisma Decimal, which arrives in JSON as a
// string such as "1299.50". Intl.NumberFormat formats decimal strings exactly,
// so we never turn money into a floating-point number.
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function formatPrice(price) {
  if (price === null || price === undefined) return '—';
  const value = String(price).trim();
  if (!DECIMAL_PATTERN.test(value)) return '—';
  return priceFormatter.format(value);
}

export const LOW_STOCK_LIMIT = 5;

// Requirement 3: the number of items in stock must be shown.
// Requirement 7: out-of-stock products stay visible but cannot go to the cart.
export function getStockStatus(stockQuantity) {
  const quantity = Number.isInteger(stockQuantity) ? stockQuantity : 0;

  if (quantity <= 0) {
    return { level: 'out', label: 'Out of stock', canAddToCart: false };
  }
  if (quantity <= LOW_STOCK_LIMIT) {
    return { level: 'low', label: `Only ${quantity} left`, canAddToCart: true };
  }
  return { level: 'in', label: `${quantity} in stock`, canAddToCart: true };
}
