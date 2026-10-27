## Why

`PlacementService.#placeDue` (`apps/control-plane/src/application/placement-service.ts`) moves the rotation cursor `#after` to the project of the last row it read (`waiting.at(-1)?.projectId`). A read ends with the last round of its ranks, so when one read holds every waiting task it always ends with the same project, and each next read wraps and starts again with the same first project. With one free slot per pass, `p-a` waiting with `a1`, `a2`, `a3` since `t0`, `t1`, `t2` and `p-b` with `b1`, `b2`, `b3` later, six passes place `a1`, `a2`, `a3`, `b1`, `b2`, `b3`: first in, first out, not the rotation `a1`, `b1`, `a2`, `b2`, `a3`, `b3`. One project's backlog then holds the capacity until it drains, against contract section 5 and the section 12 test that one project's retry loop or approval-blocked attempts do not stop another project from receiving capacity.

The coordinator (Niki) split this off from review pass 2 (finding M2) of `align-fair-order-rotation`, which made the offer order equal the read order but left the cursor rule unchanged.

## What Changes

- The next read starts after the project that last received capacity in the pass. A pass that placed nothing moves the cursor to the last project it offered, so projects with no capacity-eligible task cannot hold the rotation. A pass that offered nothing, because the read was empty, no candidate worker existed, or the store failed at the first offer, keeps the cursor.
- A domain helper `RotationCursor` in `packages/modules/scheduling/src/domain/fair-order.ts` holds the rule; the placement service records each offer and placement in it and stores its next cursor, also when an outage stops the pass.
- The capacity reservation contract (sections 5 and 13) states the cursor rule; section 12 is kept.
- The `execution-placement` requirements "Project rotation" and "Waiting placements" name the cursor instead of the previous read's last project.

## Capabilities

### New Capabilities

### Modified Capabilities

- `execution-placement`: the rotation cursor is the project that last received capacity, or, when a pass placed nothing, the last project it offered.

## Impact

`@taskelith/scheduling` and `@taskelith/control-plane`, private workspace packages. No database, API, or event change; the queues and their PostgreSQL query are unchanged. Out of scope: `#after` lives only in memory and resets when the control plane restarts (a follow-up for `close-g2`).
