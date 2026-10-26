## Context

Defect D1 of G2 item 24b, decided by the owner's delegate in away run `20261026T161148Z-opencode-90873`, option (b): `LaunchRequest` gets an optional `reportsNotStartedFor { executionId, operationId }`; the authority applies the referenced execution's `not-started` first, then the ownership rule for the new execution, in one transaction; the worker's continue-launch and relaunch requests fill it from the sealed execution. The [launch authorization contract](../../../docs/contracts/launch-authorization.md) sections 4, 6, and 9 and the [worker journal contract](../../../docs/contracts/worker-journal.md) section 5 are the sources.

## Goals / Non-Goals

**Goals:** a new execution of a launch is granted although the sealed predecessor's observation has not reached the authority; one transaction; no new rejection reason; an additive, optional API field.

**Non-Goals:** changes to the 24b harness beyond its D1 windows (tasks group 4); the 24c cancellation path of the launch orchestrator; ordering the worker's outbox before a relaunch.

## Decisions

### D1. The report is applied in the domain, before the ownership rule

`authorizeLaunch` runs every check of contract section 2 first, so a request that fails one of them records nothing for either execution, and the observation settles the predecessor later. Then `recordReportedSeal` returns the attempt with the reported execution moved to `not-started`, and `applyOwnershipRule` decides the new execution on that attempt. The result is one task, written once by `tx.tasks.replace` in the deciding SERIALIZABLE transaction; the grant index (`launch_authorizations.live`) of both executions follows from the same write. A crash before the commit (`LaunchAuthorizationCommit.before`) leaves neither change.

### D2. Validation rules

The reported execution, looked up in the request's task:

| Found as | Result |
| --- | --- |
| Not found | Nothing to record: the authority never granted it, for example a W2 whose request never arrived |
| `not-started` | Accepted, nothing changes: its observation arrived first, or an earlier request reported it |
| `authorized`, of the request's attempt and worker, and the operation names no grant of another execution | Moved to `not-started` |
| `started` or `exited`, of another attempt or worker, or the operation granted another execution of the same worker | `execution-conflict` |
| The requested execution itself, found or not | `execution-conflict`, checked before the lookup |

The operation need not name a grant of the execution. W6 closes a pending operation as `expired`, and that operation's request may never have reached the authority although an earlier operation granted the execution; requiring a match would make that recovery final. An operation that granted another execution is a worker defect and conflicts. The authority does not look up other tasks' operations: a report names an execution of the request's own attempt, so another task's execution is "not found" and changes nothing.

`execution-conflict` is the reason contract section 9 already gives the ownership rule; the report is part of that rule, so no new reason is needed.

**Deviation from the brief.** The coordinator's brief said to "validate that the operation matches" the operation that authorized the execution. This change does not require that match: the attempt, worker, and state checks already bind the seal to the worker's own unspawned execution, and an exact match would send the W6 case above back into `rejected-final`. The coordinator accepted this deviation. The rules are:

- An unknown `operationId` is accepted; the attempt, worker, and state checks still apply.
- An execution already `not-started` is idempotent: accepted, nothing changes.
- An unknown execution is a no-op.
- A mismatch (an operation that granted another execution of the same worker), a `started` or `exited` execution, or a report naming the requested execution itself is `execution-conflict`. The self-reference is checked first, so it conflicts also when the authority never granted that execution (review pass 1).

### D3. Idempotency

- **Transport retry** of the same `operationId`: answered from the recorded grant (contract section 6), which already holds the sealed execution; nothing is applied twice.
- **Recorded final rejection:** replayed from `launch_rejections`, as before.
- **Late observation:** `recordNotStarted` finds the execution `not-started` and returns `duplicate`; `recordTerminalFact` then writes nothing. Its capacity-refusal clearing is skipped, which is correct because the new execution of the same assignment holds the slot.
- **Observation first:** the report is accepted and changes nothing.
- The report is not an expected value, like `reportsNotStarted`, so it is not compared for `operation-mismatch`.

### D4. Which execution the worker reports

Every execution a `Launch` authorizes, new at a start's continue-launch or at a runtime relaunch, or resumed after a retryable rejection or an expired operation, reports `lastSealedExecution(snapshot, assignmentId)`: the intent's last journaled `not-started` execution, with its last granted operation, else its last operation. A resumed execution also keeps `reportsNotStarted`. It is never `not-started` itself, so it never reports itself. Review pass 1 found the resumed case: E1 sealed, E2's operations closed `expired` while the authority was down, then a restart resumes E2 while E1's observation is undelivered. At a new or resumed execution every other execution of the intent is `not-started` (`#launch` refuses otherwise), and each earlier relaunch already made its predecessor terminal at the authority, so only the last one can still own the attempt.

## Risks / Trade-offs

- A crash after a relaunch's W2 and before its request reached the authority, while the predecessor's observation is also still undelivered: the next start reports the newest sealed execution, which the authority never granted, and the older owner still blocks it. The single reference of option (b) cannot name both; this double fault ends the launch as before the fix. Reporting the older execution instead would fail the more likely case of a granted, sealed newest one. Follow-up candidate: "reportsNotStartedFor for every unconfirmed sealed execution of the intent". The owner's delegate decided the single-reference shape, and the coordinator keeps the follow-up out of this change.
- The weaker operation check (D2) accepts an operation the authority never recorded; the execution, attempt, worker, and state checks still bind the report to the worker's own unspawned execution.
