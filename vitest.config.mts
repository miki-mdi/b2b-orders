import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/load-env.ts"],
    // Every DB-backed test file shares ONE physical Postgres database and
    // most call resetDatabase() in their own beforeAll - running files in
    // parallel (Vitest's default) lets one file's reset wipe another's
    // in-progress fixtures mid-test. None of these tests are written to
    // tolerate concurrent global state, so file-level parallelism is
    // disabled project-wide rather than only for the affected files.
    fileParallelism: false,
    // Isolation tests do real Postgres transactions across several awaits -
    // generous but not unbounded timeouts catch a genuinely hung connection
    // without flaking on normal local DB latency.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
