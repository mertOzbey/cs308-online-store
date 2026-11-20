import express from 'express';
import { parseCartItems, validateCartStock } from './cartValidation.js';
import { ProductQueryError, parseProductQuery } from './productQuery.js';

export function createApp(prisma) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/', (req, res) => {
    res.json({ message: 'CS308 backend is running' });
  });

  // Optional query parameters: q (keyword), category (id) and sort. See productQuery.js.
  app.get('/api/products', async (req, res) => {
    let args;
    try {
      args = parseProductQuery(req.query);
    } catch (error) {
      if (error instanceof ProductQueryError) return res.status(400).json({ error: error.message });
      throw error;
    }
    try {
      const products = await prisma.product.findMany(args);
      res.json(products);
    } catch {
      console.error('Failed to retrieve products.');
      res.status(500).json({ error: 'Products could not be retrieved.' });
    }
  });

  // Every category, so the search UI can offer filters that are not on the current page.
  app.get('/api/categories', async (req, res) => {
    try {
      const categories = await prisma.category.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      res.json(categories);
    } catch {
      console.error('Failed to retrieve categories.');
      res.status(500).json({ error: 'Categories could not be retrieved.' });
    }
  });

  app.post('/api/cart/validate', async (req, res) => {
    let items;
    try {
      items = parseCartItems(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const ids = items.map((item) => item.productId);
    try {
      const products = ids.length ? await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, stockQuantity: true },
      }) : [];
      return res.json(validateCartStock(items, products));
    } catch {
      console.error('Failed to validate cart stock.');
      return res.status(500).json({ error: 'Stock could not be checked. Please try again.' });
    }
  });

  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    return next(error);
  });
  return app;
}
