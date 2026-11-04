import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

export function createDatabaseClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }, {
      schema: url.searchParams.get('schema') ?? 'public',
    }),
  });
}

// Import this shared instance in the backend instead of opening a pool per request.
export const prisma = createDatabaseClient();
