# Foundation status

As of 2026-10-27. This is a readiness ledger, not evidence that the architecture is implemented. **G2 is closed** on `dev` ([ADR 0015](decisions/0015-g2-closure.md)); see [G2 status](#g2-status). **G1 is closed** on `dev` ([ADR 0010](decisions/0010-g1-closure.md)); see [G1 status](#g1-status). **G0 is closed** on `dev` by the owner's decision ([ADR 0007](decisions/0007-g0-closure.md)): its exit evidence was reproduced from a fresh clone, and the open work items below are deferred to named later gates.

## Established bootstrap

- Taskelith identity, English repository artifacts, and Bulgarian owner communication: `AGENTS.md`.
- TypeScript CLI, pinned tooling, lockfile, and build: `package.json`, `tsconfig.json`.
- Development workflow: OpenSpec 1.14.3, the default and current framework for developing Taskelith; every task is bound to a change of the selected framework; see [ADR 0001](decisions/0001-bootstrap-governance.md), [ADR 0004](decisions/0004-first-class-engineering-principles.md), and [ADR 0008](decisions/0008-product-ui-and-integration-authority.md).
- Repository lifecycle policy in [governance](governance.md) accepted by the owner on 2026-10-24 and independently reviewed by an owner-authorized Codex reviewer agent (`gpt-6.1-sol`, `effort: medium`) on 2026-10-24; integrated through pull request #3. Policy version 2 adds the [independent review process](governance.md#independent-review-process) (2026-10-24), and version 3 adds auto-merge as integration authority and the selectable SDLC framework ([ADR 0008](decisions/0008-product-ui-and-integration-authority.md), 2026-10-24).
- CI tests, strict OpenSpec validation, installed tarball checks, and automatic releases: `.github/workflows/release.yml` and [release policy](releases.md).
- Bootstrap and automatic publication evidence: `openspec/changes/archive/2026-10-24-bootstrap-cli/verification.md` and `openspec/changes/archive/2026-10-24-automated-releases/verification.md`.
- Initial [dependency decision register](dependencies.md) and public registry metadata snapshot; qualification gaps remain explicit.
- Retained [dependency SBOM and license evidence](dependency-inventory.md), exact-toolchain generation/checking, and clean-install reproduction. License coverage gaps are reviewed and bound to exact manifests; security findings and their upstream status are documented.
- Initial Linux/macOS worker families selected by the owner on 2026-10-24: [ADR 0002](decisions/0002-linux-macos-worker-scope.md); initial matrix in [ADR 0007](decisions/0007-g0-closure.md). Native acceptance is pending for every entry.
- First integrations, closed-harness scope, telemetry and open-core rules, dependency-evidence decisions, the plugin microkernel, and light license diligence until G8 decided by the owner on 2026-10-24: [ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md). Qualification and implementation are pending.
- First-class engineering principles decided by the owner on 2026-10-24: [ADR 0004](decisions/0004-first-class-engineering-principles.md). Container images are follow-up work.
- Harness subscription account pools decided by the owner on 2026-10-24: [ADR 0005](decisions/0005-harness-subscription-account-pools.md). Provider terms and implementation are pending.
- GitHub.com as the first SCM, with a GitHub App and per-run installation tokens, and Forgejo as a later second SCM, decided by the owner on 2026-10-24: [ADR 0006](decisions/0006-github-first-scm.md).
- Product UI (project board as landing page, screens, board states, design rules), auto-merge as integration authority with conflict handling, intake with write-back, automatic worker admission, and the selectable SDLC framework, decided by the owner on 2026-10-24: [ADR 0008](decisions/0008-product-ui-and-integration-authority.md). Implementation follows the gates named there.
- [Data namespace design](storage.md): platform defaults, explicit-root precedence, role separation, and identity-conflict behavior for future runtime implementation.
- [Identity, enrollment, and trust boundary contract](trust-model.md): installation bootstrap/recovery authority, project-scoped roles, per-worker enrollment/revocation, trusted-host execution boundary, and plugin capability scoping.
- [Provisional operational targets and resource budgets](operational-targets.md): pre-declared worker/project/delegation resource budgets, retention horizons, and provisional RPO/RTO and latency baselines for the 10, 100, and 1000 machine stages.
- [Linux verify observation](linux-verify-observation.md) of 2026-10-25: `make doctor`, `make setup`, `make verify`, and `make verify-linux-cgroup` on an x86_64 Ubuntu 24.04 host, with two recorded findings.
- Automated repository typechecking (`tsconfig.check.json`) and hexagonal/Go boundary enforcement (`scripts/check-boundaries.ts`, `test/check-boundaries.test.ts`) wired into `npm test`.

## G0 work items

| Work item | Required evidence / decision |
| --- | --- |
| Dependency qualification | The [register](dependencies.md) covers installed direct tools, CI pins, the partially qualified harnesses (Claude Code and Codex on macOS x86_64), and the first SCM. Remaining maintenance, adoption, security-channel, operational, upgrade, recovery, and global-binary inventory evidence for the development and release tools is deferred to G8 ([ADR 0007](decisions/0007-g0-closure.md)); runtime infrastructure remains candidate-only. |
| Dependency inventory | Retained exact-toolchain SBOM and per-path license hashes reproduce after clean install. All 14 paths without top-level text have manifest-bound [reviews](dependencies/license-reviews.json): 6 `text-located`, 5 `notice-only`, 3 `declaration-only`; the owner accepted this evidence for development tooling. The two bundled advisories have no upstream fix in any npm release as of 2026-10-24 and also affect the CI npm pin; the owner accepted a time-bounded exception until a fixed npm release exists ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)). Nested vendor/native notice coverage is deferred to G8 ([ADR 0007](decisions/0007-g0-closure.md)). |
| Data namespace | Design conventions are recorded in the [storage contract](storage.md). Implementation, identity and ownership checks, and native durability are deferred to G2, when runtime state first exists ([ADR 0007](decisions/0007-g0-closure.md)). |
| Worker platform | Owner selected Linux and macOS and the initial matrix: Linux on Ubuntu 24.04 LTS in the worker image for x86_64 and arm64, macOS 26 natively on Apple Silicon (arm64) and Intel (x86_64) ([ADR 0007](decisions/0007-g0-closure.md)). Native acceptance per the [contract](worker-platforms.md) starts in G2 (Linux with the worker image, macOS natively); rows that depend on later work complete with it (real integrations in G3, resource and recovery enforcement through G6–G7). |
| First integrations | Owner selected Claude Code (G3), Codex (G4), Antigravity CLI, and OpenCode, plus GitHub.com as the first SCM and Forgejo as a later second SCM ([ADR 0006](decisions/0006-github-first-scm.md)), and made closed harnesses admissible ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md); [candidate assessment](integration-candidates.md)). Claude Code and Codex have macOS x86_64 egress and capability evidence ([Claude Code](qualification/claude-code.md), [Codex](qualification/codex.md)), and GitHub.com has SCM evidence ([GitHub](qualification/github.md)); Linux qualification inside the worker image is deferred to G2, the terms reviews to before admission in G3, and the other gates in each qualification record are that integration's admission gates ([ADR 0007](decisions/0007-g0-closure.md)). Antigravity CLI and OpenCode are qualified with their plugins after G4, and Forgejo once the GitHub integration is proven (ADR 0006). |
| Identity and trust | Design contract is recorded in [trust-model.md](trust-model.md) (operator bootstrap/recovery, project roles, worker enrollment/revocation, trusted-host boundary, and plugin capabilities). Runtime implementation and adversarial/recovery tests remain G2–G6 gates. |
| Operational targets | Provisional resource budgets, retention windows, availability, and RPO/RTO objectives are recorded in [operational-targets.md](operational-targets.md) prior to measurements. Operator-specific production overrides and benchmark execution remain G2–G7 gates. |
| Workspace boundaries | Automated full-repository TypeScript checking (`tsconfig.check.json`) and hexagonal/Go import boundary validation (`scripts/check-boundaries.ts`) run in `npm test`. Package-level exports expanded with the G1 packages; G2 adds the runtime packages. |
| Governance integration | Done for the G0 changes: owner policy acceptance, independent review (each change's `verification.md` records reviewer, model, effort, and sessions), and archival under `openspec/changes/archive/`. The changes up to pull request #14 are integrated into `main`; the later G0 changes are integrated into `dev`, the G0 closure (ADR 0007) is integrated into `dev` and archived, and their promotion to `main` is a later owner decision. |

The owner selected Linux and macOS, superseding the earlier Linux-first proposal, and the initial matrix ([ADR 0007](decisions/0007-g0-closure.md)). Platform-specific implementation remains unstarted. On 2026-10-24, the owner explicitly authorized a separate Codex reviewer agent (`gpt-6.1-sol` with `model_reasoning_effort = "medium"`), which reviewed all five local G0 foundation changes across four review sessions (`01a16d74-cd29-7642-b4e0-28a59e62c662`, `01a16d80-a7e5-7981-86e0-1768a2e1cdd6`, `01a16d8a-ff6f-76a2-ae26-6a3bbb2675c3`, and `01a16d8f-bcec-7910-94b1-14dfb1af3f72`), with all findings resolved and verified (0 remaining findings). Later G0 changes record their own reviews in their `verification.md`. The deferred items and their gates are listed in the table above.

## G1 status

G1 delivered the kernel, the SDLC workflow model, gates, task admission, plugin registration, the frozen `SdlcFramework` port with its conformance suite, the OpenSpec adapter, both frameworks' fixtures, and the first wire contracts ([G1 work plan](g1-plan.md), items 1 to 13). Its exit evidence was reproduced from a fresh clone (change `close-g1`), and G1 is closed ([ADR 0010](decisions/0010-g1-closure.md)).

| Deferred item | Gate |
| --- | --- |
| Pre-G2 contracts: launch linearization and expiry, supervisor identity and adoption, local journal durability, capacity reservations | G2, before execution code ([G2 work plan](g2-plan.md) items 3 to 6) |
| Ownership generation of an admission; attempt and assignment state machines | G2 ([G2 work plan](g2-plan.md) item 7) |
| Durable repository adapters | G2 ([G2 work plan](g2-plan.md) item 11) |
| SpecKit adapter; SpecKit agent steps, interactive gate path, and `--require-spec` through a qualified harness; SpecKit run on arm64; fixtures with invalid structure or missing artifacts | G4 |
| Versioned plugin manifests, version negotiation, wider plugin API ranges, plugin API `1.0.0`, UI selection, generated manifest type | G4 |
| Code-head identity for head-bound verification and review | G3 |
| SpecKit admission evidence | G8 |

## G2 status

G2 delivered PostgreSQL state and outbox, NATS transport, installation bootstrap and enrollment, the worker journal, the per-execution supervisor on Linux and macOS, the control-plane API, launch authority, resource admission, the evidence store, the worker runtime, execution reconciliation, observability signals, the minimal local installation, and the Linux harness qualification in the worker image ([G2 work plan](g2-plan.md), items 1 to 26). Its exit evidence was reproduced from a fresh clone of `dev` at `bd6108d4` on 2026-10-27 (change `close-g2`; [ADR 0015](decisions/0015-g2-closure.md) decision 4). Follow-ups resolved before the closure, each with the limits ADR 0015 decision 5 records: the flaky fair-order test (#331), the platform probe file-system label (#335), the fair-order rotation (#336 to #338), the logger redaction rules (#339), the relaunch back-off after a launch fails before W2 (#341), and the safe-to-retry rule (#342). G2 is closed ([ADR 0015](decisions/0015-g2-closure.md)), accepted by the owner on 2026-10-27; G3 is next, and its item 0 runs first ([G3 work plan](g3-plan.md)). Each gate, owner, or disposition below that no record named was the author's assignment and is owner-confirmed at the acceptance of ADR 0015.

| Matrix entry | G2 native acceptance |
| --- | --- |
| `macos-26-arm64` | 25b `run-g2-native-acceptance-arm64`: no row fully accepted; process ownership failed on D1 (15 crash windows passed, 11 failed), re-run after the fix deferred to G3 by the owner; the cancellation and connectivity parts left to 24c deferred to G3; open parts in ADR 0015 decision 3 |
| `linux-ubuntu-24.04-arm64` | 25b, under Docker Desktop: no row fully accepted; the cancellation and connectivity parts left to 24c deferred to G3; open parts in ADR 0015 decision 3 |
| `macos-26-x86_64` | 25c `run-g2-native-acceptance-x86-64`: every proof passed; process ownership and journal and storage met in their G2 part; the cancellation and connectivity parts left to 24c deferred to G3; no row fully accepted |
| `linux-ubuntu-24.04-x86_64` | 25c under Docker Desktop and `run-g2-native-acceptance-linux-host` on a native Ubuntu 26.04.1 host: every proof passed; journal and storage met in its G2 part; the cancellation and connectivity parts left to 24c deferred to G3; no row fully accepted; the hosted-runner check stays open |

| Deferred item | Gate |
| --- | --- |
| Delivery of rotated worker credentials; TLS and the installation certificate authority | G3 item 26 |
| Writers that invalidate launches; re-admission and a reconciliation queue surface; evidence retirement entry and per-project download authorization; worker self-check admission (G3 item 27) | G3 |
| Harness user-namespace sandboxes under the seccomp profile; model-calling harness scenarios on Linux | G3 item 35 (Claude Code), G4 (Codex) |
| G3 groundwork re-review against G2 as built | G3 item 0, before any other G3 item |
| Restore quarantine, with stale-epoch observation payloads and restored journals with a rolled-back snapshot counter | G6 |
| Provisional operational-target values | G6 |
| macOS journal durability (`F_FULLFSYNC`), service account, launchd, reboot, drain, sleep and wake; Linux reboot, host supervisor, and drain | G6 |
| Maximum offline duration of a running execution; more than 8 unconfirmed sealed executions; per-execution seccomp filter | G6 |
| PostgreSQL failover, pool sizing, and expand/contract migrations | G6–G7 |
| Image package inventories and vulnerability scans | G8 |
| macOS arm64 process ownership re-run after the D1 fix, on the MacBook Air | G3 (owner's decision, 2026-10-27) |
| Cancellation race g (an adopting macOS supervisor that ignores a cancel) and the cancellation and connectivity parts that 25b, 25c, and the Linux-host run leave to 24c on all four entries; 24c's records come from the test-side process-group launch host on Linux x64, not the cgroup supervisor or a native worker | G3 (owner-confirmed at acceptance, 2026-10-27) |
| Placement back-off that preserves the project rotation (`placement-backoff-preserves-rotation`) | Non-blocking follow-up after G2, contract-first, owned by Liki (coordinator's decision, 2026-10-27); landed with #344 (merge `21f399a5`, archive `2026-10-27-placement-backoff-preserves-rotation`); no gate |
| AppArmor and SELinux confinement of the worker (`apparmor=unconfined`) | G6 (owner-confirmed at acceptance, 2026-10-27) |
| Linux composed crash windows and duplicate delivery beyond one x86_64 host and the test image; supplementary groups of an execution | Before Linux worker support is claimed (owner-confirmed at acceptance, 2026-10-27) |
| In-memory placement rotation cursor | Non-blocking follow-up without a G2 gate, owned by the coordinator (coordinator's decision, 2026-10-27); keeping it in memory is owner-confirmed at acceptance, 2026-10-27 |
| `make native-acceptance` without the Linux crash windows | Non-blocking follow-up without a G2 gate, owned by Zaki (coordinator's decision, 2026-10-27); landed with #345 as `wire-linux-crash-windows-into-native-acceptance` (merge `5f915ad7`, archive `2026-10-27-wire-linux-crash-windows-into-native-acceptance`); the arm64 Linux entry is not covered |
| Hosted-runner Linux x86_64 check; multi-architecture `make verify-linux-cgroup` | Non-blocking follow-ups without a G2 gate, owned by the coordinator (coordinator's decision, 2026-10-27); the hosted-runner check left open (owner-confirmed at acceptance, 2026-10-27) |
| Worker image reproducibility | Non-blocking follow-up owned by Zaki as change `make-worker-image-reproducible` (coordinator's decision, 2026-10-27); no G2 gate (owner-confirmed at acceptance, 2026-10-27) |
| Archived record links and file-system labels (`check-change-record-links`) | Non-blocking follow-up owned by Pepi (coordinator's decision, 2026-10-27); landed with #346 (merge `8aa75985`, archive `2026-10-27-check-change-record-links`): the record link check and its baseline; archived records unchanged, so their broken links stay in the baseline and the `ext2/ext3` labels stay; no G2 gate |

## Later phases

G1 introduced domain transitions and framework-neutral SDLC contracts and is closed ([ADR 0010](decisions/0010-g1-closure.md)). G2 added durable execution and is closed ([ADR 0015](decisions/0015-g2-closure.md)); its work items and decisions are in the [G2 work plan](g2-plan.md). G3 adds the web product and first real agent; its work items are in the [G3 work plan](g3-plan.md), and its item 0 re-reviews the merged G3 groundwork against G2 as built before any other G3 item starts. Both-framework replacement, learning, and fleet validation remain later gates. See [the delivery sequence](architecture.md#delivery-sequence). G0 is closed ([ADR 0007](decisions/0007-g0-closure.md)); runtime readiness is not claimed here.
