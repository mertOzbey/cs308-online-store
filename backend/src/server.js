import express from 'express';
import { prisma } from './db.js';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.json({ message: 'CS308 backend is running' });
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: { id: 'asc' },
    });

    res.json(products);
  } catch {
    console.error('Failed to retrieve products.');

    res.status(500).json({
      error: 'Products could not be retrieved.',
    });
  }
});

const server = app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('Shutting down server...');

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('Server stopped.');
    } catch {
      console.error('Failed to close database connections.');
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);