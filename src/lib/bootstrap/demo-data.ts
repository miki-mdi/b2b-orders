/**
 * Single source of truth for the local-only demo dataset (see
 * demo-data/local-only/README.md) - the six demo seller tenants, the five
 * demo buyer accounts, and the exact relationship matrix between them.
 * Shared by prisma/create-local-demo-accounts.ts and
 * prisma/seed-local-demo-relationships.ts so the two scripts can never
 * drift out of sync with each other about which tenant/buyer/customer code
 * is supposed to exist.
 *
 * Every email uses the clearly-fake ".demo.local" domain, distinct from
 * this project's existing ".test" dev-seed accounts (seller-admin@beta.test
 * etc.) and from any real domain - these are local-only, fictional
 * accounts, never meant to be reachable or to resemble a real address.
 */

export type DemoTenantSpec = {
  /** The real, publicly-known company name, used here ONLY as a clearly-marked local demo label - see the README's disclaimer. */
  name: string;
  slug: string;
  defaultVatRate: string;
  adminEmail: string;
  adminName: string;
};

export const DEMO_TENANTS: readonly DemoTenantSpec[] = [
  {
    name: "Скопска пивара",
    slug: "skopska-pivara",
    defaultVatRate: "18",
    adminEmail: "admin@skopska-pivara.demo.local",
    adminName: "Skopska Pivara Demo Admin",
  },
  {
    name: "Прилепска пивара",
    slug: "prilepska-pivara",
    defaultVatRate: "18",
    adminEmail: "admin@prilepska-pivara.demo.local",
    adminName: "Prilepska Pivara Demo Admin",
  },
  {
    name: "Експанда",
    slug: "ekspanda",
    defaultVatRate: "18",
    adminEmail: "admin@ekspanda.demo.local",
    adminName: "Ekspanda Demo Admin",
  },
  {
    name: "Пекабеско",
    slug: "pekabesko",
    defaultVatRate: "18",
    adminEmail: "admin@pekabesko.demo.local",
    adminName: "Pekabesko Demo Admin",
  },
  {
    name: "Гемак цигари",
    slug: "gemak-cigari",
    defaultVatRate: "18",
    adminEmail: "admin@gemak-cigari.demo.local",
    adminName: "Gemak Cigari Demo Admin",
  },
  {
    name: "Атлантик трејд",
    slug: "atlantik-trejd",
    defaultVatRate: "18",
    adminEmail: "admin@atlantik-trejd.demo.local",
    adminName: "Atlantik Trejd Demo Admin",
  },
] as const;

export type DemoBuyerSpec = { email: string; name: string };

export const DEMO_BUYERS: readonly DemoBuyerSpec[] = [
  { email: "buyer1@demo.local", name: "Demo Buyer One" },
  { email: "buyer2@demo.local", name: "Demo Buyer Two" },
  { email: "buyer3@demo.local", name: "Demo Buyer Three" },
  { email: "buyer4@demo.local", name: "Demo Buyer Four" },
  { email: "buyer5@demo.local", name: "Demo Buyer Five" },
] as const;

export type DemoActiveRelationship = { buyerEmail: string; tenantSlug: string; customerCode: string };
export type DemoPendingSellerInvite = { buyerEmail: string; tenantSlug: string; customerCode: string };
export type DemoPendingBuyerRequest = { buyerEmail: string; tenantSlug: string };

/**
 * buyer1 is ACTIVE with all six sellers (seller-switcher test case).
 * buyer2 is ACTIVE with Prilepska Pivara + Pekabesko. buyer3 is ACTIVE with
 * Ekspanda only. Every (buyerEmail, tenantSlug, customerCode) triple here
 * corresponds to exactly one `code` cell in that tenant's customers.csv
 * (demo-data/local-only/<slug>/customers.csv) - see the README's matrix.
 */
export const DEMO_ACTIVE_RELATIONSHIPS: readonly DemoActiveRelationship[] = [
  { buyerEmail: "buyer1@demo.local", tenantSlug: "skopska-pivara", customerCode: "SKP-B1" },
  { buyerEmail: "buyer1@demo.local", tenantSlug: "prilepska-pivara", customerCode: "PRI-B1" },
  { buyerEmail: "buyer1@demo.local", tenantSlug: "ekspanda", customerCode: "EXP-B1" },
  { buyerEmail: "buyer1@demo.local", tenantSlug: "pekabesko", customerCode: "PEK-B1" },
  { buyerEmail: "buyer1@demo.local", tenantSlug: "gemak-cigari", customerCode: "GEM-B1" },
  { buyerEmail: "buyer1@demo.local", tenantSlug: "atlantik-trejd", customerCode: "ATL-B1" },
  { buyerEmail: "buyer2@demo.local", tenantSlug: "prilepska-pivara", customerCode: "PRI-B2" },
  { buyerEmail: "buyer2@demo.local", tenantSlug: "pekabesko", customerCode: "PEK-B2" },
  { buyerEmail: "buyer3@demo.local", tenantSlug: "ekspanda", customerCode: "EXP-B3" },
] as const;

/** buyer4: one PENDING invitation sent BY Prilepska Pivara, not yet accepted - tests the buyer's accept/decline screen on /connections. */
export const DEMO_PENDING_SELLER_INVITES: readonly DemoPendingSellerInvite[] = [
  { buyerEmail: "buyer4@demo.local", tenantSlug: "prilepska-pivara", customerCode: "PRI-B4" },
] as const;

/** buyer5: one PENDING request sent TO Atlantik Trejd, not yet approved - tests the seller's "Buyer requests" screen. No customer code - buyer-initiated requests start with no linked Customer. */
export const DEMO_PENDING_BUYER_REQUESTS: readonly DemoPendingBuyerRequest[] = [
  { buyerEmail: "buyer5@demo.local", tenantSlug: "atlantik-trejd" },
] as const;

/** Every demo tenant's price-lists.csv defines exactly one price list with this code - the one every ACTIVE demo relationship's Customer should end up assigned to. */
export const DEMO_STANDARD_PRICE_LIST_CODE = "STD";
