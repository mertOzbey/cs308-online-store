import { useEffect, useRef, useState } from 'react';
import { validateCart } from '../api/cart.js';
import { loadGuestCart, saveGuestCart } from '../utils/cartStorage.js';

function stockMessage(result, items) {
  return result.items.filter((item) => item.reason).map((item) => {
    const name = items.find((entry) => entry.product.id === item.productId)?.product.name ?? 'Product';
    if (item.reason === 'PRODUCT_NOT_FOUND') return `${name} is no longer available.`;
    if (item.availableQuantity === 0) return `${name} is out of stock.`;
    return `${name}: only ${item.availableQuantity} available. Reduce the quantity.`;
  }).join(' ');
}

export function useCart() {
  const [items, setItems] = useState(() => loadGuestCart());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // The ref also blocks a second event before React renders the disabled controls.
  const pending = useRef(false);

  useEffect(() => {
    saveGuestCart(items);
  }, [items]);

  async function check(proposedItems, successMessage, save = false, correctionProductId = null) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setMessage('Checking stock…');
    try {
      const result = await validateCart(proposedItems);
      if (!result.valid) {
        // Let users fix one shortage at a time without accepting an invalid target quantity.
        const correctionAccepted = correctionProductId !== null && result.items.some((item) =>
          item.productId === correctionProductId && item.reason === null);
        if (save && correctionAccepted) setItems(proposedItems);
        setMessage(stockMessage(result, proposedItems) || 'Cart stock is unavailable. Please try again.');
        return correctionAccepted;
      }
      if (save) setItems(proposedItems);
      setMessage(successMessage);
      return true;
    } catch {
      setMessage('Stock could not be checked. Please try again.');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function addItem(product) {
    const existing = items.find((item) => item.product.id === product.id);
    const proposed = existing
      ? items.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...items, { product, quantity: 1 }];
    return check(proposed, `${product.name} added to cart.`, true);
  }

  function updateQuantity(productId, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      setMessage('Quantity must be a positive whole number.');
      return false;
    }
    const previousQuantity = items.find((item) => item.product.id === productId)?.quantity;
    return check(items.map((item) => item.product.id === productId ? { ...item, quantity } : item),
      'Cart quantity updated.', true, quantity < previousQuantity ? productId : null);
  }

  function removeItem(productId) {
    if (pending.current) return;
    setItems((current) => current.filter((item) => item.product.id !== productId));
    setMessage('Item removed. Check stock again after changing your cart.');
  }

  function clearCart() {
    if (pending.current) return;
    setItems([]);
    setMessage('Cart cleared after a successful order.');
  }

  return { items, busy, message, addItem, updateQuantity, removeItem, clearCart,
    checkStock: () => check(items, 'All cart items are currently in stock. Stock is not reserved.'),
    count: items.reduce((total, item) => total + item.quantity, 0) };
}
