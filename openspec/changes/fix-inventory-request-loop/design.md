## Context

`receivePart` in `apps/control-plane/src/application/inventory-reconciliation.ts` stores each authenticated inventory report part. Before this change it ended with:

```ts
const unsolicited = !fresh && !pending.some((stored) => stored.reportId === part.reportId);
```

A part is fresh only when its `requestId` is the worker's current request (`isFreshReport`, `packages/modules/execution/src/domain/inventory.ts`). So an answer to a superseded request counted as unsolicited and called `requestInventory`.

## Root cause

1. Two requests can be outstanding at once, for example one sent at a reconnect and one sent by `applySnapshot` for an unclassifiable omission (line 162). They are sent in separate transactions; `requestInventory` deduplicates only within one transaction (line 33).
2. The worker answers every request with a new snapshot whose `snapshot` number grows, so each answer is the highest received and is not discarded (line 79).
3. When the answer to the first request arrives, the second is current, so the answer is not fresh, counts as unsolicited (line 86), and issues a third request. The answer to the second request is now stale too, and issues a fourth, and so on.

The exchange keeps two requests outstanding forever. In G2 this showed as about 80 requests every 3 seconds.

The specification already disagrees with the code: scenario "Unsolicited report" defines an unsolicited report as one without a `requestId`, and the wire contract (section 6, "Inventory request") names only a reconnect and an unclassifiable omission as triggers.

## Decision 1: option A

Only a part without a `requestId` is unsolicited:

```ts
const unsolicited = part.requestId === undefined && !pending.some((stored) => stored.reportId === part.reportId);
```

An answer to a superseded request is stored, filtered, and applied exactly as before; it only no longer requests inventory by itself. The coordinator chose this option on 2026-10-26.

## Decision 2: option 1, the omitted-assignment request

Option A left the request of `applySnapshot` for an unclassifiable omission, which fired for every snapshot that is not fresh. The author showed that it still loops (see "Residual risk" below), and the coordinator chose option 1 on 2026-10-26: only an unsolicited snapshot, one without a `requestId`, requests inventory for such an omission.

```ts
const unsolicited = snapshot.requestId === undefined;
return unclassified && unsolicited ? requestInventory(tx, snapshot.workerId, context) : ok(undefined);
```

- An answer to a superseded request still re-sends the offer while no grant is recorded. It requests nothing, because a newer request is outstanding: the worker answers it with a fresh snapshot, taken after that request arrived, and a fresh snapshot handles the omission (scenario "Fresh snapshot omits an undelivered offer").
- An unsolicited snapshot, sent at a reconnect, still requests inventory as before (scenario "Offer not yet received").
- A fresh snapshot is unchanged: it never requested inventory for an omission.
- `applySnapshot` no longer takes the `fresh` flag, which only this condition read.

This is option C below, rejected for the first decision and chosen now as the bound of the residual loop. It was rejected first because it changes a requirement the coordinator had kept; the coordinator lifted that limit once the loop was shown.

## Rejected options

- **B: an "answered" state for requests.** Record each request as answered and treat an answer to an older, answered request as settled. It needs a new column in `inventory_requests` and a migration, and it changes the request lifecycle that the requirements "Inventory request" and "Pending snapshot bound" describe, for a defect that one condition fixes.
- **C: narrow "Omitted assignments"** (for decision 1). Request inventory at line 162 only for a snapshot without a `requestId`. It was out of decision 1's scope; decision 2 adopts it.

## Residual risk under option A alone

The coordinator asked whether line 162 could still re-request on every stale answer, both after the omitted assignment finishes and while it stays active.

- **After the assignment finishes, it settles.** `applySnapshot` considers only `tx.assignments.listUnfinishedByWorker` (line 153), so a finished assignment is never an omission and requests nothing. It also settles once the worker's acceptance is applied: the snapshot then lists the assignment, or its omission is classified as lost local history, which requests nothing.
- **While the assignment stays active and every snapshot omits it, it did not settle.** Under two outstanding requests:
  1. The answer to the first request is not fresh, so with option A `receivePart` requests nothing (line 86).
  2. `evaluateSnapshots` applies it (line 143). `applySnapshot` finds the active assignment omitted without an applied acceptance, so `classifyOmission` returns `unclassified` (`packages/modules/execution/src/domain/inventory.ts`, line 156). It re-sends the offer and, as the snapshot is not fresh, requests inventory (line 162 before decision 2).
  3. The new request supersedes the second one, whose answer is then stale too and repeats step 2.

  An integration test answered 20 requests in turn and found 22 requests and 21 offers: one request and one re-sent offer per answer. Decision 2 closes this loop; the test is now committed.

## Refused offer

A worker that cannot admit an offer journals the outcome `rejected` (`apps/worker/src/command-intake.ts`, lines 100 to 109) and publishes it as `execution.assignment.refused` (`apps/worker/src/observation-messages.ts`, lines 27 to 31). The control plane applies it through `refusal` (`apps/control-plane/src/application/observation-effects.ts`, lines 82 to 88, registered at line 324), which ends the assignment and releases its reservation. An ended assignment is no longer unfinished, so no later snapshot omits it, and the exchange settles. This holds under option A alone too; a test covers it.

A retryable refusal may lead placement to offer a new attempt later. That is a new assignment under placement's backoff, not a request of this exchange.
