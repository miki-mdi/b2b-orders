import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/load-env.ts"],
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
