CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'SALES_MANAGER', 'PRODUCT_MANAGER', 'SUPPORT_AGENT');

CREATE TABLE "User" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "taxId" VARCHAR(100) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "homeAddress" VARCHAR(1000) NOT NULL,
  "passwordHash" VARCHAR(512) NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_required_text_not_blank" CHECK (
    btrim("name") <> '' AND btrim("taxId") <> '' AND btrim("homeAddress") <> ''
    AND btrim("passwordHash") <> ''
  ),
  CONSTRAINT "User_email_canonical" CHECK (
    "email" = lower(btrim("email")) AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  )
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
