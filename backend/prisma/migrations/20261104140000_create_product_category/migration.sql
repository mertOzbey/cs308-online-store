-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(12,2) NOT NULL,
    "warrantyStatus" TEXT NOT NULL,
    "distributorInformation" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_serialNumber_key" ON "Product"("serialNumber");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints in schema.prisma. Keep these in migration history.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_stockQuantity_nonnegative" CHECK ("stockQuantity" >= 0),
  ADD CONSTRAINT "Product_price_nonnegative" CHECK ("price" >= 0),
  ADD CONSTRAINT "Product_required_text_not_blank" CHECK (
    btrim("name") <> '' AND btrim("model") <> '' AND btrim("serialNumber") <> ''
    AND btrim("description") <> '' AND btrim("warrantyStatus") <> ''
    AND btrim("distributorInformation") <> ''
  );

ALTER TABLE "Category"
  ADD CONSTRAINT "Category_name_not_blank" CHECK (btrim("name") <> '');
