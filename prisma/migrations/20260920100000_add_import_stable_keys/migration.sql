-- Phase 1F-A: stable, translation-independent business keys needed for safe
-- CSV import (see docs/SESSION_HANDOFF.md §15 / the Phase 1F-A brief).
--
-- Category.code: nullable, tenant-unique - mirrors the existing
-- Customer.code / PriceList.code pattern exactly. Existing categories have
-- no code until a seller sets one (manually or via an import CREATE); a
-- preflight check confirmed no data conflict is possible (a new nullable
-- column starts NULL for every existing row, and Postgres allows multiple
-- NULLs through a unique index).
--
-- CustomerAddress (customerId, label) uniqueness: no new column - formalizes
-- what the existing free-text `label` field already means in practice (a
-- per-customer address identifier, e.g. "Main warehouse") into a real
-- constraint, so it can serve as the CSV import key for addresses. A
-- preflight query confirmed zero existing (customerId, label) duplicates in
-- the dev database, so this index applies cleanly.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_code_key" ON "Category"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAddress_customerId_label_key" ON "CustomerAddress"("customerId", "label");
