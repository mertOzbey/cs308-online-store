// Validate against current catalog stock; this does not reserve inventory.
export function parseCartItems(body) {
  if (!body || !Array.isArray(body.items) || body.items.length > 100) {
    throw new Error('items must be an array with at most 100 entries.');
  }
  const quantities = new Map();
  for (const item of body.items) {
    if (!item || !Number.isSafeInteger(item.productId) || item.productId <= 0 || item.productId > 2147483647 ||
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Each item requires a positive integer productId and quantity.');
    }
    const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) throw new Error('Item quantity is too large.');
    quantities.set(item.productId, quantity);
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export function validateCartStock(items, products) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const results = items.map(({ productId, quantity }) => {
    const product = byId.get(productId);
    const availableQuantity = product?.stockQuantity ?? 0;
    const reason = !product ? 'PRODUCT_NOT_FOUND'
      : availableQuantity === 0 ? 'OUT_OF_STOCK'
        : quantity > availableQuantity ? 'INSUFFICIENT_STOCK' : null;
    return { productId, requestedQuantity: quantity, availableQuantity, reason };
  });
  return { valid: results.every((item) => item.reason === null), items: results };
}
