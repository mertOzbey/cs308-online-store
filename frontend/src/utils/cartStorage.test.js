// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { GUEST_CART_STORAGE_KEY, loadGuestCart, saveGuestCart } from './cartStorage.js';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

it('saves and loads a guest cart from localStorage', () => {
  const items = [{ product: { id: 1, name: 'Lipstick', price: '25.00' }, quantity: 2 }];
  saveGuestCart(items);
  expect(JSON.parse(localStorage.getItem(GUEST_CART_STORAGE_KEY))).toEqual(items);
  expect(loadGuestCart()).toEqual(items);
});

it('clears storage when the cart is empty', () => {
  saveGuestCart([{ product: { id: 1, name: 'Lipstick' }, quantity: 1 }]);
  saveGuestCart([]);
  expect(localStorage.getItem(GUEST_CART_STORAGE_KEY)).toBeNull();
  expect(loadGuestCart()).toEqual([]);
});

it('ignores corrupt or invalid stored cart data', () => {
  localStorage.setItem(GUEST_CART_STORAGE_KEY, '{not-json');
  expect(loadGuestCart()).toEqual([]);
  localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify([{ product: { id: 'x' }, quantity: 0 }]));
  expect(loadGuestCart()).toEqual([]);
});
