## Why

`PlacementService.#placeDue` (`apps/control-plane/src/application/placement-service.ts`) moves the rotation cursor `#after` to the project of the last row it read (`waiting.at(-1)?.projectId`). A read ends with the last round of its ranks, so when one read holds every waiting task it always ends with the same project, and each next read wraps and starts again with the same first project. With one free slot per pass, `p-a` waiting with `a1`, `a2`, `a3` since `t0`, `t1`, `t2` and `p-b` with `b1`, `b2`, `b3` later, six passes place `a1`, `a2`, `a3`, `b1`, `b2`, `b3`: first in, first out, not the rotation `a1`, `b1`, `a2`, `b2`, `a3`, `b3`. One project's backlog then holds the capacity until it drains, against contract section 5 and the section 12 test that one project's retry loop or approval-blocked attempts do not stop another project from receiving capacity.

The coordinator (Niki) split this off from review pass 2 (finding M2) of `align-fair-order-rotation`, which made the offer order equal the read order but left the cursor rule unchanged.

## What Changes

- The cursor moves only by the offers a pass made before its first decline for lack of fleet capacity (`quarantined`, `worker-not-eligible`, `worker-capacity-exhausted`, or `no-candidate`), an offer being a placement transaction that ended without a store outage: to the project of the last of them that placed its task, else of the last of them. So the project that last received capacity goes to the back, projects with no capacity-eligible task cannot hold the rotation, and a full fleet does not move it past the projects that waited. A pass with no such offer, because the read was empty, no candidate worker existed, the fleet was full or the store failed at the first offer, keeps the cursor.
- A domain helper `RotationCursor` in `packages/modules/scheduling/src/domain/fair-order.ts` and `lacksFleetCapacity` in `domain/capacity-reasons.ts` hold the rule; the placement service records one event per offer in the cursor and stores its next value, also when an outage stops the pass.
- The capacity reservation contract (sections 5 and 13) states the cursor rule; section 12 is kept. The placement queue port comment names the rotation cursor.
- The `execution-placement` requirements "Project rotation" and "Waiting placements" name the cursor instead of the previous read's last project.

## Capabilities

### New Capabilities

### Modified Capabilities

- `execution-placement`: the rotation cursor moves only by the offers before a pass's first decline for lack of fleet capacity, to the last one placed, else the last one.

## Impact

`@taskelith/scheduling` and `@taskelith/control-plane`, private workspace packages. No database, API, or event change; the queues and their PostgreSQL query are unchanged. Out of scope: `#after` lives only in memory and resets when the control plane restarts (a follow-up for `close-g2`); the per-task placement backoff after a capacity decline can still let a project with more tasks take a freed slot first (follow-up `placement-backoff-preserves-rotation`).
