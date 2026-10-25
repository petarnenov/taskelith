## Why

Item 16 left worker authentication to item 17, as a lookup by credential hash in `FleetRegistry` (its design, Q6). Item 17's `authorizeLaunch` and item 19's `publishEvidence` both take the worker's control-plane credential as a bearer. So the coordinating session asked for the authentication to land first as its own change, which both items then build on ([G2 work plan](../../../docs/g2-plan.md) items 17 and 19).

## What Changes

- **Fleet.**
  - `FleetRegistry.workerByCredentialHash` finds the worker with a given control-plane hash in its current or predecessor generation, whether it is revoked or not. It comes with an in-memory adapter and a conformance case.
  - `EnrollmentService.authenticateWorkerBearer(secret)` answers a `WorkerPrincipal`: the worker and the generation the bearer is of.
  - A predecessor authenticates during its grace window. An unknown credential, a revoked worker, or a credential past the grace window all get the same `forbidden` failure, with reason `worker-not-authorized`.
  - It replaces `authenticate(workerId, secret)`, which only tests used.
- **PostgreSQL.**
  - A migration adds the unique columns `workers.control_plane_hash` and `previous_control_plane_hash`, and backfills them from the enrollment record.
  - Every writer of the record keeps the columns in step: enrollment, rotation, revocation, and predecessor expiry.
  - The lookup reads in a read-only transaction. A hash that two workers hold fails closed.
- **Control plane.**
  - The `workerCredential` security scheme in the route table.
  - `ApiHandlers.authenticateWorker`, which the server calls before a worker route's operation.
  - The worker principal on `ApiRequest`.
  - A replaceable route table for the server.
  - Fixed statuses for authentication failures, whatever a route declares.
  - No route of the server's table uses the scheme yet. The contract declares it for `authorizeLaunch` (item 17), `publishEvidence` (item 19), and `requestDelegation` (items 20 and 21).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `installation-enrollment`: authentication of a worker's control-plane bearer.
- `control-plane-api`: the `workerCredential` scheme.

## Impact

- The packages `@taskelith/fleet`, `@taskelith/postgres`, and `@taskelith/control-plane`.
- One migration.
- No contract document changes: `execution.openapi.json` 0.2.0 already declares `workerCredential`.
- No new dependency.
