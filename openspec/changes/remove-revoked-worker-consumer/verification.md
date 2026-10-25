# Verification

Date: 2026-10-25. Author verification is recorded below; the independent review follows.

## Scope and source

A G2 follow-up of the worker command intake change (20b of [G2 work plan](../../../docs/g2-plan.md) item 20), whose design left the removal of a revoked worker's command consumer to a later change. The coordinating session (Niki) assigned it to the worker session Ziki. The reviewer is Codex CLI `gpt-6.1-sol` (medium, read-only), as the coordinator assigned, with a cap of three passes.

- Base revision: `f245956` on `dev`, which holds 20b and its archive.
- Scope: `WorkerCommandConsumers.remove`, idempotent; the removal in `EnrollmentService.revoke` after the revocation commits, reported and never failing the revocation; the administration tool's broker connection for it; `FleetRegistry.recentlyRevokedWorkerIds`; the bounded removal in `repairCommandConsumers`; the bound in the operational targets.
- Exclusions of the brief: no change to the wire contracts or the broker permissions. The control-plane broker user already reaches every subject, so it may delete consumers.
- Interpretation recorded for the coordinator: the fleet module has no logger, so a failed removal is reported in the revocation's result, and `revoke-worker` prints it with a retry note and exits with 0, as the revocation succeeded. The startup repair logs each failure and a summary.

## Evidence

- Environment: Linux x86_64, Node v24.22.0, npm 11.19.1, Docker with the Compose services of `make verify` (NATS in operator mode with TLS, PostgreSQL, Toxiproxy).
- Dependencies: none added; no migration, because the worker record already holds `revokedAt`.
- Contracts: unchanged.

## Author self-check

- **Order:** `EnrollmentService.revoke` removes the consumer only after `registry.revoke` returned success, so after the transaction of `LaunchRevokingFleetRegistry` committed; a refused removal still returns the revocation with `commandConsumerRemoved: false` (`fleet.test.ts`, and against PostgreSQL and NATS in `administration.integration.test.ts`, which reads the committed revocation through a new transaction).
- **Idempotent:** `ConsumerNotFound` and `StreamNotFound` count as removed (`transport.test.ts`); a second removal against the real broker succeeds (`administration.integration.test.ts`).
- **Revocation removes the consumer:** `revoke-worker` through the administration tool leaves no consumer on the broker.
- **Healing:** after a refused removal, `repairCommandConsumers` with the PostgreSQL registry removes the leftover consumer and leaves an active worker's consumer in place (integration), and logs each failure and a summary (`command-consumer-repair.test.ts`).
- **Bound:** at most `REVOKED_CONSUMER_REMOVALS_PER_START` (`100`) of the latest revoked workers per start; the query orders by the worker record's `revokedAt`, and a conformance case for the in-memory and PostgreSQL registries includes a worker whose broker JWT postdates its revocation.
- **Against ADR 0004:** hexagonal: the removal is a Fleet port method with a NATS adapter, and the registry stays a persistence boundary; Clean Code: the repair runs one helper for both phases.

## Checks

`make verify` ran in the worktree after the pass 1 fixes at `7a1828b`, and after the pass 2 fixes at `ba41c1d`: exit 0 each time, with the same results.

- `verify:comments`: no violation.
- `make test` (with its own PostgreSQL, NATS, and Toxiproxy): 1203 tests, 1188 passed, 0 failed, 15 skipped (macOS-only); coverage of all files 99.12% lines, 91.62% branches, 98.69% functions, above the 75% floor.
- `openspec validate --all --strict`: 60 passed, 0 failed; `verify:archive`: every active change archives into strictly valid specs; `verify:package`: passed.

Before pass 1, `verify:archive` had warned that a modified "Worker command consumer" requirement was longer than 500 characters; the delta adds the requirement "Revoked worker command consumer" instead.

## Review pass 1

- Reviewer: Codex CLI, `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run in the worktree at `4f405c7`; prompt and output outside the worktree.
- Model confirmation: `gpt-6.1-sol`, reasoning effort medium, sandbox read-only in the output header. Session ID: `01a174f8-4262-7640-ab0e-397696f6f7a2`.
- Snapshot: `3174fd662b88974b71e3f0479109daa4ddce3c046f35c7e43e6cec8936d75e23` before and after; unchanged.
- Findings: 0 Critical, 0 High, 3 Medium, 1 Low.

| Finding | Resolution |
| --- | --- |
| M1: a missing commands stream made the removal fail | Fixed: `StreamNotFound` counts as removed, with a unit test. |
| M2: `verification.md` and the `make verify` result were missing | Fixed: this record. |
| M3: no test refused a removal against PostgreSQL and NATS | Fixed: the integration test revokes a worker with a refusing removal, reads the committed revocation, and lets the startup repair remove its consumer while an active worker keeps its own. |
| L1: the retry at the next start was promised unconditionally | Fixed: the retry note, the comment, the proposal, the design, and the scenario say a start retries while the worker is among the latest revoked. |

## Review pass 2

- Reviewer: Codex CLI, the same invocation, run in the worktree at `c21b1b9`; the prompt named pass 1's session and asked to confirm each resolution before reviewing the whole change again.
- Model confirmation: `gpt-6.1-sol`, reasoning effort medium, sandbox read-only in the output header. Session ID: `01a174fd-f3f2-7773-a2af-54995d1b7e63`.
- Snapshot: `6c2f53bec403ec40215c5ba95d3b464877a119ea7acebedf5c0182bd3121020f` before and after; unchanged.
- Pass 1 resolutions: all four confirmed resolved.
- Findings: 0 Critical, 0 High, 1 Medium, 1 Low.

| Finding | Resolution |
| --- | --- |
| M1: PostgreSQL ordered by `broker_revocations.revoked_at`, which is never earlier than the JWT, unlike the in-memory registry | Fixed: the query orders by the record's `revokedAt`; the conformance case adds a worker whose broker JWT postdates its revocation. |
| L1: design decision 5 named only `ConsumerNotFound` | Fixed: it names `StreamNotFound` too. |

## Limitations

- The administration tool's printed retry note is not covered by a test, because only a broker refusal after the revocation's own broker connection would produce it there; the service result it maps is covered.
- A failed removal of a worker that falls out of the `100` latest revoked workers stays until an operator removes it; G6 verifies the bound.

## Remaining gates

- Review pass 3, the last under the cap.
- Integration into `dev` and archive by the coordinator.
