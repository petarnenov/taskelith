# Verification

Date: 2026-10-26. Author verification is recorded below, followed by the review passes.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, split by the coordinator; this is 20d. The coordinating session (Niki) assigned it to the worker session Pepi. The reviewer is OpenCode with `opencode-go/kimi-k3.1-pro` (`high`), as the coordinator assigned, with a cap of three passes.

- Base revision: `85797b8` on `dev`.
- Scope: as the design's coordinator decisions state.
- Out of scope: 20d2 (`implement-worker-contact-and-offline`), the `unrecorded-process` follow-up, and 20e.

### Coordinator decisions (2026-10-26)

- **Q1 (A):** 20d covers the start reconciliation (every `planJournalRecovery` action, recover and adopt, retry or uncertain, a dead supervisor, record removal, leftovers, the expired-pending and deadline-cycle fixes), the AsyncAPI 0.5.0 amendment for `boot-changed` and `namespace-ended` (approved, with a compatibility check and a version bump), and structured logs. The heartbeat, the `status()` watcher, lost-contact and offline mode with reachability, the inventory on every reconnect, and the failed-first-connect requirement change go to 20d2.
- **Q2 (A):** 20d adds the journal facts and wire mapping of `termination-unproven` and `cancellation.not-applied`; `unrecorded-process` (the Linux cgroup scan) is a separate follow-up.
- **Journal format:** the terminal-confirmed query, the W3 `expired` outcome, and the new fact kinds are approved, with a format step, a migration, and a spec delta.
- Any wire-contract change beyond the approved amendment goes through the coordinator; none was made.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, Docker with the Compose services of `make verify`.
- Dependencies: no third-party package added. `apps/worker` gains the workspace dependency `@taskelith/observability`; the regenerated inventory differs only by it.
- Contracts: `execution.asyncapi.json` 0.4.0 to 0.5.0; `make contract-compatibility` reports the breaking changes the minor bump declares (the major is 0). `docs/contracts/execution-wire-contracts.md` and `docs/contracts/worker-journal.md` updated.
- Journal: format 3, with a migration from format 1 (through 2) and from format 2 in one transaction (`worker-journal.test.ts`).

## Author self-check

- **Start reconciliation:** a pending W2 and an unused grant are sealed on start, the second reported `uncertain` when a claim won; a written record goes to the recovery table: an exit found by recovery, a retry repeated once with the round `after-retry`, an adopting recovery observed to its exit, an uncertain recovery reported once with its reason and never again; an expired operation and a retryable rejection resume the same execution with `reportsNotStarted`; executions of this process are never reconciled as inherited (`start-reconciliation.test.ts`).
- **Liveness:** every tenth poll of a claimed record asks the recovery table; a lost supervisor is decided and logged, a live one keeps the watch going.
- **Removal:** a confirmed terminal fact removes its record once; a held record is kept and logged, and removed by a later pass.
- **Leftovers and logs:** the first pass logs its plan and each unjournaled record once; a failing listing is reported and reconciliation goes on; the worker start passes the host's listing and the logger through (`worker-start.test.ts`).
- **Evidence facts:** survivors (with their process group) and an unapplied cancellation are each reported once, before the exit; their wire mapping and the recovery evidence `boot-changed` and `namespace-ended` publish valid messages (`execution-observations.test.ts`, `execution-contracts.test.ts`).
- **Deadline cycle:** offline, the same execution is asked again under new operations after each deadline, with `reportsNotStarted` from the second operation, and nothing is sealed or reported `not-started`; an `expired` answer does the same (`launch-orchestrator.test.ts`). The authority accepts this by `applyOwnershipRule`.
- **Recovery plan:** an expired operation plans `retry-authorization` (`journal-recovery.test.ts`).
- **Comment rule:** `npm run verify:comments` passes.
- **OpenSpec:** `npm run openspec -- validate implement-worker-start-reconciliation --strict` passes; every requirement is under 450 characters.
- **make verify:** passed at `3039d18` (1393 tests, 0 failures; coverage 99.19% lines, 91.45% branches, 98.68% functions).

## Review pass 1

OpenCode, `opencode-go/kimi-k3.1-pro` (`high`), session `ses_e8a481f5dffeAk3XIDR4P0LGkK`, at `3039d18`. The snapshot was identical before and after the pass (`5d130b96…`). Findings: 0 Critical, 2 High, 3 Medium, 2 Low.

- **H1 (fixed):** evidence that failed to commit was lost once the exit was committed, and a failed journal read counted as no cancellations. The exit now waits until every evidence commit succeeded; the cancellations are read as a `Result`. Test: evidence that fails to commit holds the exit back.
- **H2 (declined, text clarified):** a granted execution with a later `expired` operation is sealed, not authorized again. The worker never sends a new operation for an execution with a grant, and the recovery plan already seals a granted execution with a later retryable rejection (20c); an unused grant is sealed by the journal contract. The spec deltas and design D2 now say that re-authorization applies to an execution without a grant.
- **M1 (fixed):** `recordRecordRemoved` now requires that the terminal fact's outbox entry is gone, as `removableRecords` does. Test: a removal before confirmation fails.
- **M2 (fixed):** survivors that an older supervisor wrote without a process group are left out instead of being given the child's group. Tests: the adapter's survivor reads.
- **M3 (fixed):** `cancellation.not-applied` is deduplicated per `commandId`, so a cancellation journaled later in the same watch gets its own report. Test added.
- **L1 (fixed):** the supervisor adapter now tells a live supervisor (`observe`) from a newly started adopter (`adopted`), and the liveness check logs `worker.supervisor.lost` for the latter. Test added.
- **L2 (fixed):** the worker journal and execution wire contracts now state the `observationId` source of `cancellation.not-applied` (`executionId`, the fact, and `commandId`), which the implementation already used. This is a documentation fix only; no schema changed.

