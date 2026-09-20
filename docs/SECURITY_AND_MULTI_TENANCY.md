# Security and Multi-Tenancy

Tenant isolation is the single most important non-functional requirement of this system: a bug that leaks Seller A's customer list, prices, or orders to Seller B is not a minor bug for a B2B ordering platform — it can end a seller's willingness to use the product at all. This document treats it accordingly, with layered (defense-in-depth) enforcement rather than a single mechanism.

> **Revision note**: this version reflects two explicit decisions from the pre-implementation architecture review: (1) the user model is now `User` + `TenantMembership`/`CustomerMembership` rather than separate `SellerUser`/`CustomerUser` tables (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §4), and (2) RLS is confirmed **enabled from day one**, not deferred to a later hardening phase (§2 below resolves that question explicitly).

## 1. Threat model summary

| Actor | What they must not be able to do |
|---|---|
| A Buyer (any `CustomerMembership`) | See any other Customer's prices, orders, addresses, or users — even another Customer of the *same* Seller |
| A Seller's staff (`TenantMembership`) | See any other Tenant's customers, products, prices, or orders |
| A Platform Admin | Read a tenant's commercial data (orders, prices, customer lists) without an explicit, audited support-access action |
| Any authenticated user | Escalate their own role, act under a membership they don't hold, or access another user's session |
| An unauthenticated request | Read or write any tenant data, including via a guessed/enumerated ID |

## 2. RLS: enabled from day one — the decision

This was explicitly re-evaluated before implementation: **should RLS be enabled from day one, or should application-level scoping ship first with RLS added during a later security-hardening phase?**

**Decision: RLS is enabled from day one, alongside application-level scoping, not deferred.** Reasoning:

- The instruction guiding this review was explicit — security must remain production-grade, and isolation must not be weakened *merely for implementation convenience*. Deferring RLS to "later" is exactly that trade: it ships MVP faster at the cost of running the highest-stakes requirement in the system on a single enforcement layer (application code) during the period when the codebase is changing fastest and getting the least scrutiny.
- The actual cost of RLS is a **bounded, one-time setup**, not ongoing complexity: policies are written once per table (a small, repeatable pattern — see below) and covered by the isolation test suite. It does not need to be revisited per-feature the way, say, a caching layer would.
- The genuine complexity is operational, not architectural — see the connection-pooling caveat immediately below — and that's a hosting/config verification task for Phase 0, not a reason to skip the mechanism.

### Implementation approach

- Every tenant-owned table has RLS enabled with a policy filtering on `"tenantId" = current_setting('app.current_tenant_id', true)` (plain text comparison, no `::uuid` cast - Prisma's `String @id @default(uuid())` generates `TEXT` columns with client-generated values, not Postgres's native `uuid` type; see `prisma/rls/policies.sql` for the actual policies and `prisma/schema.prisma`'s header comment for the camelCase-column naming convention this follows).
- The application sets `app.current_tenant_id` via `SET LOCAL` **inside the same database transaction** as the query it protects, using Prisma's interactive transactions (`prisma.$transaction(async (tx) => { ... })`), so the setting is scoped to that one transaction and can't leak across requests on a pooled connection.
- **Connection-pooling caveat (flagged as an open item, see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) §17)**: `SET LOCAL` requires the transaction to run on a stable connection for its duration. This works correctly with Postgres's own connection handling and with pooling in *session* mode, but can misbehave with PgBouncer-style poolers in *transaction* pooling mode if not configured carefully. This must be verified against whichever managed Postgres provider is actually selected in Phase 0, before relying on it in production — not assumed to "just work."

### Where RLS sits relative to application-level scoping

RLS is the **second, independent layer**, not a replacement for application-level scoping (§3, Layer 2) — both are required. This is deliberate redundancy: application-level scoping is what developers interact with day to day and is nearly always sufficient on its own, but RLS is what catches the case where a developer bypasses or forgets it (a rushed raw query, a new contributor unfamiliar with the convention, a bug in the Prisma extension itself).

## 3. Authorization & tenant isolation — layered enforcement

### Layer 1 — Session-derived active-membership scope
Every authenticated session resolves to exactly one **active membership** (see [USER_ROLES_AND_PERMISSIONS.md](USER_ROLES_AND_PERMISSIONS.md) §5), which carries `role` and `tenantId` (and `customerId` for buyer-side memberships). This is the single source of truth for "who is asking, and in what capacity" on every request; it is never accepted as a client-supplied parameter — a request body/query string can claim any `tenantId` it wants and it is always ignored in favor of the session's active membership.

### Layer 2 — Tenant-scoped data access layer (application enforcement)
All Prisma access for tenant-owned tables goes through a **Prisma Client Extension** constructed per-request from the active membership's `tenantId`, which automatically injects `where: { tenantId }` into every query and every write. Domain code (`lib/domain/*`) never sees a raw, unscoped Prisma client for tenant tables.

### Layer 3 — PostgreSQL Row-Level Security
As detailed in §2 — enabled from day one, `app.current_tenant_id` set per-transaction from the same session-derived `tenantId` used in Layer 2.

`PLATFORM_ADMIN` operations run against tenant-management tables (`Tenant`, the platform-scoped fields of `User`) which are not subject to tenant RLS policies at all, since they are not tenant-owned data. Any future "support access" to a tenant's commercial data must go through an explicit, logged elevation (e.g. a time-boxed `app.current_tenant_id` grant tied to a support ticket), never a blanket admin bypass.

