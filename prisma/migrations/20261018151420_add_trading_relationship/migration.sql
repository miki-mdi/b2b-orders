-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RelationshipInitiator" AS ENUM ('SELLER', 'BUYER');

-- CreateTable
CREATE TABLE "TradingRelationship" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "RelationshipStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedBy" "RelationshipInitiator" NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "respondedByUserId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingRelationship_tenantId_status_idx" ON "TradingRelationship"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TradingRelationship_userId_status_idx" ON "TradingRelationship"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TradingRelationship_userId_tenantId_key" ON "TradingRelationship"("userId", "tenantId");

-- AddForeignKey
ALTER TABLE "TradingRelationship" ADD CONSTRAINT "TradingRelationship_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingRelationship" ADD CONSTRAINT "TradingRelationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingRelationship" ADD CONSTRAINT "TradingRelationship_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security for TradingRelationship - see prisma/rls/policies.sql
-- (source of truth, this block is copied verbatim from there) and
-- prisma/rls/README.md step 3 ("every subsequent prisma migrate dev for a
-- new table must remember to add its own ENABLE/FORCE ROW LEVEL SECURITY +
-- policy to that migration's SQL by hand"). Tenant-scoped writes plus the
-- same read-only "userId = app.current_user_id" self-row exemption already
-- used by TenantMembership/CustomerMembership for login-time discovery.

ALTER TABLE "TradingRelationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TradingRelationship" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON "TradingRelationship"
  FOR SELECT
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY tenant_isolation_insert ON "TradingRelationship"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_update ON "TradingRelationship"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_delete ON "TradingRelationship"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true));
