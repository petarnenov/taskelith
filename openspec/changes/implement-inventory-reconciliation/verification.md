# Verification

Date: 2026-10-26. The author's verification and the independent review are recorded below.

## Scope and source

This is part 21c of item 21 of the [G2 work plan](../../../docs/g2-plan.md). The coordinating session (Niki) assigned it to the worker session Maki. The rotation assigns the reviewer, Codex CLI `gpt-6.1-sol` at medium effort.
- **Base revision:** `898d107` on `dev`. `dev` was merged twice before review pass 1, as the coordinator asked:
  - `854465b` merged `190e2cc`, which brought 20b's `FleetRegistry.activeWorkerIds()`;
  - `575706d` merged `aba18f5`, which brought the removal of revoked workers' consumers (#230).
- **Scope:** the proposal's obligations:
  - inventory requests and their bound;
  - pending snapshots, the rollback check of a fresh snapshot, and the effects of an applied snapshot;
  - new journal incarnations, retired journals, and lost local history;
  - the four newly consumed observation types;
  - acceptance provenance and the re-sent offer;
  - first contact from an inventory report.
- **Out of scope:** the observations and obligations that the proposal names for 21d, items 20 and 24, and an operator's resolution of an uncertain execution.

## Decisions

**Coordinator decisions for item 21 (2026-10-25), still in force:** Q2 (a), Q4 (a), and Q6 (a), as the design records.

**Coordinator decisions for 21c (2026-10-25).** The coordinator accepted every recommendation, which the design records as these decisions:
- **G1:** the confirmation by sequence is already met by 21b (design decision 1).
- **G2:** new journal incarnations, their refusals, and the reconciliation of lost local history (design decisions 2 and 9). The coordinator set these security conditions:
  - an unseen `journalId` replaces the enrolled one only for an authenticated worker that is not revoked;
  - the replacement is a structured logged event with the old and the new `journalId`;
  - a `journalId` seen before, in the history of `producer_cursors`, is refused, with a test;
  - a revoked worker's unseen `journalId` is refused, with a test.
- **G3:** a rollback retires the journal (design decision 3).
- **G4:** inventory is requested after an unsolicited snapshot, and once at start for every active worker. The start requests are bounded and logged like 20b's command consumer repair (design decision 4).
- **G5:** pending snapshot parts are persisted (design decision 7).
- **G6:** acceptance provenance and `listUnfinishedByWorker` (design decision 10).
- **G7:** `inventory_requests` belongs to Execution (design decision 5).
- **G8:** `execution.unrecorded-process` is applied without a domain effect, with a structured warning. Its worker-level record goes to 21d (design decision 13).
- **G9:** the new evidence kind `cancellation-not-applied` (design decision 14).
- **G10:** `termination-unproven` after `exited` stays rejected (design decision 15).
- **G11:** a snapshot changes only omissions, the rollback check, and contact (design decision 8).
- **G12:** report authentication, deduplication by `reportId.part`, and contact per part (design decision 11).
- **R1 (item 5 of the brief):** the re-sent offer belongs to 21c, because it runs through the reconciliation path. It uses mechanism (b): a new outbox row with a fresh event identity and the stored payload unchanged (design decision 12).

**Interpretations the coordinator approved (2026-10-25):**
1. A fresh snapshot that fails its rollback check also retires the journal, like a sequence rollback.
2. Fail-closed means `WorkerReports.recordJournalLoss`. Refusing launch authorization to a worker whose journal is retired is an obligation of 21d, and the proposal lists it.
3. Only a snapshot that is not fresh requests inventory again for an omission it cannot classify. The coordinator approved this text change to wire contracts section 6, with the scenario "Fresh snapshot omits an undelivered offer". It changes no schema.
4. `cancellation-not-applied` does not make the execution unknown.

**Coordinator instructions:**
- any wire contract change goes through the coordinator;
- `FleetRegistry.activeWorkerIds()` comes from 20b and is not duplicated;
- merge `dev` before review pass 1.

## Obligations met

- **Item 8, wire contracts section 6:**
  - `worker.inventory.requested` with a fresh `requestId` and its bound, the latest request kept per worker;
  - a snapshot applied only when complete, the lower-`snapshot` filter, and the rollback check of a fresh snapshot;
  - the meaning of an omission;
  - the re-sent offer while no grant is recorded.
- **Item 14, worker journal contract:**
  - the latest `journalId` per worker;
  - the sequence check and the inventory reconciliation;
  - disk loss with the retry budget `0` for an uncertain execution;
  - the control-plane half of the required tests on a missing and on a restored journal (lines 217-218).
- **From 21a:** first contact from an inventory report.
- **From 21b:** the types and the sequence classes `rollback` and `new-incarnation` left to this change.
- **From 20b:** a re-sent offer republishes the stored command unchanged, with the same `commandId` and `issuedAt`.

## Evidence

- **Environment:**
  - macOS 26.6.2 arm64;
  - Node v24.22.1 (`.nvmrc`, selected by `make verify`);
  - Docker 29.6.1 with the Compose services of `make verify` (PostgreSQL, NATS, Toxiproxy).
