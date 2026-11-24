/** Guest cart persistence for SCRUM-82 / SCRUM-83. */
export const GUEST_CART_STORAGE_KEY = 'sulina.guestCart';

function isValidCartItem(entry) {
  return entry
    && typeof entry === 'object'
    && entry.product
    && typeof entry.product === 'object'
    && Number.isSafeInteger(entry.product.id)
    && Number.isSafeInteger(entry.quantity)
    && entry.quantity >= 1;
}

export function loadGuestCart() {
  try {
    const raw = localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCartItem);
  } catch {
    return [];
  }
}

export function saveGuestCart(items) {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      localStorage.removeItem(GUEST_CART_STORAGE_KEY);
      return;
    }
    localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota / private-mode failures; in-memory cart still works.
  }
}
