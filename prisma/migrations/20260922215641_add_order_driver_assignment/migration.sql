-- Phase 1F-B3: Delivery Driver order assignment.
--
-- Order.assignedDriverMembershipId is nullable, no default - "unassigned" is
-- the state every existing order migrates into, and a first-class state
-- going forward, not a migration artifact. See docs/SESSION_HANDOFF.md's
-- Phase 1F-B3 section for the full design rationale.
--
-- TenantMembership(id, tenantId) is a new unique index, redundant with `id`
-- alone already being unique - it exists solely so the composite FK below
-- has a unique target to reference. It cannot be violated by existing data:
-- `id` is already the primary key.
--
-- The composite FK ([assignedDriverMembershipId, tenantId] ->
-- [id, tenantId]) is what makes this a same-tenant-safe reference at the
-- DATABASE level, not just in application code: Postgres will reject any
-- row where the assigned membership's tenantId doesn't match the order's
-- own tenantId. Postgres composite FKs default to MATCH SIMPLE, so a NULL
-- assignedDriverMembershipId (every existing order, after this migration)
-- exempts that row from the check entirely - unassigned orders are
-- unaffected.
--
-- ON DELETE RESTRICT rather than SET NULL: a composite FK's SET NULL would
-- null out BOTH columns, including tenantId, which is NOT NULL and must
-- never be null (it's the RLS/Layer-2 isolation anchor for this table).
-- Nothing in this codebase deletes a TenantMembership today; if a future
-- phase adds that capability, reassigning/clearing any orders first is the
-- correct order of operations anyway, and RESTRICT enforces exactly that.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "assignedDriverMembershipId" TEXT;

-- CreateIndex
CREATE INDEX "Order_tenantId_assignedDriverMembershipId_status_idx" ON "Order"("tenantId", "assignedDriverMembershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_id_tenantId_key" ON "TenantMembership"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedDriverMembershipId_tenantId_fkey" FOREIGN KEY ("assignedDriverMembershipId", "tenantId") REFERENCES "TenantMembership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
