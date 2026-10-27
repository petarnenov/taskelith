## Context

[G3 work plan](/docs/g3-plan.md) item 27 (`docs/g3-plan.md:124`): the worker admission port and its first checks; a worker enrolled with a one-time token is admitted once its self-check passes, and failed checks are recorded for the workers screen; the checks include the existing Linux containment self-check, which no G2 production code calls. The deferral row "Worker self-check admission wiring" (`docs/g3-plan.md:51`) and [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 (`docs/decisions/0015-g2-closure.md:115`) assign it here.

### What the sources require

- [ADR 0008](/docs/decisions/0008-product-ui-and-integration-authority.md) decision 5 (`docs/decisions/0008-product-ui-and-integration-authority.md:66`): a worker enrolled with a one-time token is admitted automatically once its self-check passes.
- ADR 0008 decision 6 (`docs/decisions/0008-product-ui-and-integration-authority.md:68-70`): worker admission checks are delivered behind a microkernel port as plugins or adapters, and the port contract is defined in the gate that first implements it.
- [Product UI specification](/openspec/specs/product-ui/spec.md), "Automatic worker admission" (`openspec/specs/product-ui/spec.md:83-88`): a newly enrolled worker whose self-check fails is not admitted, and its failed checks are shown on the workers screen.
- [Supervisor identity contract](/docs/contracts/supervisor-identity.md) section 8 (`docs/contracts/supervisor-identity.md:117`): a Linux worker is admitted only if its self-check proves that a child can neither leave its containment nor change another one, and that the containment has a kill control.
- [Product ports contract](/docs/contracts/product-ports.md) section 8 (`docs/contracts/product-ports.md:270`) leaves the worker admission port to item 27.
- G3 item 33 (`docs/g3-plan.md:130`) builds the workers screen with "admission and self-check results"; item 9 (`docs/g3-plan.md:106`) maps "workers and enrollment tokens" onto the OpenAPI document. This item builds neither.

### What exists in G2

Line numbers in this section are those of dev `46e21ef1`, before this change.

- **Enrollment.** `EnrollmentService` uses a single-use token and adds the worker in one transaction (`FleetRegistry.enroll`, `packages/modules/fleet/src/ports/fleet-registry.ts:14`). The new `workers` row is enrolled, not revoked, not draining, and not reachable until its first contact ([installation and enrollment contract](/docs/contracts/installation-and-enrollment.md) section 5, `docs/contracts/installation-and-enrollment.md:57`).
- **Worker states.** The `workers` table (`packages/adapters/postgres/migrations/1792930000000_resource-admission.sql:75-86`) holds the booleans `enrolled`, `revoked`, `draining`, and `reachable`, the admission pressure and capacity refusal times, and, since the control-plane API, the protocol version. Placement reads them through `isEligibleForPlacement` (`packages/modules/scheduling/src/ports/placement-workers.ts:35-38`) and the SQL predicate `ELIGIBLE` (`packages/adapters/postgres/src/capacity-repositories.ts:49-50`). Nothing records a self-check, so a reachable worker with a common protocol version is placed on.
- **Worker start.** `startWorker` (`apps/worker/src/worker-start.ts:98`) opens the root or enrolls first (`enroll`, `:119`), then `startRuntime` (`:158`) declares capacity (`:174`), refreshes admission pressure (`:176`), and starts the broker session (`:178`).
- **Linux self-check.** `checkLinuxContainment` (`packages/adapters/worker-supervisor/src/linux-self-check.ts:24`) proves cgroup v2, a containment parent that the worker may create cgroups under, a `cgroup.kill` control, that the execution account cannot write the probe's, the parent's, or the home's `cgroup.procs`, and that the home is not at or under the parent. It is exported (`packages/adapters/worker-supervisor/src/index.ts:28`) and called only by `test/linux.test.ts` and `test/linux-cgroup.privileged.ts`. `supervisionHost` (`apps/worker/src/main.ts:97-115`) builds the platform and the containment scan without it. The archived design D3 cites the same function at lines 95-113, which were stale at dev `46e21ef1`; this change moves it to lines 99-117.
- **Observations.** Worker facts that change the worker record go through the journal and the observation outbox: `worker.capacity.declared` and `worker.admission-pressure.changed` ([execution wire contracts](/docs/contracts/execution-wire-contracts.md) section 5, `docs/contracts/execution-wire-contracts.md:63-64`). The control plane applies each under its own sequence fence (`apps/control-plane/src/application/observation-effects.ts:139-155`, registered at `:321-335`).

## Goals / Non-Goals

**Goals:** the worker admission check port and its report; the Linux containment check as its first adapter; worker admission states on the control plane with stored check outcomes; placement only on admitted workers; a read model of worker admission for the workers screen.

**Non-goals:** an HTTP operation or SSE event for the view (item 9); the workers screen (item 33, UI); an operator override and a history of reports (later possibilities, below); a macOS-specific check; freezing the port into the plugin SDK; TLS or remote enrollment (item 26).

## Decisions

### D1: The port is `WorkerAdmissionCheck`, owned by Fleet, with adapters

`packages/modules/fleet/src/ports/worker-admission-check.ts` defines:

```ts
type SelfCheckRun =
  | { readonly outcome: 'passed' }
  | { readonly outcome: 'failed'; readonly problems: readonly string[] };
interface WorkerAdmissionCheck {
  readonly checkId: string;
  readonly scope: SelfCheckScope; // platforms, needsLaunchCommand
  run(): Promise<SelfCheckRun>;
}
```

The journaled `SelfCheckResult` (`checkId`, `outcome` of `passed`, `failed`, or `not-applicable`, `details`) lives in `@taskelith/execution` beside the other journal facts, because Execution cannot import Fleet. A check cannot answer `not-applicable`; the worker derives it from the scope (D3).

A `SelfCheckId` is 1-64 lowercase letters, digits, and `-`, starting with a letter. `details` holds a `failed` result's problems, at least one, and a `not-applicable` result's one reason; a `passed` result has none. ADR 0008 decision 6 allows "plugins or adapters"; in G3 the only check is an adapter composed in `apps/worker`, because it needs the worker's settings. The port is frozen into the plugin SDK with the first check delivered by a plugin package, as the product ports contract does for `IntakeSource` (section 8). The module owning the port is Fleet, which already owns enrollment and is imported by the worker (`parseInstallationId`).

### D2: One self-check report per start, journaled before the broker session

At every start, before the launcher and the broker session, the worker runs each composed check in `checkId` order; after `declareCapacity` and the pressure refresh it journals one `self-check-reported` fact holding every result. A check that throws or rejects is `failed` with its message as the detail. A check never fails the start: a worker whose self-check failed still starts, reconciles, answers inventory, and sends heartbeats, so its report reaches the control plane. Each detail is redacted with `redactSecrets` and cut to 1024 characters without control characters (`DisplayText`); a report holds one result per composed check, at most 8, of at most 8 details each. A composition of more than 8 checks, or with a repeated or malformed `checkId`, fails the start before enrollment (`checkComposition`), so no check is left out of a report (review pass 1, M2). The fact takes a declaration number equal to its sequence, like `admission-pressure-changed`, so each report has its own `observationId` (`['self-check-reported', journalId, declaration]`). A crash after the checks and before the journal write runs them again at the next start.

### D3: The Linux containment check

The adapter `linuxContainmentCheck` in `apps/worker` has `checkId` `linux-containment`. It is composed on every worker, so every report holds at least one result:

Its scope is Linux with a launch command. `not-applicable` is decided in one place, `notApplicableReason` (`packages/modules/fleet/src/domain/worker-admission.ts`), only at the start and only from local facts, and journaled with its reason; a check found not applicable is not run, and any run outcome other than `passed` is `failed` (`runSelfCheck`, `apps/worker/src/self-check.ts`). A worker therefore cannot report `not-applicable` to skip a failed check.

- On macOS it is `not-applicable` with `platform-not-covered` (supervisor identity section 8 states the self-check rule for Linux only).
- On Linux with launch settings, which already require the containment parent and the execution account (`apps/worker/src/settings.ts:152-158`), it reads the home cgroup from `/proc/self/cgroup` with `parseCgroup` and calls `checkLinuxContainment` with `/sys/fs/cgroup`, the containment parent, the home, and the execution account; `ok` is `passed`, and each returned problem is a problem of a `failed` result.
- On Linux without launch settings it is `not-applicable` with `no-launch-command`, because the worker launches nothing ([worker runtime](/openspec/specs/worker-runtime/spec.md), "Launch settings"); a later start with a command runs it. Owner decision 2; supervisor identity section 8 now names "a Linux worker that can spawn executions (has a launch command)".

### D3a: The control plane checks not-applicable results

`decideWorkerAdmission` counts a `not-applicable` result as `failed`, with the detail `not-applicable without a recognised reason: ...`, unless it holds exactly one recognised reason that agrees with the enrolled platform and, for a known check, its scope. A required check missing from the report (in G3 `linux-containment`) is `failed` with `the check was not reported`. The AsyncAPI schema refuses a malformed reason, so that report is quarantined unapplied and the worker admission is unchanged; this rule refutes a recognised reason that the enrolled host contradicts, such as a Linux worker claiming `platform-not-covered`, and still fails a malformed one should it reach the decision. A check named more than once, which no JSON Schema can refuse, is stored once as `failed` with the detail `the check was reported more than once`, so the store never sees a repeated check and such a report never admits (review pass 1, M1 and M4).

### D4: Worker admission states on the control plane

The `workers` row gains `worker_admission`: `awaiting-self-check`, `admitted`, or `self-check-failed`. The term "worker admission" is always qualified, apart from task admission and admission pressure.

| From | Event | To |
| --- | --- | --- |
| (none) | Enrollment | `awaiting-self-check` |
| any | A report above the self-check fence with no `failed` result | `admitted` |
| any | A report above the self-check fence with a `failed` result | `self-check-failed` |
| any | A new journal incarnation (`replaceJournal`, fences restarted) | `awaiting-self-check` |

A report whose results are all valid `not-applicable` results admits the worker: the self-check passes when none of its checks failed after D3a, and a report always holds the containment result (D3). A passing report after a `self-check-failed` one admits the worker again, under the same identity (owner decision 4). Revocation is independent; a revoked worker is never placed whatever its worker admission. The migration sets every existing row to `awaiting-self-check`; such a worker is admitted by the report of its next start.

### D5: Stored check outcomes

The latest report replaces the worker's stored results in `worker_self_check_results` (`worker_id`, `check_id`, `outcome`, `details text[]`), and `workers.self_check_reported_at` records the database time of its consumption, in the observation consumption transaction at `SERIALIZABLE`. A new journal incarnation clears them. Only the latest report is kept (owner decision 7). The store port is `WorkerAdmissions` (`record`, `awaitSelfCheck`); the transaction member is `workerAdmissions`, because `admissions` already names task admissions.

### D6: Placement and supersession

`WorkerPlacementRecord` gains `admitted`, true exactly for `admitted`, and both `isEligibleForPlacement` and `ELIGIBLE` require it. Scheduling keeps a boolean, since Fleet imports Scheduling and not the reverse. `isSupersessionDue` treats a worker that is not admitted like a draining one: an ungranted assignment on it is superseded at once ([resource admission](/openspec/specs/resource-admission/spec.md), "Bounded supersession and retries"). Executions already granted continue, as on a draining worker: a running execution keeps its ownership and reservation until it ends normally, and a failed self-check revokes no grant (owner decision 3). The board's fleet obstacle stays `worker-not-eligible`; the capacity reservation contract's row for that reason names a worker that is not admitted.

### D7: Wire additions without a new protocol version

`execution.asyncapi.json` adds `selfCheckReported` (`worker.self-check.reported`) to the worker observation channel, with a payload of the results of D2, and `worker-self-check-failed` to `RefusalReason`; its `info.version` moves from `0.6.0` to `0.7.0`. The execution protocol version stays 1: a worker of this build that cannot report never reaches `admitted` and is never placed, which is the compatibility rule's "drained and upgraded before it receives work" (`docs/contracts/execution-wire-contracts.md:32`); the control plane is upgraded first and knows both values. The owner's delegate accepted 0.7.0 with protocol version 1 on 2026-10-28; it stays a risk (below).

### D8: The worker refuses offers while its self-check failed

While the report of its current start holds a `failed` result, the worker refuses every new offer with `worker-self-check-failed`, which is not retryable on that worker and ends the assignment, and requests no launch authorization. This closes the window between the start and the control plane's consumption of the report. Cancellations, assignment ends, start reconciliation, inventory, and heartbeats are unchanged. Reusing admission pressure was rejected: pressure is transient, re-measured every 5 seconds, and bounded by a 10 minute supersession, while a failed self-check holds until the next start.

### D9: The workers view

Fleet owns `WorkerAdmissionView.workers()`, which returns `asOf` and every enrolled worker that is not revoked, in identifier order, with its host, enrollment time, worker admission, the time of its last report, and each stored result. It is installation scoped: Access checks `installation-owner` before the call (product ports contract section 2, rule 1). It fails with `unavailable` and never returns partial data. It carries no credential or credential hash. In-memory and PostgreSQL adapters implement it with a shared conformance suite, whose fixture can make one worker's record unreadable to prove `unavailable` with no partial data (review pass 1, M5); item 9 maps it onto the OpenAPI document. Reachability and capacity stay with the views that item 9 and item 33 define.

### D10: Tests

Fail-before tests (recorded in `verification.md`): a Linux worker without a launch command and a macOS worker report `not-applicable` and are admitted; a `not-applicable` claim the enrolled host contradicts counts as failed; a running execution keeps its assignment through a failed self-check; placement skips an `awaiting-self-check` and a `self-check-failed` worker; a report with a failed result makes an admitted worker `self-check-failed` and stores its problems; a report below the fence changes nothing; a new journal incarnation returns the worker to `awaiting-self-check`; an all-`not-applicable` report admits; the worker journals one report per start before any broker connection; the worker refuses an offer with `worker-self-check-failed` and requests no grant; the Linux adapter maps `checkLinuxContainment` results and a `/proc/self/cgroup` read failure; a throwing check is `failed` and the start succeeds; details are redacted and bounded; supersession of an ungranted assignment on a worker that is not admitted. Coverage stays at least 75% of lines, branches, and functions.

## Risks / Trade-offs

- **Docker evidence.** The real check runs only in the Linux worker image with a delegated cgroup. `make verify-installation` and `make verify-linux-cgroup` use Docker and must show that the composed worker is admitted; the developing worker runs them before the handoff (task 5.6), and the coordinator runs them again at integration.
- **Wire version.** `execution.asyncapi.json` moves to `0.7.0` with an added observation and refusal reason under execution protocol version 1. A worker of an older build never reports and is never admitted, and an older control plane would not know the new values; the upgrade order (control plane first) carries this, not the protocol version. Accepted by the owner's delegate on 2026-10-28 and kept as a risk.
- **Every worker restarts after the upgrade.** Existing workers are `awaiting-self-check` until their next start; until then nothing is placed on them.
- **Spawn as another account.** The check spawns probes as the execution account, which needs the same privilege the supervisor already uses; a worker without it fails the check, which is the intended outcome.
- **Test compositions.** Test-side compositions inject a passing check, so the G2 scenarios keep running on macOS and on hosts without cgroup delegation.

## Owner decisions

The owner's delegate (away run `20261027T221456Z-claude-88683`) answered every open question with (a) on 2026-10-28; these are owner decisions.

1. **When checks run:** at every start (D2).
2. **Linux worker without a launch command:** `not-applicable` with `no-launch-command`, admitted (D3); `docs/contracts/supervisor-identity.md` section 8 is amended to name a Linux worker that can spawn executions. Not-applicable is decided only at the start, from local facts, and journaled with its reason (D3); the control plane counts one without a recognised reason as failed (D3a).
3. **An admitted worker whose later self-check fails:** `self-check-failed`; it refuses offers with `worker-self-check-failed` (D8), and its running executions keep their ownership and reservation until they end normally (D6).
4. **Re-admission after a failure:** automatic on the next passing report, same identity, no new token (D4).
5. **Operator override:** none in this item.
6. **macOS:** the containment check is `not-applicable` with `platform-not-covered`, and macOS workers are admitted (D3).
7. **History:** only the latest report (D5).

### Later possibilities for the owner

- An `installation-owner` override that admits a worker despite a failed check, audited (question 5, option b).
- A bounded history of past reports (question 7, option b).

## Review checklist

Review checklist (capabilities installation-enrollment, worker-platform-foundation, worker-runtime, trust-and-operational-foundation, product-ports, resource-admission), most frequent finding categories first:
1. contract-drift (25): Code, a contract document, and its specification disagree. Example: "Merge readiness counts passed gates, which holds vacuously for a stage without gates, unlike the G2 stage rule"
2. spec-wording (14): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Withdrawn requests map to not ready even when every gate passed, and auto merge on before a request has no value"
3. docs (7): Documentation is missing, wrong, or out of date with the change. Example: "The safe-to-retry conflict with the supervisor identity contract was recorded only as a limitation"
4. naming (5): A name hides intent or uses two terms for one concept. Example: "The board read model reuses the waiting reason names that Scheduling exports with another meaning"
5. redaction (2): A secret or private value can leak into output, logs, or records. Example: "Sequential split and join replacement breaks overlapping occurrences, redacts inside markers, grows the output, and hides a touched shape secret's suffix"
6. concurrency-race (1): Concurrent operations can interleave into a wrong state or result. Example: "The standing rule use race is stated in commit order, not in serialization order"
7. error-handling (1): A failure is swallowed, misreported, or leaves inconsistent state. Example: "A journal read before W2 that found the journal stopped was deferred and retried instead of ending the launch."

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (60): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (45): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. spec-wording (26): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
4. stale-citation (23): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (11): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (9): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"

Dev commit: 46e21ef19e624bc50f264a5b307e3058292ee294.

Saved the checklist to openspec/changes/implement-worker-self-check-admission/checklist.json.
