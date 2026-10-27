## Context

20b journals each command by W1 and publishes command outcomes. Item 14's journal already provides the commits W2 to W6, item 15's `@taskelith/worker-supervisor` provides `prepareRecord`, `startSupervisor`, `sealLaunch`, `requestCancellation`, `readReportedFacts`, and `recoverExecution`, and item 17 provides `LaunchAuthorityClient` with `HttpLaunchAuthorityClient`, `workerLaunchDeadline`, and `checkLaunchPreconditions`. This change connects them in the worker. The [launch authorization contract](/docs/contracts/launch-authorization.md), the [worker journal contract](/docs/contracts/worker-journal.md) section 5, and the [supervisor identity contract](/docs/contracts/supervisor-identity.md) section 4 fix the order.

## Coordinator decisions (2026-10-25)

- **Q1 (a): evidence.** 20c delivers the `publishEvidence` client and its port; no launch calls it in G2. G2's result is the exit observation that 21b stores; evidence publication from a launch joins the harness in G3.
- **Q2 (a): exit evidence.** Only the live termination evidence is mapped. **Obligation on 20d:** the asyncapi amendment for `boot-changed` and `namespace-ended`, through the coordinator.
- **Q3 (a): settings.** The launch command and the Linux launch settings are optional; without the command the worker accepts intents and never launches them.

## Goals / Non-Goals

**Goals:**
- W2 and W3 around every authorization request, the retry loop of launch authorization section 8, and the worker deadline of its section 7 with its suspend cases;
- the launch sequence CP2 to CP12 through the supervisor adapter, and the observations `started`, `exited`, `not-started`, `uncertain`, and `launch.rejected`;
- cancellation forwarding, the offline rule, and the `publishEvidence` client.

**Non-Goals:**
- start reconciliation of executions a previous process left (the record recovery, adoption, a dead supervisor, `termination-unproven`, `unrecorded-process`, and `cancellation.not-applied`), removal of an execution record after its terminal fact is confirmed, the heartbeat, and the inventory on reconnect (20d);
- admission pressure, the disk floor, and the backlog limit (20e);
- consuming start observations and `launch.rejected` on the control plane (item 21, 21d);
- the harness invocation an offer runs (G3).

## Decisions

### D1: one launch per intent, driven from the journal

`LaunchOrchestrator` reads the journal snapshot when intake commits a command, when a launch ends, and at a fixed interval. It takes the `continue-launch` and `forward-cancellation` actions of `planJournalRecovery`, so a running worker and a restarted one decide from the same rules. A `continue-launch` for an intent it is already launching is skipped; only intake adds intents, and admission already bounds their number by the slots (20b D3).

- Executions that a previous process, or a stopped launch, left in another state than `not-started` (a pending W2, a grant, or a written record) are not touched: their recovery is 20d's. Until then such an intent is not launched again, which is safe, since it never widens effects.
- **Alternative:** an in-memory queue fed by intake. It would need its own recovery after a restart and would diverge from the journal.

### D2: the authorization loop

For a launch, the orchestrator draws a new `executionId` and `operationId`, reads the deadline clock, and commits W2 with the intent's expected values. Then it requests a decision:

| Answer | Action |
| --- | --- |
| A failure (`unavailable`, a timeout, any other error) | No decision is known. Before the deadline, wait the retry delay and repeat the same `operationId`; after it, abandon the execution (D3) |
| `granted` | W3 with the grant; before the deadline continue with D4, otherwise abandon |
| `rejected`, retryable | W3 records it; wait the retry delay, then W2 a new `operationId` for the same execution, with a new clock reading |
| `rejected`, not retryable | W3 records it with its `launch.rejected` observation; the launch ends |
| `revoked` | W3 records the revocation reason as a rejection: retryable for `quarantined`, otherwise final |
| `expired` | A grant existed and is no longer usable; abandon the execution. The operation stays `pending` in the journal, since W3 has no outcome for it; a possible journal follow-up for 20d |

- **Deadline.** The reading precedes the operation's first request and is kept for its retries, so a retry never extends it (`workerLaunchDeadline`). The clock is the supervisor platform's `DeadlineClock` (`CLOCK_BOOTTIME`, `mach_continuous_time`), which counts suspended time; a reading in another boot, or a clock that cannot be read, never hands a grant out.
- **Retry delay.** `launchRetryDelay(retry, draw)` in Execution doubles a base from 5 s to 60 s and adds jitter below the cap, so every delay is within [5 s, 60 s] (operational targets, the retry row). It mirrors the placement backoff of item 18 but lives in Execution, since the worker must not depend on scheduling for it.
- **Offline.** A worker that cannot reach the authority stays in this loop and starts nothing. The deadline is checked before and after each delay, so no delay is slept once it has passed. A long outage therefore seals one execution, and reports one `not-started`, per deadline cycle; a note for 20d and 20e. The broker plays no part: commands may still be journaled, but nothing spawns without a grant.

