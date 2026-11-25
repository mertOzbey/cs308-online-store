BEGIN;

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('processing', 'in-transit', 'delivered');

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerName" VARCHAR(200) NOT NULL,
    "customerEmail" VARCHAR(254) NOT NULL,
    "deliveryAddress" VARCHAR(1000) NOT NULL,
    "purchasedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'processing',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "total" DECIMAL(24,2) NOT NULL,

    CONSTRAINT "Order_currency_check" CHECK ("currency" = 'TRY'),
    CONSTRAINT "Order_total_check" CHECK ("total" >= 0),
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(24,2) NOT NULL,

    CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "OrderItem_price_check" CHECK ("unitPrice" >= 0),
    CONSTRAINT "OrderItem_lineTotal_check" CHECK ("lineTotal" = "unitPrice" * "quantity"),
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("orderId","productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Order_customerId_purchasedAt_id_idx" ON "Order"("customerId", "purchasedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerId_idempotencyKey_key" ON "Order"("customerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
