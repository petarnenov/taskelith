## Why

The G3 item 0 revalidation (`revalidate-g3-foundations`) of item 8 (`define-product-ports`) found that the product ports contract does not tie its product writers to the G2 launch invalidation protocol: deciding a spec approval, the conflict flow and the return to Specify, and the use of standing rules (review pass 1 H1, lowered to Medium by review pass 2 M1). The [launch authorization contract](/docs/contracts/launch-authorization.md) section 5 already binds every writer of a compared value, and [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 defers those writers and re-admission to G3. What is missing is the binding reference in the product contract, the waits after a revocation, the transaction of a standing rule use, and the race tests the implementing items must add.

## What Changes

- `docs/contracts/product-ports.md` section 4.1: every transaction that changes a spec gate's state, deciding a `spec-approval` item (item 22), making a passed spec gate stale, and reopening it, is an invalidating writer of launch authorization section 5; "After a revocation" states what the task waits for: the revoked attempt's end or reconciliation, then a re-admission by the writer of admissions of G3 plan item 44.
- Section 5: a "Use transaction" bullet, the `SERIALIZABLE` reads and checks of a standing rule use (rule, the run's current policy revision, the attempt, the task's ownership generation and admission, the request's attempt generation), and an "Invalidation" bullet: recording, revoking, or using a rule revokes no grant unless it changes the run's policy revision, and a command that does is an invalidating writer by run.
- Section 6.3: an "Invalidation" bullet that binds the new artifact revisions of the conflict flow and the return to Specify (item 24) to launch authorization section 5, with the update of the run's current revision and the stale gates in the same transaction, and a return to Specify without a new revision to the cancellation writer by assignment.
- `docs/g3-plan.md` item 44: also re-admits a task whose launch grant a product writer revoked (review pass 2 M3; plan amendment decided by the owner's away delegate on 2026-10-27, relayed by the coordinator, pending the owner's confirmation).
- Section 7: launch invalidation race tests for items 18, 22, 23, and 24, and for the item that adds a command that changes the run's policy revision.
- `product-ports` spec: modifies "Standing approval rules recorded and audited" (a scenario); adds "Product writers invalidate launches", "Revoked attempt ends before re-admission", and "Standing rule use checked in one transaction".

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ports`: modifies "Standing approval rules recorded and audited"; adds "Product writers invalidate launches", "Revoked attempt ends before re-admission", and "Standing rule use checked in one transaction".

## Impact

The product ports contract, the `product-ports` spec, and item 44's row of the G3 work plan. No code changes: G2 has no writer of these values (design D1). The launch authorization contract is unchanged. The comparison semantics of policy revisions stay with `align-product-ports-with-g2-lifecycle` (design D4).
