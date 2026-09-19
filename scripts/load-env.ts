/**
 * Next.js has built-in support for .env.local overriding .env; nothing else
 * in this project does automatically (plain `dotenv/config` only reads
 * `.env`). Imported first - before any module that reads process.env at
 * import time, such as src/lib/db/prisma.ts's PrismaPg construction - by
 * prisma.config.ts, prisma/seed.ts, and tests/setup/load-env.ts.
 */
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });
