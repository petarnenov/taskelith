## Why

The worker command intake change (20b of the [G2 work plan](../../../docs/g2-plan.md) item 20) makes the control plane create each worker's durable command consumer at enrollment and repair the consumers of the active workers at every start. Nothing removes the consumer of a revoked worker, so the commands stream keeps one consumer for every worker ever revoked. This G2 follow-up removes it.

## What Changes

- `WorkerCommandConsumers` gains `remove`, which is idempotent: a missing consumer is a success. The NATS adapter deletes the worker's durable consumer on the commands stream.
- `EnrollmentService.revoke` removes the worker's command consumer after the revocation commits. The database revocation decides; a failed removal does not fail the revocation, and the result reports it as `commandConsumerRemoved: false`. The administration tool's `revoke-worker` connects to the broker as the control plane for the removal and prints that field with a retry note when the removal failed.
- `FleetRegistry` gains `recentlyRevokedWorkerIds(limit)`: at most `limit` revoked workers, the latest revocation first.
- A control-plane start also removes the consumers of the `100` latest revoked workers, logs each failure, and logs a summary, so a removal that failed heals at the next start.

## Exclusions

- No change to the wire contracts or the broker permissions: the control-plane user may already delete consumers.

## Impact

- Specification: `installation-enrollment`, a new requirement "Revoked worker command consumer" beside "Worker command consumer".
- Code: `@taskelith/fleet`, `@taskelith/nats`, `@taskelith/postgres`, and `@taskelith/control-plane`.
- Documentation: the control-plane background loops row of [operational targets](../../../docs/operational-targets.md).
