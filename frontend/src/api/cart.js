const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function validateCart(items) {
  const response = await fetch(`${API_BASE_URL}/api/cart/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items.map(({ product, quantity }) => ({ productId: product.id, quantity })) }),
  });
  if (!response.ok) throw new Error('Stock could not be checked. Please try again.');
  const result = await response.json();
  if (typeof result?.valid !== 'boolean' || !Array.isArray(result.items)) {
    throw new Error('Stock could not be checked. Please try again.');
  }
  return result;
}
