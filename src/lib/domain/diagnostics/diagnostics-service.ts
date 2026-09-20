import { readFileSync } from "node:fs";
import path from "node:path";
import { prismaBase } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

/**
 * Lightweight operational diagnostics (Phase 1E, §5) - platform-admin-only,
 * see src/lib/auth/require-platform-admin.ts for the authorization gate.
 * Every field here is either a boolean/count/timestamp or a value already
 * meant to be public (app version) - nothing here ever returns a
 * connection string, secret, token, or raw environment variable, per the
 * brief's explicit "never display" list.
 */

export type DatabaseDiagnostics =
  | { connected: true; latencyMs: number }
  | { connected: false; latencyMs: null };

export type MigrationDiagnostics =
  | { available: true; appliedCount: number; latestMigrationName: string; latestAppliedAt: Date | null }
  | { available: false };

export type DiagnosticsReport = {
  appStatus: "ok";
  environment: string;
  appVersion: string;
  gitCommit: string;
  database: DatabaseDiagnostics;
  migrations: MigrationDiagnostics;
  checks: {
    databaseUrlConfigured: boolean;
    authSecretConfigured: boolean;
  };
};

function readAppVersion(): string {
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readGitCommit(): string {
  // Deliberately reads from environment variables set by the hosting
  // platform at build/deploy time (Vercel, most CI systems) rather than
  // shelling out to `git rev-parse` at request time - a production
  // container often has no .git directory and must never depend on one
  // being present just to render a diagnostics page.
  const sha = process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SOURCE_VERSION;
  return sha ? sha.slice(0, 12) : "unknown";
}

async function checkDatabase(): Promise<DatabaseDiagnostics> {
  const start = Date.now();
  try {
    await prismaBase.$queryRaw`SELECT 1`;
    return { connected: true, latencyMs: Date.now() - start };
  } catch (error) {
    // The real error (which can include host/connection details) is logged
    // server-side only - the diagnostics page itself only ever shows
    // "connected: false", never the underlying error message.
    logger.error("diagnostics: database connectivity check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { connected: false, latencyMs: null };
  }
}

async function checkMigrations(): Promise<MigrationDiagnostics> {
  try {
    const [countRows, latestRows] = await Promise.all([
      prismaBase.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"`,
      prismaBase.$queryRaw<
        { migration_name: string; finished_at: Date | null }[]
      >`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC NULLS LAST LIMIT 1`,
    ]);
    const latest = latestRows[0];
    if (!latest) {
      return { available: false };
    }
    return {
      available: true,
      appliedCount: Number(countRows[0]?.count ?? 0),
      latestMigrationName: latest.migration_name,
      latestAppliedAt: latest.finished_at,
    };
  } catch (error) {
    logger.error("diagnostics: migration state check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { available: false };
  }
}

export async function getDiagnosticsReport(): Promise<DiagnosticsReport> {
  const [database, migrations] = await Promise.all([checkDatabase(), checkMigrations()]);

  return {
    appStatus: "ok",
    environment: process.env.NODE_ENV ?? "unknown",
    appVersion: readAppVersion(),
    gitCommit: readGitCommit(),
    database,
    migrations,
    checks: {
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      authSecretConfigured: Boolean(process.env.AUTH_SECRET),
    },
  };
}
