## Context

`LinuxContainmentScan` (`packages/adapters/worker-supervisor/src/linux.ts`) walks the cgroups under the containment parent and reports each populated one without a record as `execution.unrecorded-process`. The archived [`implement-unrecorded-process-scan`](/openspec/changes/archive/2026-10-26-implement-unrecorded-process-scan/design.md) design records under "Risks / Trade-offs" that the worker's own cgroup is not excluded and that a check belongs to a future self-check task. `checkLinuxContainment` (`src/linux-self-check.ts`) receives the home cgroup but uses it only to prove that the execution account cannot write its `cgroup.procs`. The [supervisor identity contract](/docs/contracts/supervisor-identity.md) sections 2, 8, and 13 do not place the home relative to the parent.

## Owner decision (2026-10-26)

The owner's delegate chose option A in away run `20261026T130340Z-opencode-33653`, relayed by the coordinator: the self-check refuses a home cgroup at or under the containment parent, with one additive contract sentence and the matching spec scenario; no other contract change.

## Goals / Non-Goals

**Goals:** the contract sentence, the spec scenario, the refusal in `checkLinuxContainment`, and tests for it.

**Non-Goals:** excluding the home inside the scan itself; wiring the self-check into worker admission; any `apps/worker` change; admission pressure, disk, or backlog checks (20e2) and item 23b.

## Decisions

### D1: refuse the layout before any probe

The check runs right after the cgroup v2 check and returns at once, before the probe cgroup is created under the parent. The layout is a configuration fault that makes the other probes meaningless, and refusing first leaves the parent untouched. The failure names both cgroups: `the home cgroup <home> is at or under the containment parent <parent>`.

- **Alternative:** collect it with the other problems. Rejected: the probe would then be created under a parent that holds the worker itself.

### D2: compare whole path segments

`isAtOrUnder` resolves both paths, splits them into non-empty segments, and checks that the parent's segments are a prefix of the home's. A string prefix would treat `/a/bc` as under `/a/b`; resolving also makes `executions/` equal to `executions`. A parent of `/` holds every home, which is correct.

### D3: admission wiring stays a remaining gate

No production code calls `checkLinuxContainment`: it is exported from `packages/adapters/worker-supervisor/src/index.ts:28` and called only by the unit and privileged tests. `apps/worker/src/main.ts` (`supervisionHost`, lines 95–113) builds the platform and the containment scan without a self-check. Admitting a worker on its self-check is G3 item 27, `implement-worker-self-check-admission` (`docs/g3-plan.md:51`). The refusal therefore reaches admission once that item calls the existing self-check, with no further change here; building that wiring is outside this change.

## Risks / Trade-offs

- **Not enforced at runtime yet.** Until the admission item calls the self-check, a misconfigured worker still starts and the scan risk of the archived design stays open in production.
- **Paths as given.** The check compares the paths the caller passes; it does not follow symbolic links or compare cgroup inodes. Both paths come from the cgroup v2 mount, where the platform builds the home from `/proc/self/cgroup`.
