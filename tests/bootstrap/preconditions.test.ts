import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import {
  checkRootStateIsEmpty,
  checkMigrationsMatchRepo,
  checkBootstrapPreconditions,
  BootstrapPreconditionError,
} from "@/lib/bootstrap/preconditions";
import { resetDatabase, seedTenant } from "../../prisma/seed";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

describe("bootstrap preconditions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("checkMigrationsMatchRepo passes cleanly against a fully, correctly migrated database", async () => {
    await expect(checkMigrationsMatchRepo(prismaBase, MIGRATIONS_DIR)).resolves.toBeUndefined();
  });

  it("checkRootStateIsEmpty passes on a genuinely empty database", async () => {
    await expect(checkRootStateIsEmpty(prismaBase)).resolves.toBeUndefined();
  });

  it("checkRootStateIsEmpty refuses when a Tenant already exists", async () => {
    const passwordHash = await hashPassword("irrelevant-seed-password-123");
    await seedTenant("Existing", "existing-tenant", passwordHash);

    await expect(checkRootStateIsEmpty(prismaBase)).rejects.toThrow(BootstrapPreconditionError);
    await expect(checkRootStateIsEmpty(prismaBase)).rejects.toThrow(/not empty/i);
  });

  it("checkBootstrapPreconditions (combined) refuses on a non-empty database even though migrations are fine", async () => {
    const passwordHash = await hashPassword("irrelevant-seed-password-123");
    await seedTenant("Existing", "existing-tenant-2", passwordHash);

    await expect(checkBootstrapPreconditions(prismaBase, MIGRATIONS_DIR)).rejects.toThrow(BootstrapPreconditionError);
  });
});