### Layer 4 — Authorization checks per action
Role checks (e.g., only `SELLER_ADMIN` can confirm an order; only `BUYER_ADMIN` can manage company users/addresses) are enforced in `lib/domain/*` service functions, independent of tenant scoping — tenant isolation answers "which rows," role checks answer "which operations." Both must pass.

## 4. Multi-membership implication

Because a `User` may hold more than one `TenantMembership`/`CustomerMembership` (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §4), the active-membership resolution in Layer 1 is itself security-relevant: switching active context must fully replace the session's `tenantId`/`role` (and, in Layer 3, the `app.current_tenant_id` set on subsequent transactions), never merge or accumulate scope across memberships. MVP ships without a switcher UI (auto-selects the single membership almost all users will have), but the underlying session mechanism is built to swap cleanly, since retrofitting this later — after Layer 1-3 code assumes "one session, one tenant, forever" — would be exactly the kind of rearchitecture this review is meant to avoid.

## 5. Authentication

> **Implementation note (Phase 1E)**: this section originally called for database-backed sessions. During Phase 0 implementation this proved impossible to get from Auth.js's Credentials provider (see below) — the actual model is JWT sessions with per-request database re-resolution, which delivers the same practical revocation guarantee this section originally wanted. This is a documented, deliberate adaptation, not a weakening: see `src/lib/auth/auth.ts`'s header comment for the original discovery.

- Auth.js (NextAuth v5), credentials provider, passwords hashed with bcrypt (or argon2id — decide at implementation time; either acceptable, plaintext/reversible storage is not).
- **Sessions are JWT-based, not database-backed** — Auth.js (v4 and v5 alike) hard-requires `session.strategy: "jwt"` whenever a Credentials provider is used; there is no supported way to get adapter-persisted sessions out of a username/password sign-in, since the adapter's session-creation path only wires up for provider flows (OAuth) that go through `signIn` with an account to persist. The `Session`/`Account` Prisma models remain in the schema, unused for now, for when an OAuth/SSO provider is added (see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)) — that flow would use true database sessions via `@auth/prisma-adapter`.
- **Revocation, achieved differently than originally planned**: the `jwt` callback re-resolves the signed-in user's active membership from the database on **every request** (`resolveActiveMembership()`, see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §4), not just at sign-in or token refresh. A deactivated user, a revoked membership, or a suspended tenant is therefore reflected on the very next request — the same practical near-immediate revocation the original "database-backed sessions" design wanted, just implemented as a per-request re-check against the database rather than a session row that gets deleted. The trade-off: this costs one extra database read per request (membership lookup, already an indexed, cheap query) that a true revocable database session wouldn't need; it does not weaken the isolation guarantee itself.
- Rate limiting on login and password-reset endpoints (IP + account based).
- MFA: not in MVP; flagged for Phase 2, especially for `SELLER_ADMIN` and `PLATFORM_ADMIN`.

## 6. Data protection

- All traffic over HTTPS/TLS.
- Secrets in environment variables / the host's secret manager, never committed.
- Buyer/Seller PII (contact names, addresses, tax IDs) not logged in plaintext in application logs or included in error-tracking payloads.
- Backups: managed cloud Postgres provider's automated backups (point-in-time recovery) from day one — MVP is cloud-first by design (see [ARCHITECTURE.md](ARCHITECTURE.md) §3), so this is a provider setting, not infrastructure to build.

## 7. Audit trail — including seller order adjustments

`AuditLogEntry` (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §3) records, at minimum:
- Every order status transition (who, when, before/after).
- **Every seller-side adjustment to a submitted order** — quantity changes at confirmation, marking a line unavailable, cancellation — recorded as a field-level entry (`entityType`, `fieldName`, `oldValue`, `newValue`, `reason`) per the locked auditability requirement, not just inferred from the current state of the `OrderLine` row.
- Every price list / price change.
- Every customer product-visibility change.
- Every user/membership creation, deactivation, or role change.

Audit entries are append-only (no update/delete in application code) and themselves tenant-scoped/RLS-protected like any other table.

## 8. Input validation & injection defense

- `zod` schemas validate all Server Action/Route Handler inputs before they reach domain logic.
- Prisma parameterizes all queries by default; any raw SQL must use parameterized `$queryRaw` — string-concatenated raw SQL is a review blocker.
- File uploads (CSV import, product images) validated by content type and size limit server-side; CSV import runs through the same `zod`-validated domain layer as manual entry.

## 9. Tenant isolation testing (concrete, not aspirational)

Per the MVP acceptance criteria in [MVP_SCOPE.md](MVP_SCOPE.md), isolation must be verified by an automated test suite, not manual spot-checking:
- Seed two tenants with overlapping-looking data (same product names, similar customer names) to catch tests that pass by coincidence.
- Seed at least one `User` with memberships in two different tenants, and assert that switching active context fully replaces scope rather than unioning it.
- For every tenant-scoped API surface, assert that Tenant A's session cannot read, update, or delete Tenant B's rows by ID, even when the ID is known/guessed.
- Run this suite in CI on every change to `lib/db/*` or `prisma/schema.prisma`.

## 10. Platform Admin access boundary

Platform Admin's default capability is tenant lifecycle management (create/suspend), not data browsing. Any feature that lets a Platform Admin view a tenant's orders/customers/prices for support purposes must (Phase 2) require an explicit "start support session" action, be time-boxed, and write an audit entry visible to the tenant. See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) on whether granting `isPlatformAdmin` itself should require its own approval step even at MVP.
