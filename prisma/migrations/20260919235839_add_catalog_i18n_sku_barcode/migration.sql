-- Phase 1A: MK/EN name fields on Category/Product, MK/EN label fields on
-- UnitOfMeasure, isActive on Category/UnitOfMeasure, product-level sku,
-- optional barcode on Product and ProductUnit. See docs/DATABASE_DESIGN.md
-- and prisma/schema.prisma's inline comments for the field-by-field rationale.
-- Generated via `prisma migrate diff` (non-interactive) against the freshly
-- reset dev database, then applied via `prisma migrate deploy` - see the
-- Phase 1A report for why `migrate dev` itself couldn't be used here.

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "name",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nameEn" TEXT NOT NULL,
ADD COLUMN     "nameMk" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "name",
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "nameEn" TEXT NOT NULL,
ADD COLUMN     "nameMk" TEXT NOT NULL,
ADD COLUMN     "sku" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ProductUnit" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "UnitOfMeasure" DROP COLUMN "label",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "labelEn" TEXT NOT NULL,
ADD COLUMN     "labelMk" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");
