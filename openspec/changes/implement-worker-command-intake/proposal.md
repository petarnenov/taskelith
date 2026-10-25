## Why

[G2 work plan](../../../docs/g2-plan.md) item 20 builds the worker application. The coordinator split it into five changes; this is 20b. After 20a the worker enrolls and connects to the broker, but it reads no command and publishes nothing. A worker must validate an assignment and persist it before it acknowledges it, and publish its observations from the local outbox (R05).

## What Changes

- The worker consumes its command subject in the order of [execution wire contracts](../../../docs/contracts/execution-wire-contracts.md) section 3: `VersionedCommand`, the version window, the command's schema, and `execution.command.rejected` for an unsupported version or another `workerId`.
- Each command is journaled by W1 of the [worker journal](../../../docs/contracts/worker-journal.md) before the broker acknowledgement, a duplicate included.
- An offer, a cancellation, and an assignment end are each handled whatever arrived before them (item 12's obligation).
- An offer is refused with `resource-ceiling-exceeded`, `control-not-enforceable`, `worker-slots-exhausted`, or `worker-capacity-exhausted` by the worker-side limits of [capacity reservation](../../../docs/contracts/capacity-reservation.md) section 8; an accepted one is reported with `execution.assignment.accepted`.
- The worker declares its capacity with `worker.capacity.declared` at its first start and whenever the capacity or the protocol window changes.
- A publication loop publishes due outbox entries with `dueForPublication` and `markPublished`; `execution.observations.confirmed` prunes through `confirmThrough`; `worker.inventory.requested` is answered with a `worker.inventory.reported` snapshot.
- The journal moves to format 2, which stores an offer's requested resources, assignment ends, the last capacity declaration, and the inventory snapshot counter, and migrates format 1 forward.
- The `EnrollmentRequest` description in `execution.openapi.json` no longer says that the worker created its journal before enrolling (20a review pass 1, L4; description only).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: command intake, capacity declaration, observation publication, confirmation, and the inventory answer.
- `worker-journal-adapter`: journal format 2 with its migration, and the intake records.

## Impact

- `apps/worker`: command intake, observation publisher, and their wiring in `startWorker`.
- `@taskelith/execution`: journal record and observation fact types.
- `@taskelith/worker-journal`: format 2, migration, and the new journal methods.
- `@taskelith/contracts`: one description in `execution.openapi.json`.
- No new third-party dependency.
