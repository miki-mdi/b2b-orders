import type { OrderStatus, TenantRole } from "@prisma/client";
import { redirect } from "next/navigation";
import type { SellerSession } from "./require-seller";

/**
 * Single source of truth for seller-side, role-based authorization
 * (Phase 1F-B1). This is a Layer 4 concern - the same layer
 * requireSellerSession() already lives at (docs/SECURITY_AND_MULTI_TENANCY.md
 * §3) - not a new trust boundary: session.role comes from the same
 * JWT-with-per-request-re-resolution session requireSellerSession() already
 * trusts for tenantId. There is deliberately no second (RLS/Postgres) layer
 * for role in this phase - see docs/SESSION_HANDOFF.md's Phase 1F-B1 section
 * for why that was an explicit, discussed choice, not an oversight.
 *
 * Every page, Server Action, and API route must check a capability from this
 * table before doing anything else - never a bespoke `if (session.role === ...)`
 * inline. Hiding a button/nav link for a role that lacks a capability is a
 * UX nicety on top of this, never a substitute for it.
 */
export type Capability =
  | "catalog:read"
  | "catalog:write"
  | "customers:read"
  | "customers:write:limited"
  | "customers:write:full"
  | "customers:activate"
  | "customers:addresses:write"
  | "customers:addresses:deactivate"
  | "pricing:read"
  | "pricing:write"
  | "customer-visibility:write"
  | "orders:read:all"
  | "orders:read:fulfillment"
  | "orders:read:delivery"
  | "orders:create"
  | "orders:confirm"
  | "orders:advance:PICKING"
  | "orders:advance:READY"
  | "orders:advance:OUT_FOR_DELIVERY"
  | "orders:advance:DELIVERED"
  | "audit:read"
  | "exports:read"
  | "imports:manage"
  | "dashboard:sales-analytics";

const SELLER_ADMIN_CAPABILITIES: readonly Capability[] = [
  "catalog:read",
  "catalog:write",
  "customers:read",
  "customers:write:full",
  "customers:activate",
  "customers:addresses:write",
  "customers:addresses:deactivate",
  "pricing:read",
  "pricing:write",
  "customer-visibility:write",
  "orders:read:all",
  "orders:create",
  "orders:confirm",
  "orders:advance:PICKING",
  "orders:advance:READY",
  "orders:advance:OUT_FOR_DELIVERY",
  "orders:advance:DELIVERED",
  "audit:read",
  "exports:read",
  "imports:manage",
  "dashboard:sales-analytics",
];

const SALES_REP_CAPABILITIES: readonly Capability[] = [
  "catalog:read",
  "customers:read",
  "customers:write:limited",
  "customers:addresses:write",
  "pricing:read",
  "orders:read:all",
  "orders:create",
  "orders:confirm",
  "dashboard:sales-analytics",
];

const WAREHOUSE_WORKER_CAPABILITIES: readonly Capability[] = [
  "catalog:read",
  "orders:read:fulfillment",
  "orders:advance:PICKING",
  "orders:advance:READY",
];

const DELIVERY_DRIVER_CAPABILITIES: readonly Capability[] = [
  "orders:read:delivery",
  "orders:advance:OUT_FOR_DELIVERY",
  "orders:advance:DELIVERED",
];

const ROLE_CAPABILITIES: Record<TenantRole, ReadonlySet<Capability>> = {
  SELLER_ADMIN: new Set(SELLER_ADMIN_CAPABILITIES),
  SALES_REP: new Set(SALES_REP_CAPABILITIES),
  WAREHOUSE_WORKER: new Set(WAREHOUSE_WORKER_CAPABILITIES),
  DELIVERY_DRIVER: new Set(DELIVERY_DRIVER_CAPABILITIES),
};

/** The order statuses each role-scoped order-read capability is allowed to see. `null` means unrestricted (whole tenant, every status). */
export const ORDER_READ_STATUS_SCOPE: Record<"orders:read:all" | "orders:read:fulfillment" | "orders:read:delivery", OrderStatus[] | null> = {
  "orders:read:all": null,
  "orders:read:fulfillment": ["CONFIRMED", "PICKING", "READY"],
  "orders:read:delivery": ["READY", "OUT_FOR_DELIVERY", "DELIVERED"],
};

const ORDER_READ_CAPABILITIES = ["orders:read:all", "orders:read:fulfillment", "orders:read:delivery"] as const;

export function hasCapability(role: TenantRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/** The one order-read capability this role has, or null if none (shouldn't happen for any seller role today, but keeps callers honest). */
export function orderReadCapabilityFor(role: TenantRole): (typeof ORDER_READ_CAPABILITIES)[number] | null {
  for (const capability of ORDER_READ_CAPABILITIES) {
    if (hasCapability(role, capability)) return capability;
  }
  return null;
}

/** The order statuses this role may read, or null if unrestricted. An empty array (impossible today) would mean "can read no orders." */
export function orderReadStatusScopeFor(role: TenantRole): OrderStatus[] | null {
  const capability = orderReadCapabilityFor(role);
  if (!capability) return [];
  return ORDER_READ_STATUS_SCOPE[capability];
}

export class ForbiddenError extends Error {
  constructor(capability: Capability) {
    super(`Missing required capability: ${capability}`);
    this.name = "ForbiddenError";
  }
}

const FORBIDDEN_MESSAGE = "You don't have permission to do this.";

/**
 * For pages: redirects to /seller (same pattern requireSellerSession itself
 * uses for a session that fails its own check) when the role lacks
 * `capability`. Call this right after requireSellerSession() and before any
 * data read the role shouldn't see - order matters, since redirect() throws
 * and nothing after it in the same function runs.
 */
export function requireSellerCapability(session: SellerSession, capability: Capability): void {
  if (!hasCapability(session.role, capability)) {
    redirect("/seller");
  }
}

/** For Server Actions: returns a ready-made FormState error instead of throwing, since every action already returns FormState on every other failure path. Returns null when the capability check passes. */
export function checkActionCapability(
  session: SellerSession,
  capability: Capability
): { status: "error"; message: string } | null {
  if (hasCapability(session.role, capability)) return null;
  return { status: "error", message: FORBIDDEN_MESSAGE };
}

/** For API routes: returns a 403 Response when the role lacks `capability`, or null when the check passes - `const denied = requireApiCapability(...); if (denied) return denied;`. */
export function requireApiCapability(session: SellerSession, capability: Capability): Response | null {
  if (hasCapability(session.role, capability)) return null;
  return new Response(FORBIDDEN_MESSAGE, { status: 403 });
}
