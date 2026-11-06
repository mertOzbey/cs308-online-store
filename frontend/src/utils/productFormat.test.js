// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatPrice, getStockStatus, LOW_STOCK_LIMIT } from './productFormat.js';

describe('formatPrice', () => {
  it('formats a Prisma Decimal string as Turkish lira', () => {
    expect(formatPrice('1299.50')).toBe('₺1.299,50');
  });

  it('keeps cents exact for large decimal strings', () => {
    expect(formatPrice('12345678901234.99')).toBe('₺12.345.678.901.234,99');
  });

  it('accepts a plain number', () => {
    expect(formatPrice(42)).toBe('₺42,00');
  });

  it('shows a dash when the price is missing', () => {
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice(undefined)).toBe('—');
    expect(formatPrice('')).toBe('—');
  });

  it('shows a dash for a value that is not a number', () => {
    expect(formatPrice('abc')).toBe('—');
  });
});

describe('getStockStatus', () => {
  it('marks zero stock as out of stock and blocks the cart', () => {
    expect(getStockStatus(0)).toEqual({
      level: 'out',
      label: 'Out of stock',
      canAddToCart: false,
    });
  });

  it('treats negative or missing stock as out of stock', () => {
    expect(getStockStatus(-3).canAddToCart).toBe(false);
    expect(getStockStatus(undefined).level).toBe('out');
  });

  it('warns when stock is at the low-stock limit', () => {
    const status = getStockStatus(LOW_STOCK_LIMIT);
    expect(status.level).toBe('low');
    expect(status.label).toBe(`Only ${LOW_STOCK_LIMIT} left`);
    expect(status.canAddToCart).toBe(true);
  });

  it('shows the quantity when stock is healthy', () => {
    expect(getStockStatus(LOW_STOCK_LIMIT + 1)).toEqual({
      level: 'in',
      label: `${LOW_STOCK_LIMIT + 1} in stock`,
      canAddToCart: true,
    });
  });
});
