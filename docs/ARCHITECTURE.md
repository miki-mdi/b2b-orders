# Architecture

## 1. Guiding constraint

Avoid overengineering, but don't design into a corner. Concretely: **start as a well-structured modular monolith**, not microservices. The places we pay a little extra up front are the ones expensive to retrofit: tenant isolation, price/audit history, a clean seam for a future public API, and — following the pre-implementation review — an identity model that supports more than one organization per person.

## 2. High-level system diagram

```
                         ┌─────────────────────────────┐
                         │        Next.js App           │
                         │  (App Router, TypeScript)     │
                         │                               │
  Buyer (browser) ──────►│  UI: Server + Client Components
  Seller (browser) ─────►│  Data: Server Actions / Route Handlers (/api/*)
  Platform Admin ───────►│  Auth: Auth.js (NextAuth), active-membership session
                         └──────────────┬────────────────┘
                                        │ Prisma Client (tenant-scoped extension)
                                        ▼
                         ┌─────────────────────────────┐
                         │  PostgreSQL (RLS enabled)     │
                         │  — managed cloud instance      │
                         └─────────────────────────────┘
                                        │
                         ┌──────────────┴────────────────┐
                         ▼                                ▼
                 Object storage (S3-compatible)   Email provider (transactional)
                 (product images, CSV import/export)
```

No separate backend service at MVP: Next.js Route Handlers/Server Actions *are* the API layer — the seam a future public API and ERP integration will reuse.

## 3. Technology choices

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Given as the assumed stack; App Router's Server Components suit a data-heavy back-office + storefront-like app well |
| Database | PostgreSQL | Strong RLS support (critical for tenant isolation, confirmed day-one per [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md)), mature, well-supported by future ERP/BI tools |
| ORM | Prisma | Migrations + type-safe client; Prisma's `$extends` mechanism auto-injects tenant scoping, and interactive transactions (`$transaction`) carry the per-request `SET LOCAL app.current_tenant_id` needed for RLS |
| Styling | Tailwind CSS | Fine for a data-dense CRUD-heavy app |
| Auth | **Auth.js (NextAuth v5)**, credentials provider, JWT sessions with per-request re-resolution | Chosen over a hosted IdP to avoid vendor lock-in cost at this stage. Sessions resolve to an **active membership** (`TenantMembership` or `CustomerMembership`, see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §4), not just a user — auto-selected when a user has exactly one (the MVP-typical case); a switcher UI is Phase 2, added once real multi-membership usage appears (see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)). Sessions are **JWT-based**, not database-backed — Auth.js's Credentials provider hard-requires this (see [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §5 for the full discovery/resolution). A suspended tenant or deactivated membership is instead force-revoked by re-resolving the active membership from the database on every request's `jwt` callback, which gives the same next-request revocation guarantee without a deletable session row |
| File storage | S3-compatible cloud object storage (e.g. Cloudflare R2 or AWS S3) | Product images, CSV import/export files |
| Background/async work | None at MVP beyond synchronous Route Handler processing; revisit with a real queue once CSV imports or notification volume justify it | Avoids adding Redis/a worker fleet before there's proven need |
| Email | Transactional email API (e.g. Resend/Postmark/SES) | Order-status and account notifications |
| i18n | `next-intl` | Macedonian (Cyrillic) + English from day one |
| Validation | `zod`, shared between client forms and Server Action/Route Handler input validation | Single source of truth for input shape |
| Hosting | **Cloud-first, managed services only** — Vercel-compatible hosting for the Next.js app, managed cloud Postgres (e.g. Neon/RDS) | MVP is explicitly not designed or built for on-premise deployment (locked decision); this keeps operational burden low for a small team. If a specific future customer requires on-prem or data residency, that is a deliberate later evaluation (see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)), not a constraint carried into MVP design |

## 4. Application layering

```
app/                     → routes (App Router), grouped by (platform)/(seller)/(buyer)
components/               → UI components (shared + per-audience)
lib/
  auth/                    → Auth.js config, active-membership resolution & session helpers
  db/                      → Prisma client singleton, tenant-scoped client extension, RLS transaction helper
  domain/                  → business logic per bounded area
    orders/
      order-service.ts      → status transitions, quantity-adjustment auditing (ORDER_WORKFLOW.md's state machine lives here)
    pricing/
    catalog/                 → products, ProductUnit/packaging logic
    customers/                → customers, addresses, memberships
  validation/              → zod schemas
prisma/
  schema.prisma
  migrations/
```

Business rules (order state machine, price resolution, min-qty/increment validation, audit-entry writing) live in `lib/domain/*`, called from both Server Actions and Route Handlers — never duplicated between a "buyer submits order" path and a "seller creates order on behalf of customer" path, since those are the same domain operation with a different actor.

## 5. Multi-tenant request flow

1. User authenticates (Auth.js); session resolves an **active membership** (`TenantMembership` or `CustomerMembership`), carrying `userId`, `role`, `tenantId`, and (buyer-side) `customerId`.
2. Every server-side data access goes through a **tenant-scoped Prisma client** (a Prisma Client Extension) constructed from the session's active `tenantId` for that request.
3. Within the same database transaction, `app.current_tenant_id` is set via `SET LOCAL`, activating PostgreSQL RLS policies as an independent second enforcement layer (details in [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §2).

## 6. Designing for future extensibility without building it now

| Future need | How today's architecture avoids blocking it |
|---|---|
| Public API | `lib/domain/*` already separates business logic from HTTP concerns; a versioned `/api/v1/*` public surface is additive |
| ERP/accounting integration | Full order-line snapshotting ([DATABASE_DESIGN.md](DATABASE_DESIGN.md) §6) and the audit log mean historical data is already export-ready |
| Native mobile app | Domain logic isn't tied to Server Components; a future mobile app consumes the same eventual public API |
| SaaS billing / self-serve signup | `Tenant.status`/`subscriptionPlan`/`subscriptionStatus` placeholders mean adding real billing is additive |
| Multi-currency / multi-VAT | Already represented in the schema (tenant default + per-product override, both usable in MVP); only multi-currency-per-tenant UI is deferred |
| Additional roles (Sales Rep, Warehouse, Driver, Buyer Employee) | Role lives on the membership row already; enabling a new role is a permissions-matrix + UI change |
| One person, multiple organizations | `User` + `TenantMembership`/`CustomerMembership` supports this from day one; only the org-switcher UI is deferred |
| Per-customer/per-route hard order cut-offs | `Tenant.cutOffTime`/`cutOffEnforcement` already exist; MVP just never sets enforcement to `HARD_BLOCK` |
| On-prem/self-hosted deployment | Not designed for now (locked decision); nothing in the stack is Vercel-proprietary, so this remains *possible* later without being a design goal today |

## 7. What we are deliberately not building yet

- No microservices, no message bus/event sourcing.
- No GraphQL layer.
- No multi-region/read-replica setup.
- No on-prem deployment tooling (cloud-first only, per locked decision).
