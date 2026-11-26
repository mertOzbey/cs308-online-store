// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCart } from './useCart.js';
import { GUEST_CART_STORAGE_KEY } from '../utils/cartStorage.js';

const product = { id: 1, name: 'Lipstick', stockQuantity: 10 };
function reply(valid, reason = null, availableQuantity = 10) {
  return { ok: true, json: async () => ({ valid, items: [{ productId: 1, availableQuantity, reason }] }) };
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

it('checks the full proposed cart and accumulates repeat additions only after server approval', async () => {
  fetch.mockResolvedValue(reply(true));
  const { result } = renderHook(() => useCart());
  await act(() => result.current.addItem(product));
  await act(() => result.current.addItem(product));
  expect(result.current.count).toBe(2);
  expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual({ items: [{ productId: 1, quantity: 2 }] });
  expect(fetch.mock.lastCall[0]).toBe('/api/cart/validate');
});

it('rejects an addition even when the displayed product still reports stock', async () => {
  fetch.mockResolvedValue(reply(false, 'OUT_OF_STOCK', 0));
  const { result } = renderHook(() => useCart());
  await act(() => result.current.addItem(product));
  expect(result.current.items).toEqual([]);
  expect(result.current.message).toContain('Lipstick is out of stock');
});

it('preserves the accepted quantity after an insufficient-stock response and permits correction', async () => {
  fetch.mockResolvedValueOnce(reply(true)).mockResolvedValueOnce(reply(false, 'INSUFFICIENT_STOCK', 2))
    .mockResolvedValueOnce(reply(true));
  const { result } = renderHook(() => useCart());
  await act(() => result.current.addItem(product));
  await act(() => result.current.updateQuantity(1, 5));
  expect(result.current.count).toBe(1);
  expect(result.current.message).toContain('only 2 available');
  await act(() => result.current.updateQuantity(1, 2));
  expect(result.current.count).toBe(2);
});

it('revalidates existing items when catalog stock changes and allows removal', async () => {
  fetch.mockResolvedValueOnce(reply(true)).mockResolvedValueOnce(reply(false, 'PRODUCT_NOT_FOUND', 0));
  const { result } = renderHook(() => useCart());
  await act(() => result.current.addItem(product));
  await act(() => result.current.checkStock());
  expect(result.current.message).toContain('no longer available');
  expect(result.current.count).toBe(1);
  act(() => result.current.removeItem(1));
  expect(result.current.count).toBe(0);
});

it.each(['network', 'server', 'malformed'])('fails closed for a %s failure', async (failure) => {
  if (failure === 'network') fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  if (failure === 'server') fetch.mockResolvedValue({ ok: false });
  if (failure === 'malformed') fetch.mockResolvedValue({ ok: true, json: async () => ({ valid: 'yes' }) });
  const { result } = renderHook(() => useCart());
  await act(() => result.current.addItem(product));
  expect(result.current.count).toBe(0);
  expect(result.current.busy).toBe(false);
  expect(result.current.message).toContain('Stock could not be checked');
});

it('blocks duplicate clicks and removal while a validation is pending', async () => {
  let finish;
  fetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useCart());
  let pending;
  act(() => {
    pending = result.current.addItem(product);
    result.current.addItem(product);
    result.current.removeItem(1);
  });
  expect(result.current.busy).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => { finish(reply(true)); await pending; });
  expect(result.current.count).toBe(1);
});

it('rejects invalid quantities without contacting the server', () => {
  const { result } = renderHook(() => useCart());
  for (const quantity of [0, -1, 1.5, NaN]) act(() => result.current.updateQuantity(1, quantity));
  expect(fetch).not.toHaveBeenCalled();
  expect(result.current.message).toContain('positive whole number');
});

it('persists an approved cart in localStorage and restores it on remount', async () => {
  fetch.mockResolvedValue(reply(true));
  const first = renderHook(() => useCart());
  await act(() => first.result.current.addItem(product));
  expect(JSON.parse(localStorage.getItem(GUEST_CART_STORAGE_KEY))[0].quantity).toBe(1);
  first.unmount();
  const second = renderHook(() => useCart());
  expect(second.result.current.count).toBe(1);
  expect(second.result.current.items[0].product.name).toBe('Lipstick');
});

it('clears localStorage when the last guest cart item is removed', async () => {
  fetch.mockResolvedValue(reply(true));
  const { result } = renderHook(() => useCart());
  await act(() => result.current.addItem(product));
  act(() => result.current.removeItem(1));
  expect(localStorage.getItem(GUEST_CART_STORAGE_KEY)).toBeNull();
  expect(result.current.count).toBe(0);
});

it('clears the guest cart after a confirmed order without calling the stock API', async () => {
  fetch.mockResolvedValue(reply(true));
  const { result } = renderHook(() => useCart());
  await act(() => result.current.addItem(product));
  act(() => result.current.clearCart());
  expect(result.current.count).toBe(0);
  expect(localStorage.getItem(GUEST_CART_STORAGE_KEY)).toBeNull();
  expect(result.current.message).toContain('successful order');
});

it('can fix two shortages one at a time while retaining warnings for the other item', async () => {
  let available = 5;
  fetch.mockImplementation(async (_url, options) => {
    const items = JSON.parse(options.body).items.map(({ productId, quantity }) => ({ productId,
      requestedQuantity: quantity, availableQuantity: available,
      reason: quantity > available ? 'INSUFFICIENT_STOCK' : null }));
    return { ok: true, json: async () => ({ valid: items.every((item) => !item.reason), items }) };
  });
  const { result } = renderHook(() => useCart());
  await act(() => result.current.addItem(product));
  await act(() => result.current.addItem({ ...product, id: 2, name: 'Mascara' }));
  await act(() => result.current.updateQuantity(1, 5));
  await act(() => result.current.updateQuantity(2, 5));
  available = 2;
  await act(() => result.current.updateQuantity(1, 2));
  expect(result.current.items.map((item) => item.quantity)).toEqual([2, 5]);
  expect(result.current.message).toContain('Mascara: only 2 available');
  await act(() => result.current.updateQuantity(2, 2));
  expect(result.current.items.map((item) => item.quantity)).toEqual([2, 2]);
});
