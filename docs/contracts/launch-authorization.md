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
| Gates and artifact revisions | The artifact revisions bound in the admission, and the **relied-on gates**, by admission kind as G1 admission checked them: for an implementation admission, the gates of the prerequisite stages of its stage in the run's workflow definition version; for a planning admission, none. G1 admission records do not store gate identities, so the authority derives this set deterministically and records it in the grant | For an implementation admission, every prerequisite stage still has at least one gate, since G1 treats a stage without gates as not passed; every relied-on gate is still `passed`, and each artifact revision in its own subject is bound in the admission with the same artifact identifier and digest; each bound revision is still the artifact's current revision, compared by identifier and digest as G1 does |
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

- A first authorization makes its `executionId` the attempt's owning execution, in state `authorized`. The execution moves to `started` when its start is recorded, and to a terminal state, `exited` or `not-started`, only as below. A terminal state never changes again: a start fact that arrives later is recorded as history (section 7) and moves no state. Expiry of a grant changes neither the execution's state nor the grant's recorded state; expiry is computed from `issuedAt` and `ttl`.
- Another authorization of the same `executionId` is allowed only while the execution is `authorized` and the worker reports, from its supervisor's launch record (item 4), that it has not started. The supervisor spawns at most once per `executionId` across all its grants: its launch record is written once, and a spawn under any grant first claims it.
- `not-started` is recorded only after the worker has sealed the execution's launch record so that no spawn can follow under any grant, and reported that seal with the absence of a process (item 4). From then on every grant of the execution is void.
- An authorization for a different `executionId` is rejected with `execution-conflict` until the owning execution is `exited` or `not-started`. Uncertainty keeps the ownership and blocks another execution.

This section places two obligations on the supervisor identity contract (item 4) and the worker journal contract (item 5): a single, claimed spawn per execution identity, and an irreversible seal before `not-started` is reported.

## 5. Invalidation ordering

Every transaction that changes a compared value runs at `SERIALIZABLE` isolation: a gate decision or reopening, adding or removing a gate of a stage, a new artifact revision, a policy revision, an ownership change, a cancellation, a released reservation, a worker revocation, and entering restore quarantine. Each such writer must, in the same transaction:

