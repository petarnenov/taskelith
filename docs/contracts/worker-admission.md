# Worker admission contract

Date: 2026-10-28. Status: G3 ([G3 work plan](../g3-plan.md) item 27, `implement-worker-self-check-admission`), under independent review. It defines the worker admission port that [ADR 0008](../decisions/0008-product-ui-and-integration-authority.md) decision 6 places behind a microkernel port, and the automatic admission of decision 5: a worker enrolled with a one-time token is admitted once its self-check passes. "Worker admission" is always qualified here; it is neither the admission of a task to a stage nor admission pressure ([capacity reservation](capacity-reservation.md) section 8).

## 1. Parties

| Part | Owner | Implemented by |
| --- | --- | --- |
| `WorkerAdmissionCheck`: one check the worker runs | Fleet | Adapters composed in `apps/worker`; in G3 only `linux-containment` |
| The self-check report and the worker admission decision | Fleet | `apps/worker` journals the report; the control plane applies it |
| The worker admission state that placement reads | Scheduling (`WorkerPlacementRecord.admitted`) | The PostgreSQL and in-memory capacity adapters |
| `WorkerAdmissionView`: the workers view | Fleet | In-memory and PostgreSQL adapters |

The port is not frozen into the plugin SDK; the first check delivered by a plugin package freezes it.

## 2. The check port

A check has a `checkId` of 1-64 lowercase letters, digits, and `-`, starting with a letter, a `scope`, and `run()`. The scope names the platforms the check covers and whether it needs a launch command. `run()` resolves to `passed`, or to `failed` with its problems; it cannot answer `not-applicable`.

A result has the `checkId`, an `outcome` of `passed`, `failed`, or `not-applicable`, and `details`. A `failed` result has at least one detail, each a problem; a `not-applicable` result has exactly one, its reason; a `passed` result has none.

## 2a. Not applicable

`not-applicable` is decided in one place, `notApplicableReason`, only at the worker's start and only from local facts: the host platform and whether a launch command is configured.

| Fact | Reason |
| --- | --- |
| The platform is not in the check's scope | `platform-not-covered` |
| The check needs a launch command and none is configured | `no-launch-command` |

A check found not applicable is not run, and its result is journaled with its reason. A check that runs and fails is `failed`; a worker can never report `not-applicable` to skip a failed check.

## 3. The self-check report

- **Composition.** At most 8 checks, each with a distinct, well-formed `checkId`. A worker composed otherwise fails its start before enrollment or any journal write, so no check is ever left out of a report.
- **When.** At every start, before the broker session, the worker runs every composed check in `checkId` order, then journals one `self-check-reported` fact after the capacity declaration and the admission pressure report. A check that throws or rejects is `failed`, with its message as the detail. A failed check never fails the start.
- **Bounds.** One result per composed check, so at most 8, and at most 8 details per result. Each detail is redacted by `redactSecrets` and cut to 1024 characters with no control characters (`DisplayText`).
- **Wire.** The fact is published as `worker.self-check.reported` on the worker's observation subject ([execution wire contracts](execution-wire-contracts.md) section 5). Its declaration number equals its journal sequence, so its `observationId` is unique per report within the journal.
- **Worker side.** While the report of its current start holds a `failed` result, the worker refuses every new offer with `worker-self-check-failed`, which ends the assignment, and requests no launch authorization. It still applies cancellations and assignment ends, reconciles, answers inventory requests, and sends heartbeats.

## 4. The `linux-containment` check

Composed on every worker, so every report holds a result:

| Worker | Outcome |
| --- | --- |
| macOS | `not-applicable` with `platform-not-covered` |
| Linux without launch settings | `not-applicable` with `no-launch-command`: the worker launches nothing |
| Linux with launch settings | `checkLinuxContainment` with `/sys/fs/cgroup`, the containment parent, the home cgroup read from `/proc/self/cgroup`, and the execution account: `passed` on success, otherwise `failed` with its problems; an unreadable home is `failed` |

The check proves what [supervisor identity](supervisor-identity.md) section 8 requires of a Linux worker.

## 4a. The control plane decision

The control plane decides the worker admission from the report and the enrolled host platform (`decideWorkerAdmission`). **Trust model.** The self-check is self-attested: the enrolled worker runs it and reports it, and the control plane cannot prove a `passed` or a `no-launch-command` result. What the control plane enforces is the consequence of the state: placement (section 7) and new launch grants go only to an `admitted` worker.


