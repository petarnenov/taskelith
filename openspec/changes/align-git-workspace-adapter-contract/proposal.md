## Why

G3 item 16 (`implement-git-workspace-adapter`, `docs/g3-plan.md`) implements the Git workspace contract (`docs/contracts/git-workspace.md`) with the pinned `git` CLI. Before any Git code, the contract left open points that the adapter would otherwise decide alone: the names of the lifecycle crash points, the snapshot format ("for example a tar archive"), how the run credential reaches Git, what "never forced" means for a push with a lease, how the worker counts the slot a handed-off workspace holds when `list` says nothing about hand-offs, the reclaim program's containment name and its proof after a restart, the reclaim program on macOS, the pinned Git client, the single slot of a Linux worker with a separate execution account, and which half of the "One handed-off workspace" test belongs to item 38. This change is sub-change 16a, size S-M: it settles those points in the contract, the spec, the port, the fixture, the conformance suite, and the test double, with the owner's delegate's decisions of 2026-10-28 (design D1 to D12). The Git code follows in 16b to 16e.

## What Changes

- Contract `docs/contracts/git-workspace.md`: crash points `WS1` to `WS10` (section 3); the `handedOff` read; the reclaim containment `reclaim-<name>`, its exclusion from the scan for unrecorded processes, its proof by polling without a kill and the bound, and the outcome of a failed program kept in the record (section 3); the reclaim program on macOS in its own process group (sections 2 and 3); the single slot and the start refusal with `TASKELITH_WORKER_SLOTS` above `1` (section 3); the credential transport through `http.extraHeader` in command-scope environment configuration, HTTPS remotes, and the pinned Git client (section 7); "never forced" and the push options (section 8); the failure reasons `insecure-remote`, `gitlink-in-tree`, and `git-client-mismatch` (section 9); Taskelith's own tar snapshot and the gitlink refusal (section 10); the fixture hooks and the new checks of the suite (section 12); the sub-changes 16a to 16e, the move of the delegated-child half of a test to item 38, and a pending gate for the suite natively on macOS (sections 13 and 14).
- `@taskelith/workspace` (private): the port read `handedOff`; the domain values and rules `HEAD_SNAPSHOT_CONTENT_TYPE`, `encodeHeadSnapshot`, `GIT_CLIENT_PINS`, `checkGitClient`, `checkRemoteTransport`, `taskBranchPushOptions`, `reclaimContainmentName`, `RECLAIM_CONTAINMENT_PREFIX`, and the types `TreeEntry` (moved from the fixture), `GitTreeEntry`, `GitClientPin`, and `RemoteTransportPolicy`; the fixture hooks `commitGitlink`, `gitProcesses`, `plantGitSetting`, and `gitConfig`; six new conformance cases and stronger checks in two existing ones.
- Test double and tests: the double records the Git processes a real adapter would start, writes `.git/config` anew before each Git call, refuses insecure remotes and gitlink trees, snapshots through `encodeHeadSnapshot`, and implements `handedOff`; ten new defective variants; unit tests of the new rules, the archive checked with the system `tar`.
- `docs/g3-plan.md`: the item 16 row names the sub-changes 16a to 16e, and the item 38 row takes the delegated-child half of the "One handed-off workspace" test.

## Capabilities

### New Capabilities

### Modified Capabilities

- `git-workspace-port`: modifies "Prepare refusals", "Crash-safe lifecycle", "Per-run credential use", "Fast-forward task branch push", "Head evidence snapshot", "Hand-off state", and "Reclaim program containment"; adds "Failed reclaim program", "Reclaim program on one account", "Single slot with a shared execution account", "Pinned Git client", "HTTPS remotes", "Snapshot archive format", and "Conformance of the adapter's Git use".

## Impact

The private package `@taskelith/workspace`, its tests, the Git workspace contract, and the G3 plan. No published package content, no Git call, no worker wiring, and no image change. The slot refusal and the reclaim program are stated here and implemented in 16d and 16e; `capacity-reservation` and `worker-runtime` are not changed, the slot rule staying in `git-workspace-port`.