1. Read, unconditionally and even when the result is empty, every owning execution that is not terminal (`authorized` or `started`, whatever its grants' expiry) and its grants, whose compared value the writer changes, by the predicate of its kind: by artifact for a new revision, by the relied-on gates recorded in grants for a gate change, by run and by the stages that have the changed stage as a prerequisite when a gate is added to or removed from a stage, by run for a policy revision, by assignment for an ownership change, cancellation, or released reservation, by worker for a revocation, and every one for quarantine.
2. Mark each such grant `revoked` with its reason, and write a cancellation command to the outbox for each affected attempt.

An execution started under an expired grant and not yet reported is therefore still found and cancelled; its start, when reported, is recorded as a start of a cancelled execution.

PostgreSQL commits only serializable histories ([PostgreSQL 18, Serializable isolation](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-SERIALIZABLE)), so each invalidating writer is ordered either before or after each authorization it conflicts with:

- **Before:** the authorization reads the changed value and rejects the launch.
- **After:** the writer's read in step 1 sees the new authorization, revokes it, and writes the cancellation.

A serialization failure may abort either transaction. An aborted writer is retried as a whole, with the same command identity, until it commits or fails with a non-retryable error; an aborted authorization is retried as section 3 says.

Revocation after authorization is a cancellation request, not proof that no process started. If the process has started, cancellation is best-effort toward native and external side effects, and the attempt's outcome follows the stop and reconcile policy of [architecture section 6](../architecture.md#first-class-sdlc-with-replaceable-frameworks). Output of a revoked execution is kept as audit evidence and is not accepted as current-policy completion without revalidation.

## 6. Request, response, and idempotency

The worker journals `operationId` and `executionId` before its first request (item 5), and also keeps, in memory, the monotonic clock reading taken before that first request (section 7).

- **Granted:** `launchAuthId`, `issuedAt`, `ttl`, `skew`, and the bound values.
- **Rejected:** a reason from section 9. A rejection is final for that `operationId`.
- **Transport retry:** the worker repeats the request with the same `operationId`. The authority looks the `operationId` up only among the authenticated worker's own operations, so another worker's operation is unknown to it. It does not run a new authorization; it checks the current quarantine state, recovery epoch, worker credential, and the recorded authorization's state, and returns the recorded grant only while it is `granted`, not expired by `issuedAt` and `ttl`, and its execution is not terminal. Otherwise it returns `revoked` with its reason, `expired`, or the rejection the current state requires. A retry never extends the worker's deadline (section 7).
- **Changed request:** a repeat with the same `operationId` but different expected values is rejected with `operation-mismatch`.
- **Re-authorization:** after expiry, a retryable rejection, or a restart, the worker journals a new `operationId` and runs the whole check again, within the ownership rule of section 4.

## 7. Expiry and clock safety

The protocol parameters are the authorization's `ttl` and `skew`, provisionally `30s` and `5s` ([operational targets](../operational-targets.md)); the response carries them, `skew` must be less than `ttl`, and an installation may change them only within the operational targets.

- **Elapsed-time clock:** the deadline uses a clock that is monotonic **and keeps counting while the machine is suspended**, such as Linux `CLOCK_BOOTTIME` ([Linux timekeeping](https://docs.kernel.org/core-api/timekeeping.html)) and the macOS continuous clock (`CLOCK_MONOTONIC_RAW` or `mach_continuous_time`); Linux `CLOCK_MONOTONIC` stops during suspend and does not qualify, nor does Node's `process.hrtime`, which libuv bases on clocks that stop during suspend. The worker and its supervisors read the same clock. Item 4 records the clock each OS qualifies; where none qualifies, every unused grant is void after a suspend and resume.
- **Worker deadline:** the worker reads that clock before sending the **first** request of an `operationId`. It may hand the authorization to the supervisor only before that reading plus `ttl` minus `skew`. The reading precedes `issuedAt`, so the deadline is never later than the server's expiry, whatever the worker's wall clock says, and retries of the same `operationId` keep the first reading.
- **Supervisor:** before spawning, the supervisor journals the `launchAuthId` and `executionId` as its launch record (item 4) and spawns only before the deadline. A spawn begun before the deadline is a start under that authorization.
- **Restart:** a monotonic reading does not survive a restart. A worker or supervisor that restarts with a journaled authorization never spawns under it: it reconciles by `executionId` (item 4), and if no execution exists it re-authorizes with a new `operationId` (section 6).
- **Start observations:** the observation of a start carries `launchAuthId`, `executionId`, and the worker's recovery epoch. The authority first checks that the grant exists, that the authenticated worker is the grant's worker, and that the grant is bound to that `executionId`; an observation failing this check is rejected and kept as evidence, and writes nothing to another worker's execution. If a start of that execution is already recorded, it returns the recorded fact, whatever has happened since (a later exit or a later owning execution), and writes nothing. Otherwise, in this order: an observation whose epoch differs from the current epoch (older or newer), or received in quarantine, or naming a grant unknown in quarantine, is kept as evidence for quarantine reconciliation and changes no current state; a start of an `exited` execution is recorded as a historical start fact, without a transition or a cancellation; a start of an `authorized` owning execution is recorded and moves it to `started`; anything else is an unauthorized start (next item). Its arrival time does not decide it, because a worker may report a timely start after an outage. A start under an expired or `revoked` grant of the execution is recorded as a start; for a `revoked` one, the cancellation already exists.
- **Server side:** the server cannot observe the spawn time; under the trusted-host boundary of the [trust model](../trust-model.md), the worker's monotonic deadline enforces it. The server enforces what it can observe: an authorization covers one execution, expiry ends re-use for a spawn, ownership blocks a second execution (section 4), and revocation turns later invalidation into cancellation. A new start at the current epoch outside quarantine that fails the checks of the previous item (an unknown grant, a grant bound to another execution, a non-owning execution that is not `exited`, or one recorded `not-started`) becomes an `unauthorized-start` fact: the authority writes a cancellation command for that execution only, never for another execution of the attempt, keeps the evidence, and reconciles the execution, which is never adopted as current work.

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
| Admission missing, of another task, not `used`, or at another generation than the expected one | `admission-not-current` | no | Re-admit the task |
| A relied-on gate not `passed`, or `passed` for another subject than the bound revisions | `gate-not-passed` | no | Re-admit after the gate passes |
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
- After expiry with no recorded start, another execution identity is rejected until reconciliation records `not-started`; a supervisor paused before spawning, then resumed after the seal, does not spawn.
- A timely spawn, a disconnect, expiry, and a policy change before the start is reported: the writer still finds the execution, writes a cancellation, and the late start is recorded.
- A start observation with a known grant bound to another execution identity becomes `unauthorized-start`.
- An implementation admission whose relied-on gates have different subjects (one gate on the specification, another on the specification and the design) is granted; a changed digest in any subject is rejected.
- A planning admission whose stage has prerequisite stages with unpassed gates is granted, and their gate changes do not invalidate it.
- Start A, exit A, authorize B, then a duplicate start of A: the recorded fact is returned, nothing is cancelled, and A's terminal state stays.
- Removing the last gate of a prerequisite stage before, and concurrently with, the first authorization rejects it with `gate-not-passed`.
- After a grant, a suspend longer than `ttl` and a resume without restart: the supervisor does not spawn.
- Worker B replaying worker A's `operationId`, or reporting a start of A's execution, gets nothing and changes nothing of A's.
- A start observation with a future recovery epoch changes no state.
- In quarantine, a start for a grant absent from the restored snapshot is kept as evidence without a cancellation.
- A start observation from a restored backup's grant with an older epoch, and one at the current epoch received in quarantine, are kept as evidence and change no state and write no cancellation.
- Spawn A, exit A, the exit observation, then the first start observation of A: the start is recorded as history and A stays `exited`, with and without a later execution B.
- Grant, then a pending gate added to a prerequisite stage (sequentially and concurrently): the grant is revoked and a cancellation written.
- Two admissions with the same bound revisions but different relied-on gates are invalidated only by their own gates' changes; an admission generation mismatch and a gate passed for another subject are rejected with their reasons.
- A restart with a journaled authorization never spawns under it.
- Quarantine and an old recovery epoch grant nothing.
