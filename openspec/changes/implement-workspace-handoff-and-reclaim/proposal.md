## Why

G3 item 16 (`implement-git-workspace-adapter`, `docs/g3-plan.md`, row 16) implements the Git workspace contract (`docs/contracts/git-workspace.md`) in sub-changes 16a to 16e. 16b and 16c built the local and the remote operations and deferred the hand-off, the reclaim, the crash points `WS5` to `WS10`, the 6 conformance cases that need them, and the Linux tests in the worker image to this change, sub-change 16d: "the hand-off, the reclaim program and its containment, and the contract's Linux tests in the worker image, with the image's pinned Git".

## What Changes

- `@taskelith/git-workspace`:
  - `GitWorkspaces.handOff`, `reclaim`, and `handedOff` (contract section 3, steps 6 and 7): a durable hand-off record (`hand-off-record.ts`), one hand-off chain per workspace root so that the check for another hand-off and the write of the record are one step, the containment recorded before the program may run, the proof that a recorded containment is empty by polling up to `RECLAIM_PROOF_BOUND_MS` (30 s), the `reclaim-failed` outcome kept in the record, and the crash points `WS5` to `WS10` with the bare `WS8`.
  - The reclaim program (`reclaim-program.ts`, `reclaim-program-main.ts`): waits for `go`, on Linux enters `reclaim-<name>` as root and switches to the execution account, copies hard-linked regular files, and sets exact shared modes on what it owns.
  - `ReclaimHost` with `LinuxReclaimHost` (cgroup containment) and `ProcessGroupReclaimHost` (one account); the host's execution account gives the attempt directory and the checkout the execution group at prepare.
  - `.git/config` is rewritten with mode `0660`, so the harness's Git can read it (found by the Linux tests).
  - `GitWorkspaces` implements the whole `WorkspaceProvider`; the type `GitWorkspaceOperations` is gone.
- Worker image (`infra/installation/Dockerfile`): installs `git=1:2.43.0-1ubuntu7.4` and fails the build unless that package and `git version 2.43.0` are installed.
- `make verify-linux-git-workspace` (opt-in, like `verify-linux-cgroup`): builds the worker image (`installation.sh build-worker`) and runs `test/linux-git-workspace.privileged.ts` in it (`scripts/linux-git-workspace.sh`).
- Tests: the 6 deferred conformance cases run and the skip list is retired; the hand-off cases run again with an execution account; adapter tests of the hand-off, the reclaim, every crash point, the failed, surviving, and abandoned program, and the program itself; the Linux suite runs the conformance suite and the contract's Linux tests in the worker image.

## Capabilities

### New Capabilities

### Modified Capabilities

- `git-workspace-port`: adds "Conformance run of the Git adapter", "Git adapter hand-off and reclaim", "Reclaim program of the worker image", and "Git workspace Linux tests in the worker image", modifies "Repository configuration rewrite", and removes "Conformance run of the local operations", whose skip list is gone.

## Impact

Private packages only (`@taskelith/git-workspace`; `@taskelith/workspace` is unchanged), the worker image, the Makefile, and `scripts/installation.sh`. No new third-party dependency; the image gains the Ubuntu package of the contract's Git pin. No contract document under `packages/contracts/` changes, so no breaking change is declared. Out of scope (16e): the worker wiring of the reclaim host and the execution group, the worker's supplementary group and umask `0007`, the single slot and its start refusal, `fs.protected_hardlinks`, the scan's exclusion of a recorded containment, the `reclaim-failed` handling, and the macOS composition; item 38: the delegated-child half of "One handed-off workspace".
