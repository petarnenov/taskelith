# ADR 0015: G2 closure and deferrals

Date: 2026-10-27
Status: Proposed. Draft of [G2 work plan](../g2-plan.md) item 27 (change `close-g2`), prepared while items 24 and 25 are still running. The exit evidence sections below hold marked placeholders that the change fills from the three changes in progress and from a fresh-clone reproduction before the owner accepts this ADR. Each deferral names the decision or record it follows; where none names a gate, the entry is marked as the author's assignment for the owner to confirm. Closing G2 starts no G3 implementation item: G3 item 0 runs first ([G3 work plan](../g3-plan.md)).

## Context

G2, "Durable execution vertical slice", is defined in [architecture section 13](../architecture.md#delivery-sequence). Its exit evidence: submit an admitted task, assign it, execute it, and persist its result, and exercise duplicate delivery, process-launch crash windows, partition, cancellation races, stale generations, and disk loss. The [G2 work plan](../g2-plan.md) decomposed the gate into items 1 to 27; several items were split by the coordinator into parts, each one OpenSpec change merged into `dev` and archived under `openspec/changes/archive/`. Decision D11 (a) scoped native acceptance to all four matrix entries and asked this ADR to record as open any entry or row that the available hosts cannot establish.

## Decisions

### 1. Work items

Each row of the G2 work plan and the archived changes that delivered it (archive date 2026-10-25, 2026-10-26, or 2026-10-27, as in the directory name):

| # | Archived changes |
| --- | --- |
| 1 | `qualify-g2-infrastructure` (10-25) |
| 2 | `spike-jetstream-transport` (10-25) |
| 3 | `define-launch-authorization-contract` (10-25) |
| 4 | `define-supervisor-identity-contract` (10-25) |
| 5 | `define-worker-journal-contract` (10-25) |
| 6 | `define-capacity-reservation-contract` (10-25) |
| 7 | `define-execution-domain-model` (10-25) |
| 8 | `define-execution-wire-contracts` (10-25) |
| 9 | `establish-g2-runtime-workspace` (10-25) |
| 10 | `build-deterministic-test-harness` (10-25) |
| 11 | `implement-postgres-state-and-outbox` (10-25); follow-ups `dedupe-migration-directory-read`, `fix-clock-independent-migration-order` (10-25) |
| 12 | `implement-nats-transport` (10-25) |
| 13 | `implement-installation-bootstrap-and-enrollment`, `record-worker-rotation-limitation`, `remove-predecessor-non-null-assertion`, `fix-predecessor-sweep` (10-25) |
| 14 | `implement-worker-journal`, `amend-worker-journal-fault-state` (10-25) |
| 15 | `implement-process-supervisor`, `implement-macos-native-process-evidence` (10-25); `harden-worker-supervisor-tests` (10-26) |
| 16 | `implement-control-plane-api` (10-25); `fix-control-plane-api-keep-alive-race` (10-27) |
| 17 | `implement-launch-authority`, `add-worker-bearer-authentication` (10-25) |
| 18 | `implement-resource-admission`, `bound-resource-request-schema`, `bound-worker-capacity-schema` (10-25) |
| 19 | `implement-evidence-store` (10-25); `stabilize-evidence-publisher-test-server` (10-27) |
| 20 | 20a `implement-worker-runtime-bootstrap`, 20b `implement-worker-command-intake`, `remove-revoked-worker-consumer` (10-25); 20c `implement-worker-launch-orchestration`, `add-worker-heartbeat`, 20d `implement-worker-start-reconciliation`, 20d2 `implement-worker-contact-and-offline`, 20e `implement-worker-admission-pressure`, 20e2 `implement-worker-daemon-pressure`, `implement-unrecorded-process-scan`, `retry-unrecorded-process-on-full-disk`, `harden-worker-linux-self-check-home-layout` (10-26); `report-control-plane-failure-cause` (10-27) |
| 21 | 21a `implement-execution-placement`, 21b `implement-observation-consumption` (10-25); 21c `implement-inventory-reconciliation`, 21d `wire-launch-authority-reconciliation` (10-26) |
| 22 | `add-execution-observability`, `fix-flaky-event-loop-lag-test` (10-25); `stabilize-observability-lag-test`, `stamp-assignment-age-on-database-clock` (10-27) |
| 23 | 23a `compose-minimal-local-installation-images` (10-25); `fix-installation-start-on-macos`, 23b `compose-installation-end-to-end` (10-26) |
| 24 | 24a `run-g2-failure-scenarios-composition`, 24b `run-g2-crash-windows` (10-26); defects found by item 24 and fixed: `fix-launch-recovery-reauthorization` (D1), `fix-unclaimed-launch-liveness` (O1), `fix-inventory-request-loop` (B1), `scope-execution-cancellation` (B2), `scope-execution-cancellation-recovery`, `fix-rejected-launch-slot-release` (B3), `gate-stale-epoch-observations` (B4), `clear-capacity-refusal-on-stale-launch-rejection` (B5), `end-assignment-on-not-active`, `fix-native-lifecycle-stat-on-linux`, `harden-nats-broker-stop` (10-26); `report-all-unconfirmed-sealed-executions` (10-27). **Not archived:** 24c `run-g2-partition-and-races`. |
| 25 | 25a `harden-worker-container-seccomp`, 25b `run-g2-native-acceptance-arm64` (10-26). **Not archived:** 25c `run-g2-native-acceptance-x86_64` and `run-g2-native-acceptance-linux-host`. |
| 26 | `qualify-harnesses-in-worker-image`, `record-native-arm64-harness-qualification` (10-26) |
| 27 | This change, `close-g2`. |

> **PLACEHOLDER — work items.** When 24c, 25c, and the Linux-host run are archived, replace the "Not archived" notes with their archive names and dates, and add any further fix changes they produce.

### 2. Exit evidence

- **Submit, assign, execute, persist.** 23b `compose-installation-end-to-end` (installation smoke) and 24a `run-g2-failure-scenarios-composition` (fresh composition scenario) submit an admitted task, place it, run it on the composed worker, and store its result with its evidence.
- **Duplicate delivery and process-launch crash windows.** 24b `run-g2-crash-windows`: windows W1 to W6 and CP1 to CP12 and the duplicate-delivery scenario, on macOS with the native supervisor; the eleven windows that failed on D1 pass since `fix-launch-recovery-reauthorization`, and the two double-fault windows since `report-all-unconfirmed-sealed-executions`.
- **Disk loss.** 24a's worker disk-loss scenario, also rerun on `linux-ubuntu-24.04-arm64` by 25b.
- **Partition, cancellation races, stale generations.**

  > **PLACEHOLDER — 24c `run-g2-partition-and-races` (Zaki, in progress).** Name the scenarios, the `results.jsonl` lines, the commit, and the host, and every 24c row that stays open.

### 3. Native acceptance (D11 (a))

The G2 rows are those of the [native acceptance gates](../worker-platforms.md#native-acceptance-gates): service lifecycle, process ownership, journal and storage, cancellation, and the G2 part of connectivity.

- `macos-26-arm64` and `linux-ubuntu-24.04-arm64`: 25b recorded the rows in its `acceptance.md`. No row is fully accepted on either entry; the open parts are listed in the deferrals below. The macOS process ownership row failed on D1 and needs a re-run after its fix.

  > **PLACEHOLDER — arm64 re-run.** Record whether the macOS arm64 process ownership row was re-run after `fix-launch-recovery-reauthorization`, or keep it open.

- `macos-26-x86_64` and `linux-ubuntu-24.04-x86_64` under Docker Desktop:

  > **PLACEHOLDER — 25c `run-g2-native-acceptance-x86_64` (Desi, in progress).** Platform table, row outcomes, `results.jsonl` lines, and open parts.

- `linux-ubuntu-24.04-x86_64` on a Linux host:

  > **PLACEHOLDER — `run-g2-native-acceptance-linux-host` (Liki, in progress).** Host OS, kernel, file system, AppArmor or SELinux state, row outcomes, and whether the composed crash windows and duplicate delivery ran on Linux.

D11 (a) named the GitHub-hosted runner labels for entries without a local host; every entry ran on a local host instead (Apple Silicon for 25b, the x86_64 iMac for 25c, and a Linux host), so no hosted-runner workflow was added.

### 4. Fresh-clone reproduction

> **PLACEHOLDER — fresh clone (to be run after the three changes above are archived).** Revision of `dev`; `git clone`, `nvm use`, `make setup`, `make verify` (tests, coverage, checks); `make verify-installation` (installation smoke); the native acceptance targets as 25b and 25c ran them; `git status --short` afterwards; host and toolchain.

### 5. Deferrals

These items move to the gate named with them. "Author's assignment" marks a gate that no record names, for the owner to confirm.

Execution and recovery:

- **Rotated worker credentials** are never delivered to the worker ([G2 work plan](../g2-plan.md), "Recorded limitations"; `record-worker-rotation-limitation`): G3 item 26 `secure-remote-connectivity`.
- **TLS and the installation certificate authority.** The installation runs plain HTTP, NATS, and PostgreSQL on localhost ports (23a verification): G3 item 26, decision D11 of the G3 plan.
- **Restore quarantine** stays in G6 (G2 plan item 13), together with:
  - the payload of observations gated by a stale epoch or a quarantine, starts included, which keep only their inbox entry and a warning log, and the separation of identity checks from effects in `ObservationService` (B4 review findings H1 and H2, accepted by the owner's delegate in away run `20261026T184026Z-opencode-69502`; `gate-stale-epoch-observations` verification);
  - a journal restored from an older copy with a rolled-back snapshot counter, whose unsolicited report `receivePart` discards so that it gets no inventory request on reconnect (`fix-inventory-request-loop` verification, out-of-scope note). Author's assignment to G6.
- **Provisional operational-target values** (heartbeat `10s` and `30s`, evidence limits `64 MiB` and four uploads, the `100` latest revoked workers, the section 4 signals): G6 verification (`add-execution-observability`, `add-worker-heartbeat`, `implement-evidence-store`, `remove-revoked-worker-consumer`).
- **More than 8 unconfirmed sealed executions.** The D1 double fault is resolved by `report-all-unconfirmed-sealed-executions`; over its cap the worker reports the oldest 8, and an owner among the newer ones still ends the launch with `execution-conflict` (its design D5). Accepted limit; author's assignment: revisit with G6 recovery work.
- **Maximum offline duration for a running execution** (20d2 open question 1, answered by the coordinator as open for a later stage): author's assignment to G6.
- **Writers that invalidate launches.** A writer of artifact revisions that extends `CurrentRevisions`, and writers of gates and policy revisions that call `invalidateLaunches` (`implement-launch-authority`): G3. The restore quarantine's entry likewise: G6.
- **Re-admission and the reconciliation queue surface.** Re-admission by a later writer of admissions, and an HTTP or CLI surface for the reconciliation queue (`wire-launch-authority-reconciliation`): author's assignment to G3.
- **Evidence retirement entry and per-project download authorization** (`implement-evidence-store`, decision Q2): G3, with login.
- **Worker self-check admission wiring** (`harden-worker-linux-self-check-home-layout`): G3 item 27.
- **Assignment age on a database-stamped column** (option A of `stamp-assignment-age-on-database-clock`, rejected for G2): a G3-or-later candidate if more writers of offered rows appear (its design).

Containment and platforms:

- **Seccomp profile open items** (25a `harden-worker-container-seccomp`):
  - an x86_64 Linux host with AppArmor or SELinux is not yet observed. **PLACEHOLDER:** resolved by `run-g2-native-acceptance-linux-host` if that run covers it; otherwise author's assignment to G6.
  - the profile refuses a harness's own user-namespace sandbox, for example bubblewrap, in the `worker-harnesses` image variant (design, open questions): G3, with the harness admission (G3 item 35 for Claude Code).
  - a per-execution seccomp filter installed by the launcher (design option (e), not chosen): author's assignment to G6.
- **Crash windows and duplicate delivery in a Linux composition.** They run on macOS only: `apps/control-plane/test/crash-windows.integration.test.ts:34-35` skips them elsewhere, because a Linux run needs a privileged composition with a delegated cgroup and the execution account. **PLACEHOLDER:** resolved by the Linux-host run if it covers them; otherwise author's assignment, before Linux worker support is claimed.
- **Supplementary groups of an execution.** The `Groups:` line of an execution's `/proc/<pid>/status` was left to item 25 or 27 (`compose-installation-end-to-end` verification). **PLACEHOLDER:** record it from 25c or the Linux-host run.
- **macOS journal durability.** The `F_FULLFSYNC` gate stays open ([worker journal qualification](../worker-journal-qualification.md)); power loss and real device I/O errors are not exercised. Author's assignment to G6.
- **macOS service lifecycle.** A dedicated service account, a launchd service, reboot, logout and login, and drain before upgrade: G6 (decision D5; 25b). On Linux, reboot, a host supervisor, and drain before upgrade: G6 (25b).
- **Sleep, wake, and network changes on macOS** have no G2 procedure (25b): author's assignment to G6.
- **Harness scenarios that call a model on Linux:** G3 item 35 for Claude Code and the G4 admission for Codex (`qualify-harnesses-in-worker-image`, `record-native-arm64-harness-qualification`).
- **Image package inventories and vulnerability scans** of the worker and control-plane images (23a, `establish-g2-runtime-workspace`): author's assignment to G8, with the dependency qualification work ADR 0007 deferred there.
- **Platform probe file-system name.** `stat -f -c %T` reports an ext4 Docker volume as `ext2/ext3` (`scripts/native-acceptance.ts:75`, `scripts/installation-scenarios.sh:478`). Cosmetic; author's assignment to a follow-up change without a gate.
- **Residual process-identity risks.** PID reuse is mitigated, not eliminated (`harden-worker-supervisor-tests`), and the macOS `KERN_PROC_ALL` and reap-to-report races remain (supervisor identity contract section 8). Accepted residual risks; no gate.

Tests and tooling:

- **Unexplained flaky test** `apps/control-plane/test/placement.integration.test.ts:226`, "tasks are placed in fair order across projects" (symptom d of B6, `fix-control-plane-api-keep-alive-race` verification): open until it recurs with output; no gate.
- **Empty coverage file in `make verify`.** **PLACEHOLDER:** resolved by `keep-coverage-out-of-killed-test-processes` (Maki, in progress) if it lands before acceptance; otherwise a follow-up without a gate.
- **Multi-architecture `make verify-linux-cgroup`** (24a verification): author's assignment to a follow-up without a gate.
- **Failover, pool sizing under load, and expand/contract migrations** of PostgreSQL are not tested (`implement-postgres-state-and-outbox`): author's assignment to G6 and G7.

Records and contracts:

- **Protocol version 1 exception.** `gate-stale-epoch-observations` design D2 kept execution protocol version 1 as a bounded pre-release exception that ends at the first release of an execution package or the G2 closure. It ends with this closure: from then on [execution wire contracts](../contracts/execution-wire-contracts.md) section 3 applies strictly, and the note in its section 5 is updated with the acceptance of this ADR.
- **ReDoS in the failure-cause redaction.** The scheme-less user-information rule added by `report-control-plane-failure-cause` (`packages/adapters/worker-control-plane-client/src/failure-cause.ts:19`) is quadratic on a long run without `@`; it was found after that change's review cap. **PLACEHOLDER:** resolved by `bound-failure-cause-userinfo-redaction` (in progress) before acceptance.
- **Logger redaction rules.** The logger's `redactText` lacks the JWT, `Authorization`, scheme-less user information, and colon-pair rules, and some `=` keys (`report-control-plane-failure-cause` verification): author's assignment to a follow-up of the requirement "Logs without secrets", without a gate.
- **Reviewer of #317.** `fix-control-plane-api-keep-alive-race` was reviewed by OpenCode `opencode-go/deepseek-v4-pro#high` before the governance list named that reviewer (its verification, "Invocation"). The owner approved the reviewer in chat on 2026-10-26, and `add-deepseek-qwen-reviewers` (#320) recorded it. Resolved; recorded here for completeness.

G3 start:

- **G3 groundwork re-review.** By the owner's decision of 2026-10-26, G3 item 0 `revalidate-g3-foundations` re-reviews the merged G3 groundwork (items 1, 2, 3, 5, 6, 7, and 8) against G2 as built before any other G3 item starts ([G3 work plan](../g3-plan.md)).

### 6. G2 closure

> **PLACEHOLDER — closure statement.** When every placeholder above is filled and the owner accepts: "G2 is closed: its exit evidence was reproduced from a fresh clone, items 1 to 26 are merged and archived, item 27 is this closure, and the work left open is deferred above."

## Consequences

The foundation ledger, the G2 work plan, architecture sections 13 and 15, and README record the closure and the deferrals when it is accepted. Closing G2 claims a durable execution vertical slice on one installation with a scripted test process; it does not claim any real agent harness, SCM integration, remote worker, TLS, or supported matrix entry.
