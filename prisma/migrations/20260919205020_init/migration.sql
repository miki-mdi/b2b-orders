-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CutOffEnforcement" AS ENUM ('SOFT_WARNING', 'HARD_BLOCK');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('SELLER_ADMIN', 'SALES_REP', 'WAREHOUSE_WORKER', 'DELIVERY_DRIVER');

-- CreateEnum
CREATE TYPE "CustomerRole" AS ENUM ('BUYER_ADMIN', 'BUYER_EMPLOYEE');

-- CreateEnum
CREATE TYPE "ProductVisibility" AS ENUM ('HIDDEN', 'VISIBLE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'CANCELLED', 'PICKING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('BUYER', 'SELLER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActingContext" AS ENUM ('TENANT', 'CUSTOMER', 'PLATFORM_ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'mk',
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "CustomerRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'MKD',
    "defaultVatRate" DECIMAL(5,2) NOT NULL,
    "cutOffTime" TEXT,
    "cutOffEnforcement" "CutOffEnforcement" NOT NULL DEFAULT 'SOFT_WARNING',
    "locale" TEXT NOT NULL DEFAULT 'mk',
    "subscriptionPlan" TEXT,
    "subscriptionStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentCategoryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "defaultVatRate" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "conversionFactorToBase" DECIMAL(12,4),
    "minOrderQty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "orderIncrement" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MKD',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productUnitId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "discountPercent" DECIMAL(5,2),
    "creditLimit" DECIMAL(14,2),
    "paymentTermsDays" INTEGER,
    "allowedDeliveryDays" INTEGER[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'MK',
    "isDefaultDelivery" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultBilling" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPriceListAssignment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPriceListAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProductVisibility" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "visibility" "ProductVisibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProductVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteList" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FavoriteList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteListItem" (
    "id" TEXT NOT NULL,
    "favoriteListId" TEXT NOT NULL,
    "productUnitId" TEXT NOT NULL,
    "defaultQty" DECIMAL(12,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryDays" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "placedByUserId" TEXT NOT NULL,
    "placedByName" TEXT NOT NULL,
    "placedByRole" TEXT NOT NULL,
    "deliveryAddressId" TEXT,
    "deliveryAddressSnapshot" JSONB,
    "requestedDeliveryDate" TIMESTAMP(3),
    "cutOffWarningShown" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "cancelledBy" "CancelledBy",
    "cancelReason" TEXT,
    "deliveredWithIssues" BOOLEAN NOT NULL DEFAULT false,
    "deliveredWithIssuesNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productUnitId" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "productSkuSnapshot" TEXT NOT NULL,
    "unitLabelSnapshot" TEXT NOT NULL,
    "requestedQty" DECIMAL(12,3) NOT NULL,
    "confirmedQty" DECIMAL(12,3),
    "deliveredQty" DECIMAL(12,3),
    "unavailableReason" TEXT,
    "unitPriceAtOrderTime" DECIMAL(12,2) NOT NULL,
    "discountPercentAtOrderTime" DECIMAL(5,2),
    "vatRateAtOrderTime" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actingContext" "ActingContext" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_isActive_idx" ON "TenantMembership"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_key" ON "TenantMembership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "CustomerMembership_tenantId_customerId_isActive_idx" ON "CustomerMembership"("tenantId", "customerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMembership_userId_customerId_key" ON "CustomerMembership"("userId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Category_tenantId_idx" ON "Category"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_tenantId_code_key" ON "UnitOfMeasure"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "ProductUnit_productId_idx" ON "ProductUnit"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnit_tenantId_sku_key" ON "ProductUnit"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "PriceList_tenantId_idx" ON "PriceList"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceListId_productUnitId_key" ON "PriceListItem"("priceListId", "productUnitId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_isActive_idx" ON "CustomerAddress"("customerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPriceListAssignment_customerId_key" ON "CustomerPriceListAssignment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProductVisibility_customerId_productId_key" ON "CustomerProductVisibility"("customerId", "productId");

-- CreateIndex
CREATE INDEX "FavoriteList_customerId_idx" ON "FavoriteList"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteListItem_favoriteListId_productUnitId_key" ON "FavoriteListItem"("favoriteListId", "productUnitId");

-- CreateIndex
CREATE INDEX "DeliveryRoute_tenantId_idx" ON "DeliveryRoute"("tenantId");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Order_tenantId_customerId_idx" ON "Order"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_orderNumber_key" ON "Order"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_tenantId_entityType_entityId_idx" ON "AuditLogEntry"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_tenantId_createdAt_idx" ON "AuditLogEntry"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceListAssignment" ADD CONSTRAINT "CustomerPriceListAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPriceListAssignment" ADD CONSTRAINT "CustomerPriceListAssignment_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductVisibility" ADD CONSTRAINT "CustomerProductVisibility_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductVisibility" ADD CONSTRAINT "CustomerProductVisibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteList" ADD CONSTRAINT "FavoriteList_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteList" ADD CONSTRAINT "FavoriteList_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteListItem" ADD CONSTRAINT "FavoriteListItem_favoriteListId_fkey" FOREIGN KEY ("favoriteListId") REFERENCES "FavoriteList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteListItem" ADD CONSTRAINT "FavoriteListItem_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_placedByUserId_fkey" FOREIGN KEY ("placedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "CustomerAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Row-Level Security (see prisma/rls/policies.sql - this is that file, embedded)
-- ============================================================================

-- Row-Level Security policies for tenant AND customer isolation (Layer 3).
-- See docs/SECURITY_AND_MULTI_TENANCY.md §2-3 for the full design rationale,
-- and src/lib/db/tenant-scoped-models.ts for the matching Layer 2 (app-level) design.
--
-- This file is the readable source of truth. Its content is embedded
-- verbatim into the initial Prisma migration (prisma/migrations/<ts>_init/migration.sql)
-- so it is applied automatically by `prisma migrate deploy` / `prisma migrate dev`
-- alongside table creation - see prisma/rls/README.md for exactly how, and why
-- it is NOT expressed via Prisma schema (Prisma has no native RLS support).
--
-- Two session variables, two tiers of isolation:
--   app.current_tenant_id   - REQUIRED for every scoped table. Seller A vs Seller B.
--   app.current_customer_id - OPTIONAL. Set only for a buyer session; narrows
--                             the subset of tables a buyer touches down to
--                             their own company, so Buyer A can never read
--                             Buyer B's rows even though both share a tenantId.
--
-- Convention: every check uses current_setting(<name>, true), where the
-- `true` (missing_ok) argument returns NULL instead of raising an error when
-- the setting hasn't been set for the current transaction. A NULL comparison
-- is never true, so a missing tenant context yields ZERO visible/writable
-- rows rather than an error or an unscoped result - the database-level half
-- of "missing tenant context fails safely" (the application-level half is
-- requireTenantId()/requireCustomerId() in src/lib/db/tenant-context.ts,
-- which throw before a query is ever sent).
--
-- No ::uuid casts: Prisma's `String @id @default(uuid())` generates TEXT
-- columns, not Postgres's native `uuid` type (client-side ID generation,
-- not a DB-level DEFAULT). An earlier version of this file cast the session
-- variable to ::uuid and failed to apply with "operator does not exist:
-- text = uuid" - comparisons here are plain text equality throughout.
--
-- FORCE ROW LEVEL SECURITY matters here specifically because the app
-- connects as a dedicated low-privilege role (see prisma/rls/README.md) that
-- does NOT own these tables - RLS already applies to non-owners by default.
-- FORCE is added anyway as defense in depth. It does not protect against a
-- superuser connection; the app role must never be a superuser (also
-- documented in prisma/rls/README.md).

-- ---------------------------------------------------------------------------
-- Tier 1: tenant-only tables (seller-side data; a buyer session never reads
-- these directly, so there is no second customerId check to apply here).
-- ---------------------------------------------------------------------------

ALTER TABLE "TenantMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantMembership"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Category"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "UnitOfMeasure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UnitOfMeasure" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UnitOfMeasure"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProductUnit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductUnit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductUnit"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PriceList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceList" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceList"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "DeliveryRoute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryRoute" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeliveryRoute"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AuditLogEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLogEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLogEntry"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PriceListItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceListItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceListItem"
  USING (EXISTS (
    SELECT 1 FROM "PriceList" pl
    WHERE pl.id = "PriceListItem"."priceListId"
      AND pl."tenantId" = current_setting('app.current_tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "PriceList" pl
    WHERE pl.id = "PriceListItem"."priceListId"
      AND pl."tenantId" = current_setting('app.current_tenant_id', true)
  ));

ALTER TABLE "OrderLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderLine"
  USING (EXISTS (
    SELECT 1 FROM "Order" o
    WHERE o.id = "OrderLine"."orderId"
      AND o."tenantId" = current_setting('app.current_tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Order" o
    WHERE o.id = "OrderLine"."orderId"
      AND o."tenantId" = current_setting('app.current_tenant_id', true)
  ));

ALTER TABLE "FavoriteListItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FavoriteListItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FavoriteListItem"
  USING (EXISTS (
    SELECT 1 FROM "FavoriteList" fl
    WHERE fl.id = "FavoriteListItem"."favoriteListId"
      AND (
        current_setting('app.current_customer_id', true) IS NULL
        OR fl."customerId" = current_setting('app.current_customer_id', true)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "FavoriteList" fl
    WHERE fl.id = "FavoriteListItem"."favoriteListId"
      AND (
        current_setting('app.current_customer_id', true) IS NULL
        OR fl."customerId" = current_setting('app.current_customer_id', true)
      )
  ));
-- (FavoriteListItem has no tenantId of its own; FavoriteList's own policy
-- below already enforces the tenant check via its customerId's Customer row,
-- and the join is only reachable at all once that policy already applies.)

-- ---------------------------------------------------------------------------
-- Tier 2: tenant + optional customer tables (buyer-facing data). When
-- app.current_customer_id is set (a buyer session), rows are additionally
-- narrowed to that one customer - this is what stops Buyer A from reading
-- Buyer B's data within the same tenant.
-- ---------------------------------------------------------------------------

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Customer"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      current_setting('app.current_customer_id', true) IS NULL
      OR id = current_setting('app.current_customer_id', true)
    )
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      current_setting('app.current_customer_id', true) IS NULL
      OR id = current_setting('app.current_customer_id', true)
    )
  );

ALTER TABLE "CustomerMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerMembership"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      current_setting('app.current_customer_id', true) IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      current_setting('app.current_customer_id', true) IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  );

ALTER TABLE "CustomerAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddress" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerAddress"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      current_setting('app.current_customer_id', true) IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      current_setting('app.current_customer_id', true) IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  );

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      current_setting('app.current_customer_id', true) IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      current_setting('app.current_customer_id', true) IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  );

ALTER TABLE "CustomerPriceListAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerPriceListAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerPriceListAssignment"
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "CustomerPriceListAssignment"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        current_setting('app.current_customer_id', true) IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "CustomerPriceListAssignment"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        current_setting('app.current_customer_id', true) IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ));

ALTER TABLE "CustomerProductVisibility" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerProductVisibility" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerProductVisibility"
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "CustomerProductVisibility"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        current_setting('app.current_customer_id', true) IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "CustomerProductVisibility"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        current_setting('app.current_customer_id', true) IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ));

ALTER TABLE "FavoriteList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FavoriteList" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FavoriteList"
  USING (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "FavoriteList"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        current_setting('app.current_customer_id', true) IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "FavoriteList"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        current_setting('app.current_customer_id', true) IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ));

-- ---------------------------------------------------------------------------
-- Deliberately NOT RLS-protected: Tenant, User, Session, Account.
-- These are platform-level/global-identity tables, not tenant-owned data -
-- see docs/SECURITY_AND_MULTI_TENANCY.md §3 ("PLATFORM_ADMIN operations run
-- against tenant-management tables ... not subject to tenant RLS policies").
-- Accessed only via the unscoped `prismaBase` export, only from auth code
-- and platform-admin code paths - never from tenant-scoped domain services.
-- ---------------------------------------------------------------------------

