## Context

A placement pass reads at most `PLACEMENT_BATCH` waiting tasks with `PlacementQueue.waiting(limit, excluding, after)`, rank first and then the projects after the cursor `after`, wrapping, and offers them in the same order (`fairWaitingOrder`, `align-fair-order-rotation`). Each offer runs its own transaction; only the tasks that a candidate accepts receive capacity. The service then set `#after` to the last row's project. The last row belongs to the last round, which is the project with the deepest backlog in the read, so a read that holds every waiting task always ends with the same project and the rotation never moves past it.

## Decisions

- **The cursor is the project that last received capacity.** After a pass, `#after` is the project of the last task the pass placed, in offer order. With several placements in one pass this is the project of the last one, so the next read starts with the projects that the pass reached after it, or that it did not reach, and the project just served goes to the back. With one slot per pass, `a1` to `a3` and `b1` to `b3` place `a1`, `b1`, `a2`, `b2`, `a3`, `b3`.
- **A pass that placed nothing moves the cursor to the last project it offered.** An offer is a placement transaction that ended without an outage, whatever its outcome: not accepted, a retry still backing off, an attempt ended by a rejecting reason, or no longer waiting. Keeping the cursor instead would let projects with no capacity-eligible task hold the rotation: with 1200 blocked older projects, every read would return the same first 100 and never reach the placeable task, which the "Many blocked projects" scenario forbids. Moving to the last offered project skips only projects that were offered and declined, so a pass that places nothing advances the cursor past every project it read, as before this change.
- **A pass that offered nothing keeps the cursor.** That is an empty read, a pass without any candidate worker (no transaction is opened), or an outage at the first offer. No project was offered capacity, so none loses its turn; when candidates return, the rotation resumes where it stopped.
- **An outage stops the pass and still moves the cursor.** The placements that committed before the outage received capacity, so the same rule applies to the offers made before it; the task whose transaction failed is not counted as offered.
- **Section 12 and bounded passes.** Every pass either places, and moves the cursor past the last project served, or places nothing and moves it past every project it read. The cursor stays put only when a pass offered nothing, and a project with a waiting task is reached once each project ahead of it in the rotation has been served or declined; with blocked projects only, that is the ceil(P / batch) reads of the "Many blocked projects" scenario. A project after the cursor that was declined only because the capacity ran out is offered first in the next pass, which is the fairness section 12 asks for. A project after the cursor that is blocked is offered again and declined, which costs a transaction, not capacity.
- **The domain owns the rule.** `RotationCursor` in `domain/fair-order.ts` starts at the read's cursor, records `offered(projectId)` and `placed(projectId)`, and answers `next`. The service records into it during the loop and stores `next` before it returns, on success and on an outage. It offers in `fairWaitingOrder(waiting, after)`, whose entries carry the project id; `fairPlacementOrder` stays for its other callers.
- **Contract-first.** The capacity reservation contract states the cursor rule in sections 5 and 13 before the code changes.

## Out of scope

- `#after` lives only in memory and resets when the control plane restarts; a follow-up for `close-g2`.
- The queues and their query are unchanged: they already start after the cursor they are given.

## Risks

- A pass whose last placement is early in its read reads the projects after it again in the next pass. They were offered and declined, so this costs reads and transactions, not fairness; a pass that places nothing still jumps past the whole read.
