# G0 foundation status

As of 2026-10-24. This is a readiness ledger, not evidence that the architecture is implemented.

## Established bootstrap

- Taskelith identity, English repository artifacts, and Bulgarian owner communication: `AGENTS.md`.
- TypeScript CLI, pinned tooling, lockfile, and build: `package.json`, `tsconfig.json`.
- Development workflow: OpenSpec 1.14.3, mandatory for developing Taskelith; see [ADR 0001](decisions/0001-bootstrap-governance.md) and [ADR 0004](decisions/0004-first-class-engineering-principles.md).
- Repository lifecycle policy in [governance](governance.md) accepted by the owner on 2026-10-24 and independently reviewed by an owner-authorized Codex reviewer agent (`gpt-6.1-sol`, `effort: medium`) on 2026-10-24; integration remains pending.
- CI tests, strict OpenSpec validation, installed tarball checks, and automatic releases: `.github/workflows/release.yml` and [release policy](releases.md).
- Bootstrap and automatic publication evidence: `openspec/changes/archive/2026-10-24-bootstrap-cli/verification.md` and `openspec/changes/archive/2026-10-24-automated-releases/verification.md`.
- Initial [dependency decision register](dependencies.md) and public registry metadata snapshot; qualification gaps remain explicit.
- Retained [dependency SBOM and license evidence](dependency-inventory.md), exact-toolchain generation/checking, and clean-install reproduction. License coverage gaps are reviewed and bound to exact manifests; security findings and their upstream status are documented.
- Initial Linux/macOS worker families selected by the owner on 2026-10-24: [ADR 0002](decisions/0002-linux-macos-worker-scope.md). Native acceptance is pending for both.
- First integrations, closed-harness scope, telemetry and open-core rules, dependency-evidence decisions, the plugin microkernel, and light license diligence until G8 decided by the owner on 2026-10-24: [ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md). Qualification and implementation are pending.
- First-class engineering principles decided by the owner on 2026-10-24: [ADR 0004](decisions/0004-first-class-engineering-principles.md). The Makefile, container images, and API contracts are follow-up work.
- Harness subscription account pools decided by the owner on 2026-10-24: [ADR 0005](decisions/0005-harness-subscription-account-pools.md). Provider terms and implementation are pending.
- [Data namespace design](storage.md): platform defaults, explicit-root precedence, role separation, and identity-conflict behavior for future runtime implementation.
- [Identity, enrollment, and trust boundary contract](trust-model.md): installation bootstrap/recovery authority, project-scoped roles, per-worker enrollment/revocation, trusted-host execution boundary, and plugin capability scoping.
- [Provisional operational targets and resource budgets](operational-targets.md): pre-declared worker/project/delegation resource budgets, retention horizons, and provisional RPO/RTO and latency baselines for the 10, 100, and 1000 machine stages.
- Automated repository typechecking (`tsconfig.check.json`) and hexagonal/Go boundary enforcement (`scripts/check-boundaries.ts`, `test/check-boundaries.test.ts`) wired into `npm test`.

## Remaining G0 work

| Work item | Required evidence / decision |
| --- | --- |
| Dependency qualification | The [register](dependencies.md) covers installed direct tools and CI pins. Resolve version-specific maintenance, independent adoption, security-channel, and operational gaps before full admission; runtime infrastructure remains candidate-only. |
| Dependency inventory | Retained exact-toolchain SBOM and per-path license hashes reproduce after clean install. All 14 paths without top-level text have manifest-bound [reviews](dependencies/license-reviews.json): 6 `text-located`, 5 `notice-only`, 3 `declaration-only`; the owner accepted this evidence for development tooling. The two bundled advisories have no upstream fix in any npm release as of 2026-10-24 and also affect the CI npm pin; the owner accepted a time-bounded exception until a fixed npm release exists ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md)). Nested vendor/native notice coverage remains open. |
| Data namespace | Design conventions are recorded in the [storage contract](storage.md); implementation, identity/ownership checks, native durability, and review remain pending. No application state exists yet. |
| Worker platform | Owner selected Linux and macOS; the [native acceptance contract](worker-platforms.md) records separate gates. Qualify exact releases/CPU architectures, service modes, native dependencies, and recovery before claiming worker support. |
| First integrations | Owner selected Claude Code (G3), Codex (G4), Antigravity CLI, and OpenCode, plus Forgejo, and made closed harnesses admissible ([ADR 0003](decisions/0003-first-integrations-and-plugin-kernel.md); [candidate assessment](integration-candidates.md)). Claude Code has macOS x86_64 egress and capability evidence ([qualification record](qualification/claude-code.md)); its Linux and macOS arm64 qualification and every other integration's qualification remain. |
| Identity and trust | Design contract is recorded in [trust-model.md](trust-model.md) (operator bootstrap/recovery, project roles, worker enrollment/revocation, trusted-host boundary, and plugin capabilities). Runtime implementation and adversarial/recovery tests remain G2–G6 gates. |
| Operational targets | Provisional resource budgets, retention windows, availability, and RPO/RTO objectives are recorded in [operational-targets.md](operational-targets.md) prior to measurements. Operator-specific production overrides and benchmark execution remain G2–G7 gates. |
| Workspace boundaries | Automated full-repository TypeScript checking (`tsconfig.check.json`) and hexagonal/Go import boundary validation (`scripts/check-boundaries.ts`) run in `npm test`. Package-level exports will expand as G1+ modules are added. |
| Governance integration | Done for the G0 foundation changes: owner policy acceptance, independent review (each change's `verification.md` records reviewer, model, effort, and sessions), integration into `main` (the later G0 changes through pull requests #3 to #5), and archival under `openspec/changes/archive/`. |

The owner selected Linux and macOS, superseding the earlier Linux-first proposal. Platform-specific implementation remains unstarted. On 2026-10-24, the owner explicitly authorized a separate Codex reviewer agent (`gpt-6.1-sol` with `model_reasoning_effort = "medium"`), which reviewed all five local G0 foundation changes across four review sessions (`01a16d74-cd29-7642-b4e0-28a59e62c662`, `01a16d80-a7e5-7981-86e0-1768a2e1cdd6`, `01a16d8a-ff6f-76a2-ae26-6a3bbb2675c3`, and `01a16d8f-bcec-7910-94b1-14dfb1af3f72`), with all findings resolved and verified (0 remaining findings). Later G0 changes record their own reviews in their `verification.md`. Open gates: qualification of the selected integrations and the remaining work items above.

## Later phases

G1 introduces domain transitions and framework-neutral SDLC contracts after the foundation gates. G2 adds durable execution; G3 adds the web product and first real agent. Both-framework replacement, learning, and fleet validation remain later gates. See [the delivery sequence](architecture.md#delivery-sequence). Neither G0 completion nor runtime readiness is claimed here.
