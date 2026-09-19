import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Threads "which tenant (and, for a buyer session, which customer) is this
 * request acting as" through to the Prisma client extension (Layer 2)
 * without prop-drilling it into every domain function call. Set once per
 * request/job by withTenantContext / withCustomerContext (./with-tenant.ts);
 * read by the extension in ./scoped-client.ts on every query.
 */
export type TenantContext = {
  tenantId: string;
  customerId?: string;
};

const storage = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function runWithTenantContext<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/**
 * Fails closed: throws rather than silently returning an unscoped client or
 * skipping the tenant filter. Domain services call this instead of trusting
 * a caller-supplied tenantId, so "forgot to scope this call" becomes an
 * immediate, loud error instead of a data leak.
 */
export function requireTenantId(tenantId: string | null | undefined): string {
  if (!tenantId) {
    throw new TenantContextMissingError();
  }
  return tenantId;
}

export function requireCustomerId(customerId: string | null | undefined): string {
  if (!customerId) {
    throw new CustomerContextMissingError();
  }
  return customerId;
}

export function requireUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new UserContextMissingError();
  }
  return userId;
}

export class TenantContextMissingError extends Error {
  constructor() {
    super(
      "Tenant context is required for this operation but was not provided. " +
        "This is a fail-safe: no query against a tenant-scoped table may run without an explicit tenantId."
    );
    this.name = "TenantContextMissingError";
  }
}

export class CustomerContextMissingError extends Error {
  constructor() {
    super(
      "Customer context is required for this operation but was not provided. " +
        "This is a fail-safe: no buyer-facing query may run without an explicit customerId."
    );
    this.name = "CustomerContextMissingError";
  }
}

export class UserContextMissingError extends Error {
  constructor() {
    super(
      "User context is required for this operation but was not provided. " +
        "This is a fail-safe: no membership-discovery query may run without an explicit userId."
    );
    this.name = "UserContextMissingError";
  }
}