## Between passes 1 and 2

- **Subagent rule:** the owner's rule of 2026-10-26 (implementation work through a briefed subagent, checked by the worker) reached this task after the pass-1 fixes (`c906a5b`), the merge of `origin/dev` (`cd2805e`), and the inventory regeneration (`f5d150b`), which the worker made directly. Every later fix was made by an implementation subagent and checked by the worker.
- **Merge:** `origin/dev` at `cd2805e` merged without conflicts; it touched no file of this change. `make dependency-inventory` was regenerated (`f5d150b`).
- **Unreviewed fix (`64a87f7`):** `make verify` at `f5d150b` hung for about two hours in `darwin-supervisor.test.ts`. `c906a5b` had changed the `adopted` recovery result but missed the macOS restart assertion, which then failed and left the live supervisor running, so the runner never finished. The assertion now expects `supervisor: 'live'`, as the Linux test does. Pass 2 confirmed it.
- **make verify:** passed at `64a87f7` (1454 tests, 0 failures; coverage 99.22% lines, 91.38% branches, 98.71% functions).

## Review pass 2

OpenCode, `opencode-go/kimi-k3.1-pro` (`high`, set by `-m` in the invocation, which the OpenCode log records for the run), session `ses_e886938a4ffe3UmL7n41l5giz4`, at `64a87f7`. The snapshot was identical before and after the pass (`35338e82…`). The reviewer confirmed the resolutions of H1, M1, M2, M3, L1, and L2, and accepted the reasoning that declined H2. Findings: 0 Critical, 0 High, 2 Medium, 0 Low. The reviewer's shell policy refused `npm run verify:comments` and the strict OpenSpec validation; the author ran both.

- **M-A (fixed, `c44a59e`):** the M2 fix dropped the whole `termination-unproven` fact when a survivors event listed no process, or only group-less legacy entries, although macOS reports an empty list when no process listing can be taken. The fact is now left out only when no survivors event exists; otherwise it carries the reportable survivors, possibly none. Tests: adapter reads, the watch reports it once, and the wire message is valid.
- **M-B (fixed, option B):** without `TASKELITH_WORKER_COMMAND` no orchestrator is built, so the start reconciliation and record removal did not run, while the delta read as unconditional. The coordinator brought the options to the owner's away delegate (OpenCode `kimi-k2.7-code`, run `20261026T095212Z-opencode-38865`), which chose B; this is the delegate's decision, not the owner's. Both requirements now apply to a worker configured to launch; without the command the worker logs each inherited open execution once as `worker.reconciliation.deferred` and leaves it. Obligation for 20d2 `implement-worker-contact-and-offline`: build the supervision host without the launch command, so that reconciliation and removal run without it.
- **make verify:** passed at `984cb37` (1460 tests, 0 failures; coverage 99.23% lines, 91.37% branches, 98.71% functions).

## Review pass 3

OpenCode, `opencode-go/kimi-k3.1-pro` (`high`, set by `-m`, as recorded in the OpenCode log), session `ses_e88554684ffe8v7Vxw4NTDuaUI`, at `984cb37`. The snapshot was identical before and after the pass (`18b79782…`). The reviewer confirmed the resolutions of M-A and M-B. Findings: 0 Critical, 0 High, 1 Medium, 2 Low. This was the last allowed pass; the Medium finding went to the coordinator.

- **M-1 (fixed, unreviewed, `5916967`):** the schema let `boot-changed` and `namespace-ended` carry any `ExitStatus`, and `readExit` accepted such a record, although the delta requires status `unknown`. The coordinator brought it to the owner's away delegate (OpenCode `kimi-k2.7-code`, run `20261026T101624Z-opencode-99267`), which chose to fix it without another review; this is the delegate's decision, not the owner's. The non-spawn exit branch is split: recovery evidence now requires status kind `unknown`, inside the unreleased 0.5.0 amendment (`make contract-compatibility` passes). `readExit` rejects another status with recovery evidence as a record problem. Negative tests cover the contract and the adapter, and the delta gained the scenario "Recovery evidence with a known status". A start-reconciliation fake that paired `boot-changed` with a clean exit now uses `unknown`.
- **L-1 (fixed, unreviewed, `96780b6`, `9e588d7`):** "an operation of an execution without a grant" is restored in the worker-runtime delta, the proposal, and the worker journal recovery table. A regression test shows that a granted execution with a later expired operation is sealed and relaunched, not authorized again.
- **L-2 (fixed, unreviewed, `77216bf`):** the launch orchestrator's comments cite the matching design decision (D3 for the watch), or none where none applies.
- **make verify:** passed at `77216bf` (1461 tests, 0 failures; coverage 99.23% lines, 91.39% branches, 98.71% functions); `npm run openspec -- validate implement-worker-start-reconciliation --strict` passes.

## Limitations and remaining gates

- The fixes after pass 3 are unreviewed, as the decision above allows.
- Seen and left: the journal port's `recordExit` still accepts recovery evidence with a known status; the worker never writes one, because only the supervisor record, which `readExit` now checks, supplies it.
- Obligation for 20d2 `implement-worker-contact-and-offline`: build the supervision host without the launch command, so that start reconciliation and record removal run without it.
- A failing assertion in the macOS supervisor tests leaves the supervisor running and hangs the suite instead of failing it; this is not changed here.
- Remaining gates: integration into `dev` by the coordinator and archive.
