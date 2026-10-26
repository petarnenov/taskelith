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
