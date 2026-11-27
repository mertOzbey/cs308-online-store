// Pass the authenticated customer's ID. A transaction client is supported for review writes.
export async function canReviewProduct(db, customerId, productId) {
  if (![customerId, productId].every(id => Number.isInteger(id) && id > 0 && id <= 2147483647)) {
    return false;
  }
  const match = await db.orderItem.findFirst({
    where: { productId, order: { customerId, status: 'delivered' } },
    select: { orderId: true },
  });
  return match !== null;
}
