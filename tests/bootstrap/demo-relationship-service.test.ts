// Pure unit tests, no mocks, no database at all.
import { describe, expect, it } from "vitest";
import {
  DemoRelationshipInconsistentError,
  reconcileActiveRelationshipState,
  reconcilePendingBuyerRequestState,
  reconcilePendingSellerInviteState,
  reconcilePriceListAssignmentState,
} from "@/lib/bootstrap/demo-relationship-service";

const CUSTOMER_ID = "customer-1";
const OTHER_CUSTOMER_ID = "customer-2";
const LABEL = "test case";
const PRICE_LIST_ID = "price-list-1";
const OTHER_PRICE_LIST_ID = "price-list-2";

describe("reconcileActiveRelationshipState", () => {
  it("creates-and-accepts when no relationship exists yet", () => {
    const result = reconcileActiveRelationshipState({ existing: null, expectedCustomerId: CUSTOMER_ID, label: LABEL });
    expect(result).toEqual({ action: "create-and-accept" });
  });

  it("skips when already ACTIVE with the expected customer", () => {
    const result = reconcileActiveRelationshipState({
      existing: { status: "ACTIVE", initiatedBy: "SELLER", customerId: CUSTOMER_ID },
      expectedCustomerId: CUSTOMER_ID,
      label: LABEL,
    });
    expect(result).toEqual({ action: "skip" });
  });

  it("throws when ACTIVE but linked to a different customer than expected - never relinks", () => {
    expect(() =>
      reconcileActiveRelationshipState({
        existing: { status: "ACTIVE", initiatedBy: "SELLER", customerId: OTHER_CUSTOMER_ID },
        expectedCustomerId: CUSTOMER_ID,
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });

  it.each(["PENDING", "DECLINED", "REVOKED"] as const)("throws when the existing relationship is %s instead of ACTIVE", (status) => {
    expect(() =>
      reconcileActiveRelationshipState({
        existing: { status, initiatedBy: "SELLER", customerId: CUSTOMER_ID },
        expectedCustomerId: CUSTOMER_ID,
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });
});

describe("reconcilePendingSellerInviteState", () => {
  it("creates-only when no relationship exists yet", () => {
    const result = reconcilePendingSellerInviteState({ existing: null, expectedCustomerId: CUSTOMER_ID, label: LABEL });
    expect(result).toEqual({ action: "create-only" });
  });

  it("skips when already PENDING, SELLER-initiated, with the expected customer", () => {
    const result = reconcilePendingSellerInviteState({
      existing: { status: "PENDING", initiatedBy: "SELLER", customerId: CUSTOMER_ID },
      expectedCustomerId: CUSTOMER_ID,
      label: LABEL,
    });
    expect(result).toEqual({ action: "skip" });
  });

  it("throws when PENDING but BUYER-initiated instead of SELLER", () => {
    expect(() =>
      reconcilePendingSellerInviteState({
        existing: { status: "PENDING", initiatedBy: "BUYER", customerId: CUSTOMER_ID },
        expectedCustomerId: CUSTOMER_ID,
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });

  it("throws when already ACTIVE - never overwritten", () => {
    expect(() =>
      reconcilePendingSellerInviteState({
        existing: { status: "ACTIVE", initiatedBy: "SELLER", customerId: CUSTOMER_ID },
        expectedCustomerId: CUSTOMER_ID,
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });

  it("throws when linked to a different customer than expected", () => {
    expect(() =>
      reconcilePendingSellerInviteState({
        existing: { status: "PENDING", initiatedBy: "SELLER", customerId: OTHER_CUSTOMER_ID },
        expectedCustomerId: CUSTOMER_ID,
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });
});

describe("reconcilePendingBuyerRequestState", () => {
  it("creates-only when no relationship exists yet", () => {
    expect(reconcilePendingBuyerRequestState({ existing: null, label: LABEL })).toEqual({ action: "create-only" });
  });

  it("skips when already PENDING, BUYER-initiated, with no customer", () => {
    const result = reconcilePendingBuyerRequestState({
      existing: { status: "PENDING", initiatedBy: "BUYER", customerId: null },
      label: LABEL,
    });
    expect(result).toEqual({ action: "skip" });
  });

  it("throws when PENDING but SELLER-initiated instead of BUYER", () => {
    expect(() =>
      reconcilePendingBuyerRequestState({
        existing: { status: "PENDING", initiatedBy: "SELLER", customerId: null },
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });

  it("throws when a customer is unexpectedly already linked", () => {
    expect(() =>
      reconcilePendingBuyerRequestState({
        existing: { status: "PENDING", initiatedBy: "BUYER", customerId: CUSTOMER_ID },
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });

  it("throws when already ACTIVE - never overwritten", () => {
    expect(() =>
      reconcilePendingBuyerRequestState({
        existing: { status: "ACTIVE", initiatedBy: "BUYER", customerId: CUSTOMER_ID },
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });
});

describe("reconcilePriceListAssignmentState", () => {
  it("assigns when the customer has no price list assignment yet", () => {
    const result = reconcilePriceListAssignmentState({
      existingPriceListId: null,
      expectedPriceListId: PRICE_LIST_ID,
      label: LABEL,
    });
    expect(result).toEqual({ action: "assign" });
  });

  it("skips when already assigned to the expected price list", () => {
    const result = reconcilePriceListAssignmentState({
      existingPriceListId: PRICE_LIST_ID,
      expectedPriceListId: PRICE_LIST_ID,
      label: LABEL,
    });
    expect(result).toEqual({ action: "skip" });
  });

  it("throws when assigned to a different price list than expected - never overwrites", () => {
    expect(() =>
      reconcilePriceListAssignmentState({
        existingPriceListId: OTHER_PRICE_LIST_ID,
        expectedPriceListId: PRICE_LIST_ID,
        label: LABEL,
      })
    ).toThrow(DemoRelationshipInconsistentError);
  });
});
