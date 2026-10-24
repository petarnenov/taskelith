# Launch authorization contract

Date: 2026-10-25. Status: proposed protocol contract for G2 ([G2 work plan](../g2-plan.md) item 3), under independent review; once reviewed and merged it resolves the pre-G2 contract "launch linearization and expiry" of [architecture section 15](../architecture.md#15-decisions-still-requiring-evidence-or-owner-scope-confirmation). It serves invariant 13 and R27. No code implements it yet: G2 items 8 (wire contracts), 14 and 15 (worker journal and supervisor), and 17 (launch authority) build on it, and item 24 runs its failure scenarios.

## 1. Purpose and parties

Receiving or acknowledging an assignment does not permit a launch (invariant 13). Before starting a new execution, a worker asks the control plane for a **launch authorization**: a short-lived, single-execution grant that the control plane issues in one PostgreSQL transaction, after comparing the current authoritative state with what the worker expects.

- **Worker:** the enrolled worker service ([trust model](../trust-model.md)) that holds the assignment. It journals every step under the worker journal contract (G2 item 5, `define-worker-journal-contract`).
- **Execution supervisor:** the per-execution supervisor process of decision D7 (c) that spawns and owns the child, under the supervisor identity contract (G2 item 4, `define-supervisor-identity-contract`).
- **Launch authority:** the control-plane service that runs the authorization transaction against PostgreSQL.

By decision D12 (a), the request is an HTTPS operation in the OpenAPI document, called by the worker; commands and observations stay on NATS. The check therefore fails closed when the control plane is unreachable, whatever the broker's state.

## 2. Identities and compared values

The request names the immutable set of expected values: the assignment, its attempt and ownership generation, the execution identity, the admission, and the recovery epoch. The authority reads everything else from PostgreSQL.

| Value | Expected (immutable) | Current (read in the transaction) |
| --- | --- | --- |
| Recovery epoch | The epoch the worker holds | The installation's epoch; the installation is not in restore quarantine |
| Worker | The authenticated worker principal, never a request field | Enrolled, unrevoked, at its current credential generation |
| Assignment and attempt | `assignmentId`, `attemptId`, `ownershipGeneration` from the journaled assignment command | The assignment exists, is active, is held by this worker at this generation, and its attempt is not cancelled or terminal |
| Execution | `executionId`, created and journaled by the worker before the request (item 4) | The attempt's execution ownership (section 4) allows this execution |
| Admission | The task's admission (`admissionId` and generation), named by the assignment | The admission belongs to this task and is in state `used`, as the task's dispatch left it ([`sdlc-task-admission`](../../openspec/specs/sdlc-task-admission/spec.md)) |
| Gates and artifact revisions | The gates and the artifact revisions bound in the admission | Every such gate is still `passed` for the same revisions, and each bound revision is still the artifact's current revision |
| Policy revision | `admission.policyRevision` | The run's current policy revision |
| Capacity reservation | The reservation the assignment holds (item 6) | Still held for this attempt on this worker |

A `used` admission is never invalidated (G1 admission model); the launch authority detects a stale admission only through these comparisons, and a stale launch is rejected or its grant revoked through the execution lifecycle, never by changing the admission.

## 3. The authorization transaction

The transaction is the **linearization point** of a launch. It runs at PostgreSQL `SERIALIZABLE` isolation and does, in one transaction:

1. Read the installation record; reject if quarantined or if the worker's recovery epoch is not current.
2. Read every current value of section 2 and reject on the first mismatch, with the reason section 9 assigns to that check.
3. Apply the execution ownership rule of section 4.
4. Insert one launch authorization row in state `granted`: `launchAuthId`, every expected and current value compared, `operationId`, `issuedAt` from the database clock, `ttl`, and `skew`; and move the attempt to `launch-authorized`.

A serialization failure aborts the transaction; the authority retries the whole transaction with the same `operationId`, and the worker sees either one result or a retryable error. The authorization cannot be atomic with the operating-system process start; section 6 bounds the gap between them.

## 4. Execution ownership

An attempt has at most one owning execution at a time. Expiry of an authorization ends the permission to spawn, not the ownership of its execution:

- A first authorization makes its `executionId` the attempt's owning execution.
- Another authorization of the same `executionId` is allowed only while no start of it has been recorded and the worker reports, from its supervisor's launch record (item 4), that it has not started.
- An authorization for a different `executionId` is rejected with `execution-conflict` until the owning execution has a recorded terminal fact: a recorded exit, or `not-started` established by reconciliation under item 4's rules. Uncertainty keeps the ownership and blocks another execution.

## 5. Invalidation ordering

Every transaction that changes a compared value runs at `SERIALIZABLE` isolation: a gate decision or reopening, a new artifact revision, a policy revision, an ownership change, a cancellation, a released reservation, a worker revocation, and entering restore quarantine. Each such writer must, in the same transaction:

1. Read, unconditionally and even when the result is empty, every authorization in state `granted` and every execution in state `started` whose compared value it changes, by the predicate of its kind: by artifact for a new revision, by gate for a gate change, by run for a policy revision, by assignment for an ownership change, cancellation, or released reservation, by worker for a revocation, and every one for quarantine.
2. Mark each such authorization `revoked` with its reason, and write a cancellation command to the outbox for each affected attempt.

PostgreSQL commits only serializable histories ([PostgreSQL 18, Serializable isolation](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-SERIALIZABLE)), so each invalidating writer is ordered either before or after each authorization it conflicts with:

- **Before:** the authorization reads the changed value and rejects the launch.
- **After:** the writer's read in step 1 sees the new authorization, revokes it, and writes the cancellation.

A serialization failure may abort either transaction. An aborted writer is retried as a whole, with the same command identity, until it commits or fails with a non-retryable error; an aborted authorization is retried as section 3 says.

Revocation after authorization is a cancellation request, not proof that no process started. If the process has started, cancellation is best-effort toward native and external side effects, and the attempt's outcome follows the stop and reconcile policy of [architecture section 6](../architecture.md#first-class-sdlc-with-replaceable-frameworks). Output of a revoked execution is kept as audit evidence and is not accepted as current-policy completion without revalidation.

## 6. Request, response, and idempotency

The worker journals `operationId` and `executionId` before its first request (item 5), and also keeps, in memory, the monotonic clock reading taken before that first request (section 7).

- **Granted:** `launchAuthId`, `issuedAt`, `ttl`, `skew`, and the bound values.
- **Rejected:** a reason from section 9. A rejection is final for that `operationId`.
- **Transport retry:** the worker repeats the request with the same `operationId`. The authority does not run a new authorization; it checks the current quarantine state, recovery epoch, worker credential, and the recorded authorization's state, and returns the recorded grant only while it is still `granted`. Otherwise it returns `revoked` with its reason, or the rejection the current state requires. A retry never extends the worker's deadline (section 7).
- **Changed request:** a repeat with the same `operationId` but different expected values is rejected with `operation-mismatch`.
- **Re-authorization:** after expiry, a retryable rejection, or a restart, the worker journals a new `operationId` and runs the whole check again, within the ownership rule of section 4.

## 7. Expiry and clock safety

The protocol parameters are the authorization's `ttl` and `skew`, provisionally `30s` and `5s` ([operational targets](../operational-targets.md)); the response carries them, `skew` must be less than `ttl`, and an installation may change them only within the operational targets.

- **Worker deadline:** the worker reads its **monotonic** clock before sending the **first** request of an `operationId`. It may hand the authorization to the supervisor only before that reading plus `ttl` minus `skew`. The reading precedes `issuedAt`, so the deadline is never later than the server's expiry, whatever the worker's wall clock says, and retries of the same `operationId` keep the first reading.
- **Supervisor:** before spawning, the supervisor journals the `launchAuthId` and `executionId` as its launch record (item 4) and spawns only before the deadline. A spawn begun before the deadline is a start under that authorization.
- **Restart:** a monotonic reading does not survive a restart. A worker or supervisor that restarts with a journaled authorization never spawns under it: it reconciles by `executionId` (item 4), and if no execution exists it re-authorizes with a new `operationId` (section 6).
- **Start observations:** the observation of a start carries `launchAuthId` and `executionId` and is accepted once per execution; a duplicate returns the recorded fact. Its arrival time does not decide it, because a worker may report a timely start after an outage. A start for a `granted`, expired, or `revoked` authorization of the same execution is recorded as a start; for a `revoked` one, the cancellation already exists.
- **Server side:** the server cannot observe the spawn time; under the trusted-host boundary of the [trust model](../trust-model.md), the worker's monotonic deadline enforces it. The server enforces what it can observe: an authorization covers one execution, expiry ends re-use for a spawn, ownership blocks a second execution (section 4), and revocation turns later invalidation into cancellation. A start reported for an unknown authorization, or for an execution the attempt does not own, becomes an `unauthorized-start` fact: the authority writes a cancellation command, keeps the evidence, and reconciles the execution, which is never adopted as current work.

## 8. Offline and quarantine behavior

- An offline worker, or one that cannot reach the launch authority, starts no queued work. It retries with the backoff of the operational targets (initial `5s`, maximum `60s`, with jitter), with the same `operationId` until its deadline passes and a new one after that.
- Already started work may continue within its admitted scope and the configured offline policy.
- In restore quarantine the authority grants nothing, and a transport retry returns no recorded grant. Requests from an older recovery epoch fail closed, and workers reconcile or re-enroll as the [trust model](../trust-model.md) requires before any resumption is authorized.

## 9. Rejection reasons

Each check of sections 2 to 4 maps to one reason. The scheduler acts on the reason; the worker retries only retryable ones.

| Check that failed | Reason | Retryable | Scheduler action |
| --- | --- | --- | --- |
| Installation in restore quarantine | `quarantined` | yes | None until quarantine is lifted |
| Recovery epoch not current | `stale-recovery-epoch` | no | Reconcile the worker before any assignment |
| Worker revoked, unknown, or at an old credential generation | `worker-not-authorized` | no | Reassign after reconciliation |
| Assignment missing, ended, or held by another worker | `assignment-not-active` | no | None; the current owner decides |
| Ownership generation not current | `stale-ownership-generation` | no | None; the current owner decides |
| Attempt cancelled or terminal | `attempt-not-launchable` | no | None |
| Admission missing, of another task, or not `used` | `admission-not-current` | no | Re-admit the task |
| A relied-on gate no longer `passed` | `gate-not-passed` | no | Re-admit after the gate passes |
| A bound artifact has a newer revision | `artifact-revision-changed` | no | Re-admit against the new revision |
| Admission policy revision differs from the run's | `policy-revision-changed` | no | Re-admit under the current policy |
| Reservation released or held elsewhere | `capacity-not-reserved` | no | Reserve again or reassign |
| Ownership rule of section 4 | `execution-conflict` | no | Reconcile the owning execution |
| Same `operationId`, different values | `operation-mismatch` | no | None; a worker defect |
| Transient failure inside the authority | `unavailable` | yes | None |

A non-retryable rejection is reported as an observation.

## 10. Required tests

Items 17 and 24 implement these as tests through the deterministic test harness (item 10), as R27 requires:

- Each check of section 9 fails with its reason when its value changed after queueing, including a missing, foreign, or unused admission.
- An invalidation raced with the authorization lands either before it (rejection) or after it (revocation and a cancellation command), never neither; with a bulk writer (a policy revision affecting many attempts), with an empty predicate, and with either transaction as the serialization victim.
- A worker that disconnects before authorization starts nothing; after authorization and start, cancellation is reported as best-effort.
- A lost first response followed by a retry returns the same grant and does not extend the deadline; a retry after revocation, worker revocation, or quarantine returns no grant; a changed request under the same `operationId` is rejected.
- A worker whose wall clock is wrong by more than `skew` stops handing out an authorization at its monotonic deadline.
- A timely start reported after an outage is recorded as a start; a duplicate start observation returns the recorded fact; a start under an unknown authorization becomes `unauthorized-start`.
- After expiry with no recorded start, another execution identity is rejected until reconciliation records `not-started`.
- A restart with a journaled authorization never spawns under it.
- Quarantine and an old recovery epoch grant nothing.
