// Vitest doesn't get Next.js's built-in .env loading, so tests load it
// themselves via the same shared loader prisma.config.ts and prisma/seed.ts use.
import "../../scripts/load-env";
