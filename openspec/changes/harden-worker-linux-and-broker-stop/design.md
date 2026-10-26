## Context

`LinuxContainmentScan` (`packages/adapters/worker-supervisor/src/linux.ts`) lists every populated cgroup directly under the containment parent and the worker journals each one without an execution record as `unrecorded-process`. The worker's home cgroup comes from `/proc/self/cgroup`; the Linux self-check (`linux-self-check.ts`) probes the containment parent and the home only for write access by the execution account.

`abortableDelay` (`packages/adapters/nats/src/abortable-delay.ts`) adds an `abort` listener and a timer. An `AbortSignal` that has already aborted never dispatches `abort` again, so the delay ran its full length.

## Goals / Non-Goals

- Goal: a stop requested while a loop is between rounds ends the loop without the pause.
- Goal: exclude the home cgroup from the scan exactly as the supervisor identity contract states, or stop if it does not state how.
- Non-goals: any contract or requirement change, admission pressure and disk work (20e2), task 23b, and changes to `apps/worker`.

## Decisions

- **D1: Home cgroup exclusion stopped at the gate.** `docs/contracts/supervisor-identity.md` defines a containment as "a cgroup v2 directory per execution, named from its `executionId` under the worker's cgroup" (line 23) and the fact as "A populated containment of this worker without an execution record" (line 178). The self-check sections (lines 117, 206, 209) require only that the process set cannot write any cgroup of the worker and that a delegated cgroup v2 containment exists. No line forbids the home under the containment parent or says the scan skips it. Either rule would be a new contract statement, so no code is written; the owner decides between a self-check refusal, a scan exclusion, or both.
- **D2: Settle at once on an aborted signal.** `abortableDelay` returns a resolved promise when `signal.aborted` is already true, before any timer or listener exists. This matches the existing abort path, which also resolves; callers check `signal.aborted` after the delay and stop. No spec delta: no requirement states stop latency.

## Risks / Trade-offs

- **The scan risk remains.** Until the owner decides D1, a deployment whose home cgroup lies under the containment parent can report the worker itself as an unrecorded process.
