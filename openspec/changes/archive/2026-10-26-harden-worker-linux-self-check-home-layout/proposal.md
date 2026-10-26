## Why

`LinuxContainmentScan` reports every populated cgroup under the containment parent that has no execution record as `execution.unrecorded-process`. If the worker's own home cgroup, read from `/proc/self/cgroup`, were the containment parent or a cgroup under it, the worker could report itself. The archived [`implement-unrecorded-process-scan`](../archive/2026-10-26-implement-unrecorded-process-scan/design.md) design names this under "Risks / Trade-offs" and leaves the check to a future self-check task. Today the Linux self-check (`checkLinuxContainment`) only proves that the execution account cannot write the home's `cgroup.procs`; neither it nor the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) places the home relative to the parent.

## What Changes

- **Contract (additive, one sentence).** Section 13 of the supervisor identity contract: a Linux worker whose home cgroup is at or under its containment parent fails its self-check.
- **Self-check.** `checkLinuxContainment` refuses that layout before it creates a probe cgroup. Paths are compared by whole segments, so `/a/bc` is not under `/a/b`. The intended layout, `executions/` (the parent) beside `init/` (the home), still passes.
- **Tests.** Unit tests for the refusal (home equal to the parent and under it), the sibling layout, and the segment edge case; the privileged cgroup test adds the refusal and keeps the sibling layout passing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-supervisor`: the Linux self-check refuses a home cgroup at or under the containment parent.

## Impact

- `@taskelith/worker-supervisor`: `src/linux-self-check.ts`, `test/linux.test.ts`, `test/linux-cgroup.privileged.ts`.
- `docs/contracts/supervisor-identity.md`: one sentence in section 13.
- No change to `apps/worker`, no API, journal, or wire change, and no new dependency.
- Admission wiring is not part of this change: no production code calls the self-check yet (see design D3).
