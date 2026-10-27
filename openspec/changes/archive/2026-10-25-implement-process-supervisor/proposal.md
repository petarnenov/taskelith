## Why

G2 item 15 in the [G2 work plan](/docs/g2-plan.md). The plan asks for the worker process adapter under the [supervisor identity contract](/docs/contracts/supervisor-identity.md). It covers launch by stable execution identity, adoption, exit observation, cancellation of the process tree, and uncertainty reported when neither start nor absence is proven, on Linux and macOS. It also adds crash points around launch and handle persistence. Decision D7 (c) makes the supervisor one small process per execution. Items 20 (worker runtime), 24 (failure scenarios), and 25 (native acceptance) build on it.

## What Changes

- Add the worker-only adapter package `@taskelith/worker-supervisor` in `packages/adapters/worker-supervisor`, which the boundary rule of item 9 keeps out of the control plane. It holds:
  - the execution record files with their format version: `intent`, `supervisor.<n>`, `launch` (claim or seal), `handle`, the framed append-only `events`, `exit`, and `cancel`;
  - the first supervisor's launch sequence CP5 to CP11 and the adopting supervisor;
  - the worker's steps CP2 and CP4, sealing, cancellation, the facts it reads at CP10 and CP12, recovery by the table of contract section 6, and record removal;
  - the macOS termination proof;
  - Linux readers of `/proc` and the deadline clock, the cgroup v2 containment, and the self-check that proves the containment holds;
  - a macOS platform that fails closed;
  - a Node spawner that starts the child in a new session and process group;
  - the detached supervisor program, a file record store and an execution lock on item 14's helpers, and the opt-in target `make verify-linux-cgroup` with its test-only image.
- Amend the supervisor identity contract with the decisions this item needed, made on 2026-10-25 by a Claude Fable 5.1 subagent under the owner's delegation:
  - D-B (a): the execution `lock` is the exclusive SQLite lock of the worker journal contract; only the lock module opens the file, and children never inherit it.
  - D-C (a): on Linux, the child runs under a separate execution account.
  - D-C2 (a): Docker's built-in init runs in the worker container, so no old namespace's end is proven in G2.
  - The record gains a `cancel` file, and `intent` gains the command and the execution account.
- Propose, without installing it, qualification evidence for `koffi` ([koffi-qualification.md](koffi-qualification.md)). D-A, the macOS native reads, stays with the owner. Until then, the macOS adapter fails closed and seals every launch.

Excluded:
- the worker runtime that drives these steps and turns facts into observations (item 20);
- the journal and its durable file helpers (item 14), which this item imports from `@taskelith/worker-journal`;
- the harness port and the real executed program (G3);
- the container image, its execution account, capabilities, and init (item 23);
- native acceptance on every matrix entry (item 25).

## Capabilities

### New Capabilities
- `worker-supervisor`: the adapter described above.

### Modified Capabilities
None. The contract page records the decisions; the `execution-supervisor` requirements stay valid.

## Impact

- One new workspace package with tests. The lockfile and the dependency inventory gain the workspace entry.
- `docs/contracts/supervisor-identity.md` is amended.
- No external dependency is added, and the published npm package is unchanged.
