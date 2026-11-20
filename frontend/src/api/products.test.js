import { afterEach, describe, expect, it, vi } from 'vitest';
import { SORT_OPTIONS, buildProductsUrl, fetchCategories, fetchProducts, isSortOption } from './products.js';

afterEach(() => vi.unstubAllGlobals());

describe('buildProductsUrl', () => {
  it('keeps the plain endpoint when there are no filters', () => {
    expect(buildProductsUrl()).toBe('/api/products');
    expect(buildProductsUrl({ q: '   ', category: '' })).toBe('/api/products');
  });

  it('adds trimmed search text and the category id', () => {
    expect(buildProductsUrl({ q: ' red lipstick ', category: '3' }))
      .toBe('/api/products?q=red+lipstick&category=3');
  });

  it('adds the sort after the filters', () => {
    expect(buildProductsUrl({ sort: 'popularity' })).toBe('/api/products?sort=popularity');
    expect(buildProductsUrl({ q: 'mask', category: '2', sort: 'price_asc' }))
      .toBe('/api/products?q=mask&category=2&sort=price_asc');
  });

  it('encodes special characters in the search text', () => {
    expect(buildProductsUrl({ q: '50% & more' })).toBe('/api/products?q=50%25+%26+more');
  });
});

describe('fetchProducts / fetchCategories', () => {
  it('passes filters and the abort signal to fetch', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    await fetchProducts({ q: 'mask', category: '2', signal: controller.signal });
    expect(fetch).toHaveBeenCalledWith('/api/products?q=mask&category=2', { signal: controller.signal });
  });

  it('loads the category list from GET /api/categories', async () => {
    const categories = [{ id: 1, name: 'Makeup' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => categories }));
    await expect(fetchCategories()).resolves.toEqual(categories);
    expect(fetch).toHaveBeenCalledWith('/api/categories', { signal: undefined });
  });

  it('rejects error statuses and non-list bodies', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'bad' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) }));
    await expect(fetchProducts({ category: '1' })).rejects.toThrow(/status 400/);
    await expect(fetchCategories()).rejects.toThrow(/did not return a list/);
  });
});

describe('sort options', () => {
  it('match the values the backend accepts, plus the default order', () => {
    expect(SORT_OPTIONS.map((option) => option.value)).toEqual(['', 'price_asc', 'price_desc', 'popularity']);
    expect(isSortOption('price_desc')).toBe(true);
    expect(isSortOption('')).toBe(true);
    expect(isSortOption('cheapest')).toBe(false);
  });
});
