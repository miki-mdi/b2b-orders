# Order Workflow

## 1. Review of the originally proposed workflow

Original proposal:
`DRAFT → SUBMITTED → CONFIRMED → PICKING → READY → OUT_FOR_DELIVERY → DELIVERED`, plus `PARTIALLY_CONFIRMED`, `CANCELLED`, `RETURNED`.

Issues identified:

1. **`PARTIALLY_CONFIRMED` as a top-level status is ambiguous.** "Partial" is a property of *which lines* got confirmed at what quantity, not a distinct stage in the pipeline. **Recommendation (adopted):** drop it as a status. Each order line carries `requestedQty` and `confirmedQty`; the order exposes a derived flag `hasAdjustments = any line where confirmedQty != requestedQty`. The order's actual status is still `CONFIRMED`.
2. **`CANCELLED` conflates two very different actors/timings.** **Recommendation (adopted):** keep one `CANCELLED` status but require `cancelledBy` (BUYER/SELLER/SYSTEM) and `cancelReason`.
3. **`RETURNED` as an order-level status is too coarse** for what's usually a partial, post-delivery event. **Recommendation (adopted, and now explicitly locked as a business rule):** no full Returns module in MVP. `Order.deliveredWithIssues` + a note is the MVP-level signal; `OrderLine.confirmedQty`/`deliveredQty` are preserved specifically so a proper line-level Return/Claim entity can be added in Phase 2 without touching historical order data (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §8).
4. **Missing: what happens when a seller doesn't act before cut-off / at all?** This remains an operational alert (notification + dashboard highlight), not a new status.
5. **`DRAFT` needs a clear definition.** Unchanged: the live cart is not a persisted `Order`; `DRAFT` is reserved for a saved-for-later order a buyer explicitly names and stores.

## 2. Recommended state machine (MVP) — unchanged

```
                 ┌────────────────────────────────────────────┐
                 │                                              │
 (saved order,   ▼                                              │
  optional) DRAFT ──submit──► SUBMITTED ──confirm──► CONFIRMED  │
                                  │                       │      │
                                  │cancel                 │cancel│
                                  ▼                       ▼      │
                              CANCELLED               CANCELLED  │
                                                           │      │
                                                     start picking
                                                           ▼
                                                        PICKING
                                                           │ picked
                                                           ▼
                                                         READY
                                                           │ dispatch
                                                           ▼
                                                 OUT_FOR_DELIVERY
                                                           │ deliver
                                                           ▼
                                                       DELIVERED  ─┘
                                                   (terminal; may be
                                                    flagged deliveredWithIssues)
```

### Status definitions — unchanged

| Status | Meaning | Set by |
|---|---|---|
| `DRAFT` | Buyer saved an order without submitting (optional path) | Buyer |
| `SUBMITTED` | Buyer submitted; awaiting seller review | Buyer (or Seller, when entering an order on a customer's behalf) |
| `CONFIRMED` | Seller has reviewed and committed to quantities (per-line `confirmedQty`, possibly adjusted, each adjustment audited — see §4) | Seller |
| `CANCELLED` | Order will not be fulfilled. Carries `cancelledBy` + `cancelReason` | Buyer or Seller |
| `PICKING` | Warehouse is assembling the confirmed items | Seller/Warehouse |
| `READY` | Order is packed and staged for dispatch | Seller/Warehouse |
| `OUT_FOR_DELIVERY` | Order has left for delivery | Seller/Driver |
| `DELIVERED` | Order was delivered. Terminal. Optional `deliveredWithIssues` boolean + note | Seller/Driver |

## 3. Editing and cancellation rules — locked

- **A Buyer cannot directly edit a `SUBMITTED` order.** Line items, quantities, and delivery address are fixed once submitted (the delivery address is in fact already snapshotted onto the order at submission — see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §6 — so there is no live address to edit).
- **A Buyer may request cancellation while the order is `SUBMITTED`.** Because nothing has been confirmed or allocated yet, this resolves immediately (`cancelledBy = BUYER`) — no seller approval step is needed at this stage.
- **Once `CONFIRMED`, cancellation requires the Seller** (goods may already be allocated); MVP handles this as a manual Seller action (e.g., following a phone call), not a guided buyer-request/seller-approve sub-flow — revisit if this proves insufficient once there's real usage.
- **Once `PICKING` has started, cancellation is an edge case** handled manually by the Seller Admin, not a guided flow.
- **The Seller may adjust quantities during confirmation** (`CONFIRMED` step) — this is the one point in the flow where the seller can change what the buyer asked for, and it is the reason §4's audit requirement exists.

## 4. Auditability of seller adjustments — locked

Every seller-side change to a submitted order — a quantity adjustment at confirmation, marking a line unavailable, or a seller-initiated cancellation — must write an `AuditLogEntry` capturing who made the change, when, the old value, the new value, and a reason where applicable (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §3 and [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §7). This is enforced at the domain-service level (`lib/domain/orders/order-service.ts` per [ARCHITECTURE.md](ARCHITECTURE.md)) so it cannot be bypassed by a code path that mutates an `OrderLine` directly.

## 5. Order cut-off time — locked as soft warning for MVP

- **MVP behavior**: if a buyer is placing/selecting a delivery date past the tenant's configured `cutOffTime` for that day, the UI shows a warning (e.g., "orders after 14:00 may not be processed for tomorrow's delivery") but **does not block submission**. `Order.cutOffWarningShown` records whether this was shown, for later analysis of how often it's actually respected.
- **Architecture**: `Tenant.cutOffTime` and `Tenant.cutOffEnforcement` (`SOFT_WARNING` | `HARD_BLOCK`) already exist on the tenant (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §3) so that a future hard cut-off — potentially varying by customer or delivery route rather than only by tenant — is a configuration and domain-logic change, not a schema migration touching historical orders.

## 6. Notifications tied to transitions

| Transition | Notify |
|---|---|
| `SUBMITTED` | Seller (new order) |
| `CONFIRMED` (with adjustments) | Buyer (quantities changed, with reason) |
| `OUT_FOR_DELIVERY` | Buyer |
| `DELIVERED` | Buyer (receipt confirmation) |
| `CANCELLED` | Whichever party didn't initiate it |

MVP may implement these as in-app + email only; SMS/WhatsApp/push are Phase 2.

## 7. Open questions

See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) — remaining items include price-change-between-submission-and-confirmation handling and minimum order value.
