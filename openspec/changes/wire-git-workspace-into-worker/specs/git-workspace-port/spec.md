## ADDED Requirements

### Requirement: Killed reclaim containment
After a reclaim program that overran `RECLAIM_RUN_BOUND_MS` or failed after `go`, the adapter SHALL first record the failure durably, then kill the program's containment, `cgroup.kill` on Linux or the process group with `SIGKILL` while its leader is not yet reaped on one account, prove it empty, and free it; it SHALL never retry the program, and a containment still populated at the proof's bound SHALL stay.

#### Scenario: Program past its run bound on Linux
- **WHEN** a Linux reclaim program still runs at its run bound
- **THEN** `reclaim` fails with reason `reclaim-failed`, the workspace stays handed off, and the cgroup `reclaim-<name>` is gone

#### Scenario: Failed program's containment
- **WHEN** a reclaim program exits with a failure after `go`
- **THEN** its empty containment is freed, and the record keeps the failure

### Requirement: Handed-off workspace refusal in the adapter
An adapter composed with a separate execution account SHALL hold at most one handed-off workspace per worker: `handOff` SHALL refuse while another workspace is handed off with `precondition-failed` and reason `other-workspace-handed-off`, checking and recording atomically per worker. The worker's slot rules are the worker runtime's (`worker-runtime`, "Slot held by a handed-off workspace").

#### Scenario: Second hand-off
- **WHEN** one workspace is handed off and another workspace of the worker is handed off
- **THEN** the second hand-off fails with reason `other-workspace-handed-off`, also after a restart

#### Scenario: Concurrent hand-offs
- **WHEN** two workspaces of the worker are handed off concurrently
- **THEN** exactly one hand-off succeeds and the other fails with reason `other-workspace-handed-off`

## MODIFIED Requirements

### Requirement: Reclaim program containment
Unless the identities are the same, the worker SHALL record the reclaim program's containment `reclaim-<name>` under its containment parent in the hand-off record after the program entered it and signalled readiness and before `go`. The scan SHALL skip it, and the worker SHALL prove it empty by polling, without a kill, before it reclaims, runs Git, or hands off again, reporting it for reconciliation at a bound. A failed program SHALL keep the workspace handed off.

#### Scenario: Surviving reclaim program
- **WHEN** the worker restarts while the reclaim program of its previous run still runs
- **THEN** it does not reclaim again, run Git on the workspace, or hand it off until that program's process set is proven empty

#### Scenario: Failed reclaim program
- **WHEN** the reclaim program exits with a failure
- **THEN** `reclaim` fails with `precondition-failed` and reason `reclaim-failed`, the workspace stays handed off, and the program does not run again

#### Scenario: Program past its run bound
- **WHEN** the reclaim program still runs 10 minutes after `go` (`RECLAIM_RUN_BOUND_MS`)
- **THEN** `reclaim` fails with reason `reclaim-failed`, the record keeps the failure, and the program's containment is killed, proven empty, and freed, while the workspace stays handed off

#### Scenario: Reclaim containment at start
- **WHEN** the worker restarts while a reclaim program runs in the containment that a hand-off record names
- **THEN** it reports no unrecorded process for that containment and kills no process of it

#### Scenario: Crash before the failure is recorded
- **WHEN** the worker is killed after its reclaim program failed and before the failure is durable in the hand-off record, and `reclaim` is called after the restart
- **THEN** the worker proves the containment empty and runs the program again, and a failure again is recorded and fails with reason `reclaim-failed`

#### Scenario: Program past the bound
- **WHEN** the containment that a hand-off record names is still populated at the bound
- **THEN** the workspace stays handed off and is reported for reconciliation

#### Scenario: Program not yet ready
- **WHEN** the reclaim program has started but has not yet entered its containment and signalled readiness
- **THEN** the worker has not recorded the containment and has not written `go`, and if the program is not ready within 60 seconds (`RECLAIM_READY_BOUND_MS`), the worker abandons it and `reclaim` fails with `unavailable`

#### Scenario: Waiting program without its worker
- **WHEN** a launched program's worker dies before `go`, or no `go` arrives within 60 seconds
- **THEN** the program exits without changing the checkout and leaves its containment empty

## REMOVED Requirements

### Requirement: Single slot with a shared execution account
**Reason**: It is a rule of the worker, not of the port (coordinator decision Q10 of the change `wire-git-workspace-into-worker`).
**Migration**: `worker-runtime` "Single slot with a separate execution account" holds it, naming the execution account by its uid and gid.

### Requirement: One handed-off workspace per Linux worker
**Reason**: Its slot rules are the worker's (coordinator decision Q10 of the change `wire-git-workspace-into-worker`); the adapter keeps only its refusal.
**Migration**: "Handed-off workspace refusal in the adapter" holds the `other-workspace-handed-off` refusal and its scenarios; `worker-runtime` "Slot held by a handed-off workspace" holds the slot, its refusal with `worker-slots-exhausted`, and the delegated child, and "Capacity declaration" the declaration after the reclaim.
