## Why

G3 item 16 (`implement-git-workspace-adapter`, `docs/g3-plan.md`, row 16) implements the Git workspace contract (`docs/contracts/git-workspace.md`) in sub-changes 16a to 16e. 16b to 16d built the Git workspace adapter, `@taskelith/git-workspace`, with its hand-off, reclaim program, and Linux tests, and left its use by the worker to this change, sub-change 16e: "the worker wiring and admission: the execution group, the single slot and its start refusal, `fs.protected_hardlinks`, `reclaim-failed` handling, and the macOS composition". Until then no worker composes the adapter, so none of the contract's worker-side rules (sections 2, 3, 7, and 14) is enforced.

## What Changes

- `@taskelith/worker` (`apps/worker`) composes the Git workspace adapter at its composition root: the pinned Git client and its start gate, the reclaim host of its platform (`LinuxReclaimHost` with the execution account and the containment parent on Linux, `ProcessGroupReclaimHost` on macOS), the execution group passed to the worker journal adapter, the process umask `0007`, and the `sweep` on start before any prepare.
- One handed-off workspace per Linux worker with a separate execution account: the worker declares one slot when `TASKELITH_WORKER_SLOTS` is unset, refuses to start when it is above `1` with an error that names the variable and the execution account, counts a workspace that `handedOff` returns as holding its slot until the reclaim, refuses an assignment beyond it with `worker-slots-exhausted`, and declares its capacity again after the reclaim.
- The start check of `fs.protected_hardlinks`: a worker with a separate execution account refuses to start unless the setting is `1`, with an error that names the setting.
- `reclaim-failed` handling: a failed reclaim, and a program past its run bound, keep the workspace's slot held and are logged as `worker.workspace.reclaim-failed` for reconciliation; the worker never runs the program again by itself. The adapter kills a program past its run bound, proves its containment empty, and frees it, and frees the empty containment of a failed program the same way.
- The worker's scan for unrecorded processes skips a containment that a hand-off record names.
- The macOS composition: one account, no containment, the slot count the worker is given, and no `fs.protected_hardlinks` check.
- The worker container's start gives the worker identity the execution group as a supplementary group.
- Tests for each rule, with fail-before evidence, on Linux in the worker image and on the host for the one-account composition.

The open details that the contract left to the wiring are listed in `design.md`, "Coordinator questions", with the architect's answers of 2026-10-28.

## Capabilities

### New Capabilities

### Modified Capabilities

- `worker-runtime`: the worker's composition of the Git workspace adapter, its start refusals (slot count, `fs.protected_hardlinks`, Git client), the default of one slot, the hand-off slot count, the capacity declaration after a reclaim, the `reclaim-failed` handling, the scan's exclusion of a recorded reclaim containment, and the macOS composition.
- `git-workspace-port`: the kill of a reclaim program past its run bound and the removal of its containment; the worker's slot rules move to `worker-runtime` (coordinator decision Q10), leaving the adapter's `other-workspace-handed-off` refusal.

`resource-admission` is the scheduler's side of the capacity reservation contract and needs no change: the scheduler already uses the declared slot count and treats a `worker-slots-exhausted` refusal as the contract says, so every worker-side rule sits in `worker-runtime`.

## Impact

Private packages only (`@taskelith/worker`, which gains a dependency on `@taskelith/git-workspace` and `@taskelith/workspace`; `@taskelith/git-workspace`, which kills an overrun program and reads the hand-off records; `@taskelith/execution` and `@taskelith/worker-journal`, whose journal port gains `redeclareCapacity`; `@taskelith/workspace`, which gains the reason `hardlinks-unprotected`), the worker container's entrypoint under `infra/installation/` with `docs/local-installation.md`, and `docs/contracts/git-workspace.md` where the architect's answers amend it. No new third-party dependency; no contract document under `packages/contracts/` changes, so no breaking change is declared. Out of scope: the delegated-child half of "One handed-off workspace" (item 38), the harness host and the per-execution calls of `handOff` and `reclaim` around a harness (item 18, unless the coordinator decides otherwise), and reconciliation itself (item 21). Carried gates, arranged by the coordinator: the suite natively on macOS with Apple's Git on the iMac, and `verify-worker-image-reproducible`.
