// Temporary sample data with the same shape as GET /api/products.
// Used while the backend endpoint (SCRUM-71) is not connected yet.
export const sampleProducts = [
  {
    id: 1,
    name: 'Velvet Matte Lipstick',
    model: 'VM-12 Rosewood',
    description: 'Long-wear matte lipstick with a soft, non-drying finish.',
    stockQuantity: 24,
    price: '449.90',
    category: { id: 1, name: 'Makeup' },
  },
  {
    id: 2,
    name: 'Hydrating Face Serum',
    model: 'HS-30 30 ml',
    description: 'Hyaluronic acid serum for daily hydration.',
    stockQuantity: 4,
    price: '899.00',
    category: { id: 2, name: 'Skincare' },
  },
  {
    id: 3,
    name: 'Rose Eau de Parfum',
    model: 'RP-50 50 ml',
    description: 'Floral fragrance with rose and amber notes.',
    stockQuantity: 0,
    price: '2499.00',
    category: { id: 3, name: 'Fragrance' },
  },
];
