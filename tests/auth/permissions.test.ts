import { describe, expect, it } from "vitest";
import type { TenantRole } from "@prisma/client";
import {
  hasCapability,
  orderReadCapabilityFor,
  orderReadStatusScopeFor,
  type Capability,
} from "@/lib/auth/permissions";

const ROLES: TenantRole[] = ["SELLER_ADMIN", "SALES_REP", "WAREHOUSE_WORKER", "DELIVERY_DRIVER"];

/**
 * One row per approved Phase 1F-B1 matrix cell (docs/SESSION_HANDOFF.md's
 * Phase 1F-B1 section has the full table) - every capability x role
 * combination is asserted explicitly so an accidental edit to
 * ROLE_CAPABILITIES in src/lib/auth/permissions.ts is caught immediately,
 * not just the cases a feature test happens to exercise.
 */
const EXPECTED: Record<Capability, Record<TenantRole, boolean>> = {
  "catalog:read": { SELLER_ADMIN: true, SALES_REP: true, WAREHOUSE_WORKER: true, DELIVERY_DRIVER: false },
  "catalog:write": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "customers:read": { SELLER_ADMIN: true, SALES_REP: true, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "customers:write:limited": { SELLER_ADMIN: false, SALES_REP: true, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "customers:write:full": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "customers:activate": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "customers:addresses:write": { SELLER_ADMIN: true, SALES_REP: true, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "customers:addresses:deactivate": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "pricing:read": { SELLER_ADMIN: true, SALES_REP: true, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "pricing:write": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "customer-visibility:write": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "orders:read:all": { SELLER_ADMIN: true, SALES_REP: true, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "orders:read:fulfillment": { SELLER_ADMIN: false, SALES_REP: false, WAREHOUSE_WORKER: true, DELIVERY_DRIVER: false },
  "orders:read:delivery": { SELLER_ADMIN: false, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: true },
  "orders:create": { SELLER_ADMIN: true, SALES_REP: true, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "orders:confirm": { SELLER_ADMIN: true, SALES_REP: true, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "orders:advance:PICKING": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: true, DELIVERY_DRIVER: false },
  "orders:advance:READY": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: true, DELIVERY_DRIVER: false },
  "orders:advance:OUT_FOR_DELIVERY": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: true },
  "orders:advance:DELIVERED": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: true },
  "audit:read": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "exports:read": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "imports:manage": { SELLER_ADMIN: true, SALES_REP: false, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
  "dashboard:sales-analytics": { SELLER_ADMIN: true, SALES_REP: true, WAREHOUSE_WORKER: false, DELIVERY_DRIVER: false },
};

describe("hasCapability", () => {
  for (const capability of Object.keys(EXPECTED) as Capability[]) {
    for (const role of ROLES) {
      const expected = EXPECTED[capability][role];
      it(`${role} ${expected ? "has" : "lacks"} ${capability}`, () => {
        expect(hasCapability(role, capability)).toBe(expected);
      });
    }
  }
});

describe("orderReadCapabilityFor / orderReadStatusScopeFor", () => {
  it("Seller Admin and Sales Rep read all statuses (unrestricted)", () => {
    expect(orderReadCapabilityFor("SELLER_ADMIN")).toBe("orders:read:all");
    expect(orderReadStatusScopeFor("SELLER_ADMIN")).toBeNull();
    expect(orderReadCapabilityFor("SALES_REP")).toBe("orders:read:all");
    expect(orderReadStatusScopeFor("SALES_REP")).toBeNull();
  });

  it("Warehouse Worker is scoped to CONFIRMED/PICKING/READY", () => {
    expect(orderReadCapabilityFor("WAREHOUSE_WORKER")).toBe("orders:read:fulfillment");
    expect(orderReadStatusScopeFor("WAREHOUSE_WORKER")).toEqual(["CONFIRMED", "PICKING", "READY"]);
  });

  it("Delivery Driver is scoped to READY/OUT_FOR_DELIVERY/DELIVERED", () => {
    expect(orderReadCapabilityFor("DELIVERY_DRIVER")).toBe("orders:read:delivery");
    expect(orderReadStatusScopeFor("DELIVERY_DRIVER")).toEqual(["READY", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });
});
