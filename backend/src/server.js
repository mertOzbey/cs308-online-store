import { createApp } from './app.js';
import { prisma } from './db.js';

const app = createApp(prisma);
const port = 3000;

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
