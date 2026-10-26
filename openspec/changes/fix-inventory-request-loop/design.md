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

## Decision: option A

Only a part without a `requestId` is unsolicited:

```ts
const unsolicited = part.requestId === undefined && !pending.some((stored) => stored.reportId === part.reportId);
```

An answer to a superseded request is stored, filtered, and applied exactly as before; it only no longer requests inventory by itself. The request of `applySnapshot` for a snapshot that is not fresh and omits an unclassifiable assignment (requirement "Omitted assignments", line 162) is unchanged. The coordinator chose this option on 2026-10-26.

## Rejected options

- **B: an "answered" state for requests.** Record each request as answered and treat an answer to an older, answered request as settled. It needs a new column in `inventory_requests` and a migration, and it changes the request lifecycle that the requirements "Inventory request" and "Pending snapshot bound" describe, for a defect that one condition fixes.
- **C: narrow "Omitted assignments".** Request inventory at line 162 only for a snapshot without a `requestId`. It would close the residual case below too, but it changes a requirement that the coordinator kept, and it drops a request the wire contract names as a trigger. It is out of this change's scope.

## Residual risk: the omitted-assignment request

The coordinator asked whether line 162 can still re-request on every stale answer, both after the omitted assignment finishes and while it stays active.

**After the assignment finishes, it settles.** `applySnapshot` considers only `tx.assignments.listUnfinishedByWorker` (line 153), so a finished assignment is never an omission and requests nothing. It also settles once the worker's acceptance is applied: the snapshot then lists the assignment, or its omission is classified as lost local history, which requests nothing.

**While the assignment stays active and every snapshot omits it, it does not settle.** Under two outstanding requests:

1. The answer to the first request is not fresh, so with option A `receivePart` requests nothing (line 86).
2. `evaluateSnapshots` applies it (line 143). `applySnapshot` finds the active assignment omitted without an applied acceptance, so `classifyOmission` returns `unclassified` (`packages/modules/execution/src/domain/inventory.ts`, line 156). It re-sends the offer and, as the snapshot is not fresh, requests inventory (line 162).
3. The new request supersedes the second one, whose answer is then stale too and repeats step 2.

An integration test (kept outside the repository, see `verification.md`) answered 20 requests in turn and found 22 requests and 21 offers: one request and one re-sent offer per answer. With a single outstanding request the answer is fresh, so only the offer is re-sent (scenario "Fresh snapshot omits an undelivered offer").

The loop needs a worker that keeps omitting an offer it is re-sent. A worker that receives the offer and accepts it ends the loop, as above. Per the coordinator's condition, this change does not touch line 162; the case is reported to the coordinator as an open question.