- **Dependencies:** no dependency was added.
- **Contracts:**
  - `execution.asyncapi.json` stays 0.3.0, and the worker journal contract is unchanged;
  - `8fe8405` changes only the inventory request text of `docs/contracts/execution-wire-contracts.md` section 6 (interpretation 3);
  - `make contract-compatibility` reports no breaking change.
- **Implementation:** background subagents of the worker session wrote the code and tests (commits `f6b4cce`, `44a4fe9`, `72eac4e`, `288805e`, and `48c3d5f`). The worker read the result against the design.
- **Logged events:** `execution.journal.replaced` (old and new `journalId`), `execution.journal.refused`, `execution.journal.retired`, `execution.unrecorded-process`, `execution.inventory-request.failed`, `execution.inventory-requests.sent`, and `execution.inventory-requests.unlisted`.
- **Test grants:** the integration tests seed grants (decision Q6 (a)). 21d replaces them.

## Deviations from the design, accepted by the author

1. **Cancellation not applied.** The evidence kind is an ADDED requirement of `execution-model` instead of part of "Evidence beside the state", because the archive dry-run's strict validation rejects requirements longer than 500 characters.
2. **Outbox lookup.** Finding a stored message by its event identity is an `OutboxLookup` port of Scheduling, beside the outbox it reads.
3. **Warnings after commit.** The journal and unrecorded-process warnings are logged after their transaction commits, so a rolled-back attempt logs nothing.
4. **One request per transaction.** A transaction appends at most one inventory request per worker, however many rules ask for one.

## Author fix

**Report fences of a new incarnation** (`48c3d5f`). The capacity, pressure, refusal, and protocol watermarks of `WorkerReports` are kept per worker, but a sequence restarts with a new journal. Without a reset, the declarations of a new incarnation would be ignored. `WorkerReports.restartFences(workerId)` resets them when the journal is replaced. A conformance case, an integration test, and the scenario "First declaration of a new incarnation" cover it.

## Author self-check

Recorded before pass 1.

- **Transactions:**
  - `InventoryService.apply` runs each report part in one SERIALIZABLE transaction, covering authentication, the inbox by `reportId.part`, contact, the stored part, inventory requests, the rollback check, and the application of a complete snapshot.
  - `ObservationService` evaluates pending snapshots after each cursor advance in the same transaction.
- **Journal security (G2):** an unseen journal of an authenticated, enrolled worker that is not revoked replaces the enrolled one and is logged. A journal seen before, a revoked worker's unseen journal, and another worker's journal are refused without effect, each with a PostgreSQL test.
- **Lost local history:** after a replacement, an unfinished assignment without a recorded grant is re-sent, and one with a grant records `local-history-lost` with the retry budget `0`.
- **Retirement:** a sequence rollback and a failed rollback check retire the journal and record the journal loss. Observations of a retired journal are refused until a new incarnation.
- **Re-sent offer:** a test compares the re-sent command byte for byte with the stored payload, under a fresh event identity.
- **Start:** `requestStartInventories` makes one pass over `FleetRegistry.activeWorkerIds()`, with at most one request per worker. A failure is logged and not retried, and a summary gives the counts.
- **Against ADR 0004:**
  - Domain rules are in Execution and Scheduling, ports in their modules, and adapters in memory and in PostgreSQL with shared conformance suites.
  - The use cases are in the control-plane application layer, and `make check-boundaries` passes.
- **Evidence check:**
  - Each scenario of the deltas has a test.
  - `apps/control-plane/test/inventory.integration.test.ts` covers 31 PostgreSQL scenarios, including the tests of worker journal lines 217-218 and the G2 refusals.
  - `start-inventory-requests.test.ts` covers the start pass, and `packages/modules/execution/test/inventory.test.ts` the domain functions.

## Checks

`make verify` ran in the worktree with every file tracked:
- At `48c3d5f`, before the second `dev` merge: 1254 tests passed, 0 failed. Coverage was 99.28% lines, 91.63% branches, and 98.98% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec strict, archive dry-run, and package checks pass. `make contract-compatibility` against `190e2cc` reports 0 breaking changes.
- At `575706d`, after merging `aba18f5`: 1259 tests passed, 0 failed. Coverage was 99.29% lines, 91.58% branches, and 98.98% functions. Every other check passes, and contract compatibility against `aba18f5` reports 0 breaking changes.

## Independent review

The reviewer is Codex CLI with model `gpt-6.1-sol` and reasoning effort `medium`, both set in the invocation, in a read-only sandbox:

`codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`

It runs from the worktree, with the prompt and log in the session's scratch directory. A SHA-256 snapshot of every tracked and untracked file is taken before and after each pass.

Pending.

## Limitations

- **Revoked workers.** Their observations stay unconsumed until 21d. Their inventory reports are refused.
- **Journal-lost workers.** A worker whose journal is retired is unreachable, but launch authorization does not refuse it until 21d.
- **Unrecorded processes.** Only a structured warning records them until 21d's reconciliation queue.
- **Uncertain executions.** They stay uncertain until evidence or an operator resolves them.

## Remaining gates

- Independent review.
- Integration into `dev` and archiving, by the coordinator.
- No deployment validation is claimed.
