## Why

G2 work item 17 ([docs/g2-plan.md](../../../docs/g2-plan.md)) serves the exit evidence "Launch authorization", stale generations, and R27. The item 3 contract ([launch authorization](../../../docs/contracts/launch-authorization.md)) and the item 7 domain decide a launch, but before this change nothing served the decision or recorded it. Nothing found a recorded operation or recorded a final rejection. Only item 18's cancellation revoked grants, and no other writer could find the grants its change affects. The worker had no client.

Item 16 left the `authorizeLaunch` HTTP operation here. The split-off change `add-worker-bearer-authentication` left the in-transaction re-read of the worker and its current-generation rule.

## What Changes

- **Execution.**
  - The `LaunchRecords` port, with a conformance suite: the grant index by operation, by identity, and by the predicates of contract section 5, and the final rejections.
  - The `LaunchAuthorityClient` port for the worker's side.
  - `LaunchOutcome`, `rejectUnknownAssignment`, and `workerLaunchDeadline`.
- **SDLC.** The `CurrentRevisions` port, with an in-memory adapter and a conformance suite.
- **Scheduling.**
  - `invalidateLaunches` and `invalidateWorkerLaunches`: a writer's read of live grants, their revocation, and one cancellation command per attempt with reason `launch-revoked`.
  - The cancellation payload takes its reason.
- **PostgreSQL.**
  - A migration adds `launch_authorizations`, which is the grant index and is backfilled from stored tasks; `launch_rejections`; and `current_revisions`, which is backfilled from the used admissions.
  - The task repository keeps the index in step on every write.
  - `PostgresLaunchRecords` and `PostgresCurrentRevisions`.
  - The crash points `LaunchAuthorizationCommit.before` and `.after`.
- **Control plane.**
  - `LaunchAuthority`: one SERIALIZABLE transaction decides, records, or replays each operation.
  - The `authorizeLaunch` route with the `workerCredential` scheme and its wire mapping.
  - `submitTask` seeds the current revisions.
  - Worker revocation invalidates the worker's launches in its own transaction.
  - Composition with the provisional ttl and skew.
- **Worker client.** The new worker-only package `@taskelith/worker-control-plane-client` holds `HttpLaunchAuthorityClient` on the built-in `fetch`.
- **Documents.** Section 11 of the launch authorization contract records the G2 implementation.

## Capabilities

### New Capabilities

- `launch-authority`: the launch authority service, its operation and record, its invalidating writers, and the worker's client.

### Modified Capabilities

None.

## Impact

- The packages `@taskelith/execution`, `@taskelith/sdlc`, `@taskelith/scheduling`, `@taskelith/postgres`, `@taskelith/control-plane`, and the new `@taskelith/worker-control-plane-client`.
- One migration.
- No OpenAPI or AsyncAPI changes: `execution.openapi.json` 0.2.x and `execution.asyncapi.json` already declare the operation and the cancellation reason. The launch authorization contract gains section 11.
- No new third-party dependency.
