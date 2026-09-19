import { z } from "zod";

/**
 * Validates process.env once at startup instead of letting a missing
 * variable surface as a confusing failure deep inside Prisma/Auth.js later.
 * Import `env` (not `process.env` directly) from application code that
 * needs one of these.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NODE_ENV: process.env.NODE_ENV,
});
