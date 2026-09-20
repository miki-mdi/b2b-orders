-- Phase 1B: customer profile fields, address phone, price list metadata.
-- All new columns are nullable (or have a safe default), so this is a
-- purely additive, non-destructive migration even though existing rows
-- already exist in Customer/CustomerAddress/PriceList.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "code" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "PriceList" ADD COLUMN     "code" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_code_key" ON "Customer"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_tenantId_code_key" ON "PriceList"("tenantId", "code");
