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
-- NULLIF(..., '') around every "is customer context unset" check: once a
-- pooled connection has had app.current_customer_id set via set_config(...,
-- true) at least once (even inside a transaction that later commits),
-- Postgres leaves that custom parameter "known" on the connection - a LATER
-- transaction on the SAME reused connection that never sets it again sees
-- current_setting('app.current_customer_id', true) return '' (empty
-- string), not NULL. An earlier version of this file checked `... IS NULL`
-- directly, which passed on a fresh connection but silently started
-- restricting rows to a nonexistent customerId ('') on a reused one -
-- verified via prisma/../scripts/diagnose-tenant-context.ts and covered by
-- tests/isolation/connection-reuse.test.ts. This has no equivalent effect on
-- app.current_tenant_id, which is unconditionally set on every transaction
-- (never conditionally skipped), so it can never be observed in this
-- "previously-set-now-stale" state.
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
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
        OR fl."customerId" = current_setting('app.current_customer_id', true)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "FavoriteList" fl
    WHERE fl.id = "FavoriteListItem"."favoriteListId"
      AND (
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
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
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR id = current_setting('app.current_customer_id', true)
    )
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR id = current_setting('app.current_customer_id', true)
    )
  );

ALTER TABLE "CustomerMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerMembership"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  );

ALTER TABLE "CustomerAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddress" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerAddress"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  );

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
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
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "CustomerPriceListAssignment"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
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
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "CustomerProductVisibility"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
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
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
        OR c.id = current_setting('app.current_customer_id', true)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Customer" c
    WHERE c.id = "FavoriteList"."customerId"
      AND c."tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
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
