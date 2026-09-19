-- Fix: normalize app.current_customer_id with NULLIF(..., '') before the
-- "is a buyer session active" IS NULL check, in every Tier 2 RLS policy.
--
-- Root cause: once a pooled connection has had app.current_customer_id set
-- via set_config(..., true) at least once (even inside a transaction that
-- later commits), Postgres leaves that custom parameter "known" on the
-- connection - a later transaction on the SAME reused connection that never
-- sets it again sees current_setting('app.current_customer_id', true)
-- return '' (empty string), not NULL. The original policies checked
-- `... IS NULL` directly, which is correct on a fresh connection but
-- incorrectly started restricting rows to a nonexistent customerId ('') on
-- a reused one - i.e. a tenant-only (seller) session could see ZERO rows on
-- these tables if it happened to reuse a connection a buyer session had
-- used moments earlier. See prisma/rls/policies.sql for the corrected
-- source of truth and full explanation.
--
-- This does not touch table structure or data - only the eight policies
-- below are dropped and recreated with the corrected condition.

DROP POLICY tenant_isolation ON "FavoriteListItem";
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

DROP POLICY tenant_isolation ON "Customer";
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

DROP POLICY tenant_isolation ON "CustomerMembership";
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

DROP POLICY tenant_isolation ON "CustomerAddress";
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

DROP POLICY tenant_isolation ON "Order";
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

DROP POLICY tenant_isolation ON "CustomerPriceListAssignment";
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

DROP POLICY tenant_isolation ON "CustomerProductVisibility";
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

DROP POLICY tenant_isolation ON "FavoriteList";
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
