-- AlterTable
ALTER TABLE "Product" ADD COLUMN "salesCount" INTEGER NOT NULL DEFAULT 0;

-- Prisma cannot express CHECK constraints in schema.prisma. Keep these in migration history.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_salesCount_nonnegative" CHECK ("salesCount" >= 0);
