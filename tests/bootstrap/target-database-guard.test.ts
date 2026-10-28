// Pure unit tests against a mocked $queryRaw - no DATABASE_URL, no local dev
// database, no Railway, no network at all.
import { describe, expect, it, vi } from "vitest";
import {
  assertConnectedToDatabase,
  assertConnectedToPilotDatabase,
  getCurrentDatabaseName,
  WrongTargetDatabaseError,
  type DatabaseNameClient,
} from "@/lib/bootstrap/target-database-guard";

function makeDb(currentDatabase: string | undefined): DatabaseNameClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue(currentDatabase === undefined ? [] : [{ current_database: currentDatabase }]),
  };
}

describe("getCurrentDatabaseName", () => {
  it("returns the name Postgres reports", async () => {
    await expect(getCurrentDatabaseName(makeDb("railway"))).resolves.toBe("railway");
  });

  it("throws if the query returns no rows", async () => {
    await expect(getCurrentDatabaseName(makeDb(undefined))).rejects.toThrow(WrongTargetDatabaseError);
  });
});

describe("assertConnectedToDatabase (generic, parameterized)", () => {
  it("passes silently when the connected name matches expectedName", async () => {
    await expect(assertConnectedToDatabase(makeDb("b2b_orders_dev"), "b2b_orders_dev")).resolves.toBeUndefined();
  });

  it("refuses when connected to Railway's \"railway\" instead of the expected local dev database", async () => {
    await expect(assertConnectedToDatabase(makeDb("railway"), "b2b_orders_dev")).rejects.toThrow(
      WrongTargetDatabaseError
    );
  });

  it("refuses for any other database name, not just a known one", async () => {
    await expect(assertConnectedToDatabase(makeDb("some_other_database"), "b2b_orders_dev")).rejects.toThrow(
      WrongTargetDatabaseError
    );
  });

  it("is case-sensitive", async () => {
    await expect(assertConnectedToDatabase(makeDb("B2B_Orders_Dev"), "b2b_orders_dev")).rejects.toThrow(
      WrongTargetDatabaseError
    );
  });
});

describe("assertConnectedToPilotDatabase", () => {
  it("passes silently when connected to the Railway pilot database (\"railway\")", async () => {
    await expect(assertConnectedToPilotDatabase(makeDb("railway"))).resolves.toBeUndefined();
  });

  it("refuses when connected to local dev (\"b2b_orders_dev\")", async () => {
    const db = makeDb("b2b_orders_dev");
    await expect(assertConnectedToPilotDatabase(db)).rejects.toThrow(WrongTargetDatabaseError);
    await expect(assertConnectedToPilotDatabase(db)).rejects.toThrow(/b2b_orders_dev/);
  });

  it("refuses for any other database name, not just the known local-dev one", async () => {
    await expect(assertConnectedToPilotDatabase(makeDb("some_other_database"))).rejects.toThrow(
      WrongTargetDatabaseError
    );
    await expect(assertConnectedToPilotDatabase(makeDb("postgres"))).rejects.toThrow(WrongTargetDatabaseError);
  });

  it("is case-sensitive - does not accept a near-miss like \"Railway\"", async () => {
    await expect(assertConnectedToPilotDatabase(makeDb("Railway"))).rejects.toThrow(WrongTargetDatabaseError);
  });

  it("never includes a connection string, password, or secret-shaped value in its error message", async () => {
    try {
      await assertConnectedToPilotDatabase(makeDb("b2b_orders_dev"));
      throw new Error("expected assertConnectedToPilotDatabase to throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toMatch(/:\/\//); // no "postgresql://...": connection string shape
      expect(message.toLowerCase()).not.toContain("password");
    }
  });
});