- A `not-applicable` result counts as `failed`, with the detail `not-applicable without a recognised reason: ...`, unless it holds exactly one recognised reason that agrees with the enrolled platform and, for a check the control plane knows, with its scope: `platform-not-covered` only for a platform outside the scope, and `no-launch-command` only for one inside it.
- A required check missing from the report counts as `failed` with the detail `the check was not reported`; in G3 `linux-containment` is required.
- A check named more than once, with equal or different results, is stored once as `failed` with the detail `the check was reported more than once`; the schema cannot refuse it, and it never leaves the worker admitted.
- A `not-applicable` result whose reason is not `platform-not-covered` or `no-launch-command` is malformed: the schema refuses the report, which is quarantined unapplied ([execution wire contracts](execution-wire-contracts.md) section 2), and the worker admission is unchanged. The rules above decide only reports that pass the schema; the decision still counts such a result as `failed` if one reaches it.
- The stored results are ordered by `checkId`.

## 5. Worker admission states

| From | Event | To |
| --- | --- | --- |
| (none) | Enrollment | `awaiting-self-check` |
| any | A report above the self-check fence with no `failed` result | `admitted` |
| any | A report above the self-check fence with a `failed` result | `self-check-failed` |
| any | A new journal incarnation | `awaiting-self-check` |

- A report whose results are all valid `not-applicable` results admits the worker: a macOS worker, and a Linux worker without a launch command.
- A passing report after a `self-check-failed` one admits the worker again.
- A report at or below the fence changes nothing. The fence restarts with the other fences of a new journal incarnation.
- Revocation is independent: a revoked worker is never placed.
- Workers enrolled before this contract start `awaiting-self-check` and are admitted by the report of their next start.

## 6. Stored outcomes

In the observation consumption transaction, at `SERIALIZABLE`, a report replaces the worker's stored results (check, outcome, details) and records the database time of its consumption. A new journal incarnation clears them. Only the latest report is kept.

## 7. Placement

Placement offers work only to an `admitted` worker, in addition to the eligibility rules of [capacity reservation](capacity-reservation.md) section 11 (`worker-not-eligible`). An ungranted assignment on a worker that is not admitted is due for supersession at once, as on a draining worker; when a report above the fence makes the worker `self-check-failed`, the same transaction frees each of its unfinished assignments that holds no grant, as a revocation does. The launch authority gives a new operation of a worker that is not `admitted` the non-retryable rejection `worker-not-authorized` ([launch authorization](launch-authorization.md) section 9), which releases its assignment. A replay of a recorded grant is answered as before, and a running execution on a worker whose self-check failed keeps its ownership and its reservation until it ends normally; the failed self-check revokes no grant.

## 8. The workers view

`WorkerAdmissionView.workers()` returns `asOf` and every enrolled worker that is not revoked, in identifier order: `workerId`, host, enrollment time, worker admission state, the time of the last consumed report, and each stored result. It is installation scoped: Access checks `installation-owner` before the call ([product ports](product-ports.md) section 2, rule 1). It holds no credential or credential hash. When a source cannot be read it fails with `unavailable` and returns no partial data. The administrative command `worker-admission` prints it as JSON once the operator credential is verified ([installation contract](installation-and-enrollment.md) section 4), with every detail redacted again by `redactSecrets`; `make verify-installation` reads it. Item 9 maps it onto the OpenAPI document; item 33 shows it.

## 9. Required tests

- Placement offers nothing to an `awaiting-self-check` or `self-check-failed` worker, and a failed report frees an accepted assignment that holds no grant.
- The launch authority refuses a new operation of a worker that is not admitted with `worker-not-authorized`, and still replays a recorded grant.
- Existing workers are `awaiting-self-check` after the migration.
- Each transition of section 5, a stale report, and an all-`not-applicable` report.
- The worker journals one report per start before any broker connection; a throwing check is `failed` and the start succeeds; details are redacted and bounded.
- The worker refuses an offer with `worker-self-check-failed` and requests no grant while its self-check failed.
- A macOS worker and a Linux worker without a launch command report `not-applicable` without running the check, and are admitted.
- The control plane counts a `not-applicable` result without a recognised reason, and a missing required check, as `failed`.
- A running execution keeps its assignment through a failed self-check and ends normally.
- The `linux-containment` adapter for each row of section 4.
- A shared conformance suite for the store and view adapters: a check named twice, and a source that cannot be read, which is `unavailable` with no partial data.

## 10. Not in this contract

- An HTTP operation or event for the view (item 9) and the workers screen (item 33).
- An operator override of a failed self-check and a bounded history of past reports: later possibilities for the owner, not decided here.
- A macOS check and periodic checks.
