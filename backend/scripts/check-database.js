import { prisma } from '../src/db.js';

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('PostgreSQL connection successful.');
} catch {
  // Do not expose connection credentials in console output.
  console.error('Database connection failed. Check DATABASE_URL and PostgreSQL availability.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
