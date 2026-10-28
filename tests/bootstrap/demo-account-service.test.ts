// Pure unit tests, no mocks, no database at all - these functions take
// plain objects and either return a decision or throw.
import { describe, expect, it } from "vitest";
import {
  DemoAccountInconsistentError,
  reconcileDemoBuyerState,
  reconcileDemoTenantState,
} from "@/lib/bootstrap/demo-account-service";

describe("reconcileDemoTenantState", () => {
  const base = {
    existingTenant: null as { name: string } | null,
    existingAdminUser: null as { id: string } | null,
    existingMembership: null as { role: string; isActive: boolean } | null,
    expectedName: "Скопска пивара",
    label: "Tenant",
  };

  it("creates when nothing exists yet", () => {
    expect(reconcileDemoTenantState(base)).toEqual({ action: "create" });
  });

  it("skips when the tenant, admin, and active SELLER_ADMIN membership all match", () => {
    const result = reconcileDemoTenantState({
      ...base,
      existingTenant: { name: "Скопска пивара" },
      existingAdminUser: { id: "user-1" },
      existingMembership: { role: "SELLER_ADMIN", isActive: true },
    });
    expect(result).toEqual({ action: "skip" });
  });

  it("throws when the tenant exists with a different name", () => {
    expect(() => reconcileDemoTenantState({ ...base, existingTenant: { name: "Wrong Name" } })).toThrow(
      DemoAccountInconsistentError
    );
  });

  it("throws when the tenant exists but the expected admin user does not", () => {
    expect(() => reconcileDemoTenantState({ ...base, existingTenant: { name: "Скопска пивара" } })).toThrow(
      DemoAccountInconsistentError
    );
  });

  it("throws when the tenant and admin exist but there is no membership", () => {
    expect(() =>
      reconcileDemoTenantState({
        ...base,
        existingTenant: { name: "Скопска пивара" },
        existingAdminUser: { id: "user-1" },
      })
    ).toThrow(DemoAccountInconsistentError);
  });

  it("throws when the membership exists but has the wrong role", () => {
    expect(() =>
      reconcileDemoTenantState({
        ...base,
        existingTenant: { name: "Скопска пивара" },
        existingAdminUser: { id: "user-1" },
        existingMembership: { role: "SALES_REP", isActive: true },
      })
    ).toThrow(DemoAccountInconsistentError);
  });

  it("throws when the membership exists but is inactive", () => {
    expect(() =>
      reconcileDemoTenantState({
        ...base,
        existingTenant: { name: "Скопска пивара" },
        existingAdminUser: { id: "user-1" },
        existingMembership: { role: "SELLER_ADMIN", isActive: false },
      })
    ).toThrow(DemoAccountInconsistentError);
  });
});

describe("reconcileDemoBuyerState", () => {
  const base = { existingUser: null as { name: string; isActive: boolean } | null, expectedName: "Demo Buyer One", label: "Buyer" };

  it("creates when no user exists yet", () => {
    expect(reconcileDemoBuyerState(base)).toEqual({ action: "create" });
  });

  it("skips when an active user with the expected name already exists", () => {
    const result = reconcileDemoBuyerState({ ...base, existingUser: { name: "Demo Buyer One", isActive: true } });
    expect(result).toEqual({ action: "skip" });
  });

  it("throws when a user with this email exists with a different name", () => {
    expect(() => reconcileDemoBuyerState({ ...base, existingUser: { name: "Someone Else", isActive: true } })).toThrow(
      DemoAccountInconsistentError
    );
  });

  it("throws when the matching user exists but is deactivated", () => {
    expect(() => reconcileDemoBuyerState({ ...base, existingUser: { name: "Demo Buyer One", isActive: false } })).toThrow(
      DemoAccountInconsistentError
    );
  });
});
