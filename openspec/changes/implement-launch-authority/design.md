## Context

The item 3 contract defines the authorization transaction, execution ownership, invalidation ordering, idempotency, and expiry. The item 7 domain implements the decision: `authorizeLaunch` with every check of section 9 in order, the replay of a recorded grant, revocation, and the ownership rule. Item 11 provides the SERIALIZABLE transaction with its retries and the outbox. Item 16 provides the HTTP adapter, and `add-worker-bearer-authentication` provides the worker principal. Item 18 provides the assignment, the reservation, and the cancellation of a running assignment.

## Coordinator decisions (2026-10-25)

These are coordinator decisions, taken as the worker recommended. The coordinator reports B2 to the owner.

- **B1 (a): two kinds of credential refusal.** A credential refused at authentication is 401, and nothing is recorded. A worker that the deciding transaction reads as revoked, or not at its current generation, gets a recorded 200 `worker-not-authorized` rejection.
- **B2 (c): current revisions are seeded.** `submitTask` seeds a run's current revisions from the admission's bound revisions. They stay authoritative until a G3 writer exists. That writer is an obligation of G3, and it must invalidate as section 5 requires.
- **B3 (c): worker revocation revokes, cancels, and requests reconciliation.** It revokes the grants and writes the cancellation command. It also records the reconciliation request for item 21 as `uncertain` evidence on the execution, which the `unknown_executions` signal counts.
- **B4 (a): the grant index is a projection.** `launch_authorizations` has `UNIQUE (worker_id, operation_id)`, and `PostgresTaskRepository` writes it from the task's grants on every write.
- **B5 (a): final rejections are recorded.** A non-retryable rejection is recorded per worker and operation, so a replay never becomes a grant.
- **B6 (a): no 200 `unavailable` in G2.** A transient failure is a 503, and the worker retries under the same operation.
- **B7: the worker client.** An Execution port, and the worker-only package `worker-control-plane-client` on the built-in `fetch`. The retry loop and the journal orchestration stay with item 20.
- **B8: the cancellation reason.** It is `launch-revoked`. Item 18's `assignment-ended` is a follow-up.
- **B9: invalidation scope.** Reusable predicate readers and a revoke-and-cancel helper, wired to worker revocation only. Item 17 provides the `launchAuthId` lookup, and item 21 consumes start observations.

## Goals / Non-Goals

**Goals:**
- the authority and its operation;
- the record and its crash points;
- the invalidating writers' helper and worker revocation;
- the worker's client.

**Non-Goals:**
- the evidence store (item 19);
- the worker runtime, its retry loop, and the journal steps W2 and W3 (item 20);
- reconciliation, start observations, and the placement loop (item 21);
- writers of gates, artifact revisions, policy revisions, and quarantine, which G2 does not have.

## Decisions

- **One transaction per operation.** `LaunchAuthority.authorize` reads the installation and the worker, then looks up the operation.
  - A recorded grant is replayed with `replayLaunchOperation`.
  - A recorded rejection is returned when the values are the same, and is `operation-mismatch` otherwise.
  - Otherwise the domain decides on a context that is read entirely in the transaction: the assignment and reservation, the admission, the run's definition from the workflow registry, its gates, the current revisions, and the policy revision.
  - The grant is written with the task's record. A non-retryable rejection is recorded and commits, because the transaction's work returns it as a value.
- **The worker check is the contract's.** "Enrolled, unrevoked, at its current credential generation" (section 2) is read in the transaction, so a revocation is ordered against the authorization. The principal's generation must be the current one. A predecessor within its grace window authenticates, and is then rejected here.
- **An unknown assignment has no task.** `rejectUnknownAssignment` keeps the order of section 9: the installation and worker checks come first, then `assignment-not-active`.
- **The index follows the record.**
  - `indexLaunchGrants` upserts one row per grant after every task write. A row's identity and values never change, only `live`: an unrevoked grant whose execution is not terminal.
  - The predicates read partial indexes on live rows, GIN indexes for the artifacts and relied-on gates, so a writer's read is an index read that serializable conflict detection covers.
  - The migration backfills the rows of stored tasks, masking escapes as the signals migration does.
- **Crash points.** The transaction reaches `LaunchAuthorizationCommit` when its task repository inserted a new grant row. A crash after the commit is the lost-response case, and its retry replays the grant.
- **Invalidation.**
  - `invalidateLaunches` reads the predicate's live grants, revokes each attempt's grants with `revokeLaunch`, and writes one cancellation command per attempt. The command's identity derives from the first grant, so a rerun sends the same command.
  - `invalidateWorkerLaunches` also records `uncertain` evidence, as its own write, since each change is one generation.
  - `LaunchRevokingFleetRegistry` runs the fleet revocation and the invalidation in one transaction for the administration's `revoke-worker`.
- **The wire mapping.** `launch-wire.ts` parses the request into domain identifiers and flattens a grant's parameters into `ttlMilliseconds` and `skewMilliseconds`. The client parses them back, and an answer that breaks its schema or values is `internal`, never a grant.
- **Provisional parameters.** The ttl of 30 s and the skew of 5 s come from `docs/operational-targets.md`, and `ControlPlaneSettings.launchParameters` overrides them in tests.

## Risks / Trade-offs

- **No in-memory `LaunchRecords`.** The index is a projection of task records, so it is tested against PostgreSQL, as are the authority and the writers. The port keeps the use cases independent of the database.
- **Seeded current revisions.**
  - The first submission that binds an artifact fixes its current revision for the run. A later submission with another digest of that artifact is rejected with `artifact-revision-changed` at launch.
  - The contract keeps this fail-closed until G3's writer.
- **Writers of G3 and G6.** Gate, artifact, policy, and quarantine writers must call `invalidateLaunches` in their transactions. The contract's section 11 states it, and the helper's tests cover every predicate, including an empty read.
- **Latency.** The p95 targets of the operational targets are not measured here. Item 24 and G6 measure them.
