## Why

G2 item 7 in the [G2 work plan](/docs/g2-plan.md). G1 decision D4 (a) deferred the attempt and assignment state machines to G2, and G1 item 7 deferred the ownership generation of an admission ([ADR 0010](/docs/decisions/0010-g1-closure.md)). Architecture section 5 requires that conflicting active ownership is never silently accepted (invariant 2), that assignment acceptance, runtime start, command completion, and task outcome are different facts (invariant 3), and that loss of contact proves nothing about a process (invariant 4). The four merged pre-G2 contracts, [launch authorization](/docs/contracts/launch-authorization.md), [supervisor identity](/docs/contracts/supervisor-identity.md), [worker journal](/docs/contracts/worker-journal.md), and [capacity reservation](/docs/contracts/capacity-reservation.md), name the facts and states this domain must model before items 8 (wire contracts), 11 (persistence), 17 (launch authority), 18 (resource admission), and 21 (reconciliation) build on it.

## What Changes

- Add the private module package `@taskelith/execution` with a pure domain: tasks with their ownership generation and at most one active attempt, attempts with derived phases, executions with the `authorized`, `started`, `exited`, and `not-started` states, launch grants with computed expiry, the ordered launch authorization checks and their rejection reasons, the execution ownership rule, transport retries, revocation by invalidating writers, the start observation decisions including `unauthorized-start`, exit and not-started facts accepted by version, uncertainty kept beside the state, cancellation requested versus termination observed, attempt outcomes and task outcome facts, operator reconciliation, and the per-producer observation sequence.
- Add the private module package `@taskelith/scheduling` with a pure domain: assignments with the `offered`, `accepted`, and `ended` states and compare-and-set generations, the capacity reservation each holds and its release only with a justified transition, bounded supersession, operator reconciliation, and worker reachability kept orthogonal to execution.
- Bind the ownership generation into task admission: `@taskelith/sdlc` gains `OwnershipGeneration`, and a dispatch may pass one to `useAdmission`, which the used admission keeps; existing callers and the G1 tests are unchanged. The frozen `SdlcFramework` port is untouched. `@taskelith/sdlc` also exports its existing generation helpers for the new modules.

Excluded: application services, ports, repositories, and adapters (items 11, 17, 18, 21); wire schemas (item 8); quotas, delegation budgets, fairness, and retry backoff (item 18); worker-side runtime and limits (items 14, 15, 20); sessions and subscription account slots (G3).

## Capabilities

### New Capabilities
- `execution-model`: the pure Execution domain described above.
- `scheduling-model`: the pure Scheduling domain described above.

### Modified Capabilities
- `sdlc-task-admission`: the admission record binds the ownership generation of a fenced dispatch.

## Impact

Two new workspace packages under `packages/modules/` with tests; additive changes to `@taskelith/sdlc` (`ownership-generation.ts`, an optional parameter of `useAdmission` and of `TaskAdmissionService.useAdmission`, new exports) with new tests. The lockfile gains the two workspace entries; no external dependency is added, and the published npm package is unchanged.
