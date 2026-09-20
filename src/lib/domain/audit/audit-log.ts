import type { ActingContext } from "@prisma/client";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";

/**
 * Writes one AuditLogEntry row. Always called from inside the SAME
 * withTenantContext/withCustomerContext transaction as the mutation it
 * documents, so the audit record and the change it describes commit or
 * roll back together - see docs/SECURITY_AND_MULTI_TENANCY.md §7.
 *
 * `oldValue`/`newValue` are plain JSON-stringified snapshots of the
 * relevant entity state, not single-field diffs - catalog entities don't
 * have the kind of single-field business meaning an order's quantity
 * adjustment does (docs/ORDER_WORKFLOW.md §4), so a whole-row snapshot is
 * the more honest record of "what changed" here.
 */
export type AuditAction = "CREATE" | "UPDATE" | "DEACTIVATE" | "REACTIVATE";

export type WriteAuditLogEntryInput = {
  tenantId: string;
  actorUserId: string;
  actingContext: ActingContext;
  entityType: string;
  entityId: string;
  action: AuditAction;
  // Set for a granular field-level change (e.g. a seller adjusting one
  // OrderLine's confirmedQty) as opposed to a whole-row CREATE/UPDATE
  // snapshot - see docs/DATABASE_DESIGN.md §3's AuditLogEntry example and
  // docs/ORDER_WORKFLOW.md §4. The column has existed on AuditLogEntry
  // since Phase 0; this helper just never plumbed it through until Phase 1D
  // needed its first genuinely field-level audit entry.
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
};

export function writeAuditLogEntry(tx: ScopedTransactionClient, input: WriteAuditLogEntryInput) {
  return tx.auditLogEntry.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actingContext: input.actingContext,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      fieldName: input.fieldName,
      oldValue: input.oldValue !== undefined ? JSON.stringify(input.oldValue) : null,
      newValue: input.newValue !== undefined ? JSON.stringify(input.newValue) : null,
      reason: input.reason,
    },
  });
}
