-- Adds a read-only RLS exemption to TenantMembership and CustomerMembership
-- so a user can discover their own membership rows (across tenants) before
-- any tenant/customer context is known - the login/session-resolution step.
-- See prisma/rls/policies.sql's header comment and
-- docs/SECURITY_AND_MULTI_TENANCY.md for the full design writeup.
--
-- This does NOT touch table structure or data - only these two tables'
-- policies are dropped and recreated, split into SELECT (relaxed) and
-- INSERT/UPDATE/DELETE (unchanged, tenant-context-only) policies.

-- ---------------------------------------------------------------------------
-- TenantMembership
-- ---------------------------------------------------------------------------

DROP POLICY tenant_isolation ON "TenantMembership";

CREATE POLICY tenant_isolation_select ON "TenantMembership"
  FOR SELECT
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY tenant_isolation_insert ON "TenantMembership"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_update ON "TenantMembership"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_delete ON "TenantMembership"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ---------------------------------------------------------------------------
-- CustomerMembership
-- ---------------------------------------------------------------------------

DROP POLICY tenant_isolation ON "CustomerMembership";

CREATE POLICY tenant_isolation_select ON "CustomerMembership"
  FOR SELECT
  USING (
    (
      "tenantId" = current_setting('app.current_tenant_id', true)
      AND (
        NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
        OR "customerId" = current_setting('app.current_customer_id', true)
      )
    )
    OR "userId" = NULLIF(current_setting('app.current_user_id', true), '')
  );

CREATE POLICY tenant_isolation_insert ON "CustomerMembership"
  FOR INSERT
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  );

CREATE POLICY tenant_isolation_update ON "CustomerMembership"
  FOR UPDATE
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

CREATE POLICY tenant_isolation_delete ON "CustomerMembership"
  FOR DELETE
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    AND (
      NULLIF(current_setting('app.current_customer_id', true), '') IS NULL
      OR "customerId" = current_setting('app.current_customer_id', true)
    )
  );
