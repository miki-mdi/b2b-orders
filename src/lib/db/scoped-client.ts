import { prismaBase } from "./prisma";
import { getCurrentTenantContext, requireTenantId } from "./tenant-context";
import {
  CUSTOMER_SELF_SCOPED_MODEL,
  isCustomerScopedModel,
  isTenantScopedModel,
} from "./tenant-scoped-models";

/**
 * Layer 2 of isolation (docs/SECURITY_AND_MULTI_TENANCY.md §3): a Prisma
 * Client Extension that auto-injects `tenantId` - and, for buyer sessions,
 * `customerId` - into every query and write against a scoped model, read
 * from the AsyncLocalStorage context set by withTenantContext /
 * withCustomerContext (./with-tenant.ts).
 *
 * Domain code should never import `prismaBase` directly for a scoped model -
 * only this `prisma` export, and only from inside withTenantContext /
 * withCustomerContext. Calling it outside that context throws
 * (TenantContextMissingError) rather than silently running an unscoped query.
 */
export const prisma = prismaBase.$extends({
  name: "tenant-and-customer-scoping",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !isTenantScopedModel(model)) {
          return query(args);
        }

        const context = getCurrentTenantContext();
        const tenantId = requireTenantId(context?.tenantId);

        let scopedArgs = mergeScope(operation, args, "tenantId", tenantId);

        if (context?.customerId) {
          if (isCustomerScopedModel(model)) {
            scopedArgs = mergeScope(operation, scopedArgs, "customerId", context.customerId);
          } else if (model === CUSTOMER_SELF_SCOPED_MODEL && !CREATE_OPERATIONS.has(operation)) {
            // Customer IS the buyer company - a buyer session scopes it by
            // its own `id`, never by creating new Customer rows.
            scopedArgs = mergeScope(operation, scopedArgs, "id", context.customerId);
          }
        }

        return query(scopedArgs);
      },
    },
  },
});

/**
 * The transaction-client type Prisma passes into `prisma.$transaction(async (tx) => ...)`
 * callbacks, derived from our own extended client rather than the generic
 * `Prisma.TransactionClient` - the two are NOT interchangeable (an extended
 * client's transaction callback carries the extension, the generic type
 * doesn't). This is Prisma's own documented pattern for typing a shared
 * function that receives a transaction client from an extended PrismaClient.
 */
export type ScopedTransactionClient = Parameters<Parameters<(typeof prisma)["$transaction"]>[0]>[0];

const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

// Prisma's per-operation `args` shapes are all structurally different and
// the extension API types them loosely (`unknown`/generic) by design - this
// function's whole job is to poke one scalar field into whichever of
// `where` / `data` / `create` / `update` the operation has, so a narrow set
// of targeted `any`s here is more honest than a large union type that adds
// no real safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeScope(operation: string, args: any, field: string, value: string): any {
  switch (operation) {
    case "findUnique":
    case "findUniqueOrThrow":
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "count":
    case "aggregate":
    case "groupBy":
    case "update":
    case "delete":
    case "updateMany":
    case "deleteMany":
      return { ...args, where: { ...(args?.where ?? {}), [field]: value } };

    case "create":
      return { ...args, data: { ...(args?.data ?? {}), [field]: value } };

    case "createMany":
    case "createManyAndReturn": {
      const rows = Array.isArray(args?.data) ? args.data : [args?.data];
      return { ...args, data: rows.map((row: object) => ({ ...row, [field]: value })) };
    }

    case "upsert":
      return {
        ...args,
        where: { ...(args?.where ?? {}), [field]: value },
        create: { ...(args?.create ?? {}), [field]: value },
        update: { ...(args?.update ?? {}), [field]: value },
      };

    // Operations without a natural place for a scope filter (e.g. raw
    // queries reached via $allOperations) pass through untouched; they must
    // not be used against scoped models outside withTenantContext /
    // withCustomerContext, where RLS (Layer 3) is still the enforcing backstop.
    default:
      return args;
  }
}
