# Launch authorization contract

Date: 2026-10-25. Status: reviewed protocol contract for G2 ([G2 work plan](../g2-plan.md) item 3), resolving the pre-G2 contract "launch linearization and expiry" of [architecture section 15](../architecture.md#15-decisions-still-requiring-evidence-or-owner-scope-confirmation). It serves invariant 13 and R27. No code implements it yet: G2 items 8 (wire contracts), 14 and 15 (worker journal and supervisor), and 17 (launch authority) build on it, and item 24 runs its failure scenarios.

## 1. Purpose and parties

Receiving or acknowledging an assignment does not permit a launch (invariant 13). Before starting a new execution, a worker asks the control plane for a **launch authorization**: a short-lived, single-execution grant that the control plane issues in one PostgreSQL transaction, after comparing the current authoritative state with what the worker expects.

- **Worker:** the enrolled worker service ([trust model](../trust-model.md)) that holds the assignment. It journals every step under the worker journal contract (G2 item 5, `define-worker-journal-contract`).
- **Execution supervisor:** the per-execution supervisor process of decision D7 (c) that spawns and owns the child, under the supervisor identity contract (G2 item 4, `define-supervisor-identity-contract`).
- **Launch authority:** the control-plane service that runs the authorization transaction against PostgreSQL.

By decision D12 (a), the request is an HTTPS operation in the OpenAPI document, called by the worker; commands and observations stay on NATS. The check therefore fails closed when the control plane is unreachable, whatever the broker's state.

## 2. Identities and compared values

| Value | Source | Compared with |
| --- | --- | --- |
| `installationId`, `recoveryEpoch` | Installation record; the epoch changes only by the [disaster recovery procedure](../architecture.md#disaster-recovery-authority) | The epoch the worker holds; the installation must not be in restore quarantine |
| `workerId`, credential generation | The authenticated worker principal, never a request field | An enrolled, unrevoked worker at its current credential generation |
| `assignmentId`, `attemptId`, `ownershipGeneration` | The assignment command the worker journaled | The current assignment: active, held by this worker, at this generation; the attempt not cancelled or terminal |
| `executionId` | Created and journaled by the worker before the request (item 4) | No other execution authorized or started for the attempt |
| Admission and gates | The task's admission record ([`sdlc-task-admission`](../../openspec/specs/sdlc-task-admission/spec.md)) | The admission is used by this task and not superseded; every gate it relied on is still `passed` for the same artifact revisions |
| Artifact revisions | The admission's bound revisions | Still the current revision of each artifact |
| `policyRevision` | The workflow run binding | The run's current policy revision |
| Capacity reservation | The reservation created with the assignment (item 6) | Still held for this attempt on this worker |
| `operationId` | Created and journaled by the worker before the first request | Idempotency key of the request (section 5) |

## 3. The authorization transaction

The transaction is the **linearization point** of a launch. It runs at PostgreSQL `SERIALIZABLE` isolation and does, in one transaction:

1. Read the installation record; reject if quarantined or if the worker's `recoveryEpoch` is not current.
2. Read the worker principal, the assignment, the attempt, the admission and its gates, the bound artifact revisions, the run's policy revision, and the capacity reservation; reject on the first mismatch with the values in section 2.
3. Reject if another live authorization exists for the attempt with a different `executionId`, or if a start of the attempt has been recorded.
4. Insert one launch authorization row: `launchAuthId`, every compared value, `operationId`, `issuedAt` from the database clock, `ttl`, and `skew`; and move the attempt to `launch-authorized`.

A serialization failure aborts the transaction; the authority retries it with the same `operationId`, and the worker sees either one result or a retryable error. The authorization cannot be atomic with the operating-system process start; section 6 bounds the gap between them.

## 4. Invalidation ordering

Every transaction that changes a compared value also runs at `SERIALIZABLE` isolation: a gate decision or reopening, a new artifact revision, a policy revision, an ownership change, a cancellation, a released reservation, a worker revocation, and entering restore quarantine. PostgreSQL then orders it either before or after each authorization transaction it conflicts with:

- **Before:** the authorization reads the changed value and rejects the launch with the matching reason.
- **After:** the invalidating transaction must read the live authorizations it affects, mark each `revoked` with its reason, and write a cancellation command for the attempt to the outbox in the same transaction.

Revocation after authorization is a cancellation request, not proof that no process started. If the process has started, cancellation is best-effort toward native and external side effects, and the attempt's outcome follows the stop and reconcile policy of [architecture section 6](../architecture.md#first-class-sdlc-with-replaceable-frameworks). Output of a revoked execution is kept as audit evidence and is not accepted as current-policy completion without revalidation.

## 5. Request, response, and idempotency

The worker journals `operationId` and `executionId` before its first request (item 5), then sends them with `assignmentId`, `attemptId`, `ownershipGeneration`, `recoveryEpoch`, and the admission identity it holds.

- **Granted:** `launchAuthId`, `issuedAt`, `ttl`, `skew`, and the bound values.
- **Rejected:** a reason from section 8 and whether the worker may retry. A rejection is final for that `operationId`.
- **Transport retry:** the worker repeats the request with the same `operationId`. The authority returns the recorded result for that `operationId` without a new transaction, as long as the authorization has not expired. A repeat with the same `operationId` but different values is rejected with `operation-mismatch`.
- **Re-authorization:** after expiry or a retryable rejection, the worker journals a new `operationId` and runs the whole check again; the same `executionId` may be authorized again only while no start of it has been recorded or reported.

## 6. Expiry and clock safety

The protocol parameters are the authorization's `ttl` and `skew`, provisionally `30s` and `5s` ([operational targets](../operational-targets.md)); the response carries them, `skew` must be less than `ttl`, and an installation may change them only within the operational targets.

- **Worker deadline:** the worker reads its **monotonic** clock before sending the request and may hand the authorization to the supervisor only before that reading plus `ttl` minus `skew`. Because the reading precedes `issuedAt`, this deadline is never later than the server's expiry, whatever the worker's wall clock says.
- **Supervisor:** before spawning, the supervisor journals the `launchAuthId` and `executionId` as its launch record (item 4). It does not spawn after the deadline. A spawn begun before the deadline is a start under that authorization.
- **Restart:** a worker or supervisor that restarts with a journaled authorization but without proof of a start does not spawn. It first reconciles by `executionId` (item 4); only if no execution exists does it re-authorize (section 5).
- **Server side:** safety does not depend on the worker's clock alone. An authorization covers one `executionId` and one start. A start observation is accepted only for a granted authorization of that execution. A start reported for an expired, revoked, or unknown authorization becomes an `unauthorized-start` fact: the authority writes a cancellation command and keeps the evidence, and the execution is reconciled, never adopted as current work.

## 7. Offline and quarantine behavior

- An offline worker, or one that cannot reach the launch authority, starts no queued work. It retries with the backoff of the operational targets (initial `5s`, maximum `60s`, with jitter), with the same `operationId` while its authorization could still be returned and a new one after that.
- Already started work may continue within its admitted scope and the configured offline policy.
- In restore quarantine the authority grants nothing. Authorizations from an older `recoveryEpoch` fail closed, and workers reconcile or re-enroll as the [trust model](../trust-model.md) requires before any resumption is authorized.

## 8. Rejection reasons

| Reason | Retryable | Meaning |
| --- | --- | --- |
| `quarantined` | yes | The installation is in restore quarantine |
| `stale-recovery-epoch` | no | The worker's epoch is not current; reconcile first |
| `worker-not-authorized` | no | Revoked, unknown, or outdated worker credential |
| `stale-ownership-generation` | no | The assignment moved to another generation or worker |
| `attempt-not-launchable` | no | The attempt is cancelled, terminal, or already started |
| `gate-not-passed` | no | A gate the admission relied on is no longer `passed` |
| `artifact-revision-changed` | no | A bound artifact has a newer revision |
| `policy-revision-changed` | no | The run's policy revision changed |
| `capacity-not-reserved` | no | The reservation is released or held elsewhere |
| `execution-conflict` | no | Another execution of the attempt is authorized or started |
| `operation-mismatch` | no | The `operationId` was used with different values |
| `unavailable` | yes | A transient failure inside the authority |

A non-retryable rejection is reported as an observation; the scheduler decides the attempt's next step.

## 9. Required tests

Items 17 and 24 implement these as tests through the deterministic test harness (item 10), as R27 requires:

- Each compared value changed after queueing rejects the launch with its reason.
- An invalidation raced with the authorization transaction lands either before it (rejection) or after it (revocation and a cancellation command), never neither.
- A worker that disconnects before authorization starts nothing; after authorization and start, cancellation is reported as best-effort.
- A transport retry returns the same authorization; a changed request under the same `operationId` is rejected.
- A worker whose wall clock is wrong by more than `skew` still stops handing out an authorization at its monotonic deadline; a late start is recorded as `unauthorized-start`.
- A restart with a journaled authorization and no start proof does not spawn before reconciliation.
- Quarantine and an old `recoveryEpoch` grant nothing.