### D3: abandoning an execution before W4

A grant past the deadline, an `expired` answer, or a deadline passed without a decision all leave an execution that must never spawn. The orchestrator creates the execution directory if needed and seals the launch record, reports `not-started` (W6) only once the seal is read back, and starts again with a new `executionId` and `operationId` (journal contract section 5, "W2 without an outcome, or W3 with a grant, and no W4"). The old operation is never sent again and its grant never used.

### D4: the launch sequence

After a usable grant:

1. **CP2.** `prepareRecord` writes `intent` with the grant's `launchAuthId`, the deadline as a reading of the deadline clock with its boot identity, the namespace incarnation on Linux, the supervisor version, the configured command, and on Linux the configured execution account.
2. **CP3.** W4 journals the record; from here on, a missing record is data loss, never proof of absence.
3. **CP4.** `startSupervisor` starts the detached supervisor in launch mode. If it cannot start, `recoverExecution` decides from the record: without a launch record it seals and the worker reports `not-started`.
4. **CP10 and CP12.** The orchestrator reads the record at an interval with `readReportedFacts`. A `handle` of a spawn commits W5s with the claimed `launchAuthId`, and a claim under another grant than its own is reported `uncertain` (review pass 3, L3); an `exit` commits W5e (after W5s when the handle shows a spawn); a launch record sealed by the supervisor, for example past its deadline, commits W6; a corrupt or newer-format file commits `uncertain` once and stops the observation, which 20d's recovery resumes.

An intent whose executions all end `not-started` is launched again under D2 (journal contract, the launch intent row), unless it has been cancelled or ended meanwhile.

### D5: cancellation forwarding

`forward-cancellation` names a journaled cancellation without evidence. Its target, an attempt or any execution of an intent, cancels the whole intent, as `planJournalRecovery` reads it (review pass 1, M1):

- a launch still in D2 stops; an execution with a pending W2 or an unused grant is abandoned as in D3;
- an execution whose record is journaled gets the `cancel` file through `requestCancellation`, which every supervisor of the execution acts on (supervisor identity section 8);
- the cancellation's evidence is recorded (`recordCancellationEvidence`) once no launch of the intent is live and every execution of the intent is settled: `exited`, `not-started`, or never granted and rejected, finally or retryably (review passes 2, M1, and 3, L1). A pending W2 without a live launch is not settled; 20d reconciles it.

A cancellation is never reported as termination: only the exit or the seal is.

### D6: execution facts carry their wire fields

The wire observations need more than the journal's facts held: `execution.started` needs the child's process identity and the recovery epoch, `execution.exited` the start proof, the spawn failure, and the termination evidence, and every execution observation the assignment, attempt, and ownership generation. `recordStart` takes the process identity and `recordExit` the whole exit; the journal adds the assignment reference and the intent's recovery epoch from its own join, so a caller cannot report a fact against another assignment. No execution fact was journaled before this change, so the stored JSON needs no format change.

- An exit whose termination evidence the wire does not allow (`boot-changed` or `namespace-ended`, which only a recovery writes) fails its mapping explicitly. Recovery is 20d's, and the wire amendment goes through the coordinator.

### D7: evidence publication

`EvidencePublisher.publish(record, content)` is the Execution port; `HttpEvidencePublisher` posts the multipart body of `publishEvidence` with the worker credential, validates the 200 or 201 answer against `EvidenceRecord`, maps 502, 503, 504, a timeout, or a lost connection to `unavailable`, and leaves the retry to its caller, since the producer-chosen `evidenceId` makes a repeat idempotent. G2's scripted process produces no SDLC evidence, so no launch calls it yet; the harness of G3 does.

### D8: launch settings

`TASKELITH_WORKER_COMMAND` names the program a launch runs as a JSON array of the executable and its arguments (wire contracts section 4: a test-only scripted process in G2). On Linux, `TASKELITH_CONTAINMENT_PARENT`, `TASKELITH_EXECUTION_UID`, and `TASKELITH_EXECUTION_GID` name the delegated cgroup and the execution account. Without a command the worker starts no orchestrator: accepted intents wait, and nothing claims a launch the worker cannot make.

## Risks / Trade-offs

- **A dead supervisor.** While the worker runs, a supervisor that dies leaves the execution `started` in the journal until a restart; detecting it needs the liveness probe of start reconciliation (20d).
- **Records are kept.** Execution records stay after their terminal fact until 20d removes confirmed ones.
- **Polling.** The record is read at an interval, not watched; a fact reaches the outbox at most one interval late.
