## ADDED Requirements

### Requirement: Git workspace composition
A worker with a launch command SHALL compose the Git workspace adapter with the Git client pin of its platform and the remote policy `https-only`, SHALL fail its start with `precondition-failed` and reason `git-client-mismatch` before it enrolls or opens its journal when the client is not the pinned one, and SHALL sweep the workspace root before any workspace is prepared. A worker without a launch command SHALL compose no workspace and run no Git client gate.

#### Scenario: Mismatched Git client
- **WHEN** a worker with a launch command starts and its Git client prints another version than its pin
- **THEN** the start fails with reason `git-client-mismatch`, and the worker neither enrolls nor opens its journal

#### Scenario: Leftover staging entry
- **WHEN** a worker with a launch command starts with a staging entry left by a crash under its workspace root
- **THEN** the entry is deleted before any workspace is prepared

#### Scenario: Linux worker without a launch command
- **WHEN** a Linux worker without a launch command starts
- **THEN** it composes no workspace, runs no Git client gate, and does not read `fs.protected_hardlinks`

### Requirement: Linux workspace composition
A Linux worker with a launch command, whose executions run under a separate execution account, SHALL compose the reclaim host with its containment parent and that account, SHALL pass the account's group to the worker root, SHALL hold that group as its supplementary group from the worker container's entrypoint, and SHALL set its umask to `0007`.

#### Scenario: Launching worker in the worker container
- **WHEN** the worker container's entrypoint starts a worker with a launch command and an execution group
- **THEN** the worker runs with that group as its only supplementary group

#### Scenario: Workspace root open to the execution group
- **WHEN** a Linux worker with an execution account starts
- **THEN** its data root, `worker/`, and `worker/workspaces/` have the execution group and mode `0710`

### Requirement: Single slot with a separate execution account
A Linux worker with a launch command, whose executions share a separate execution account, SHALL declare one slot when `TASKELITH_WORKER_SLOTS` is unset or `1`, and SHALL refuse to start, before it enrolls, when it is greater than `1`, with an `invalid` failure that names the variable and the execution account by its uid and gid. A worker whose executions run as its own account SHALL keep the slot count it is given.

#### Scenario: Two slots requested
- **WHEN** a Linux worker with the execution account of uid 10003 and gid 10003 starts with `TASKELITH_WORKER_SLOTS=2`
- **THEN** its start fails with an error that names `TASKELITH_WORKER_SLOTS` and `uid 10003, gid 10003`

#### Scenario: Slots unset
- **WHEN** a Linux worker with an execution account starts without `TASKELITH_WORKER_SLOTS`
- **THEN** it declares one slot

#### Scenario: macOS slots
- **WHEN** a macOS worker with a launch command starts with `TASKELITH_WORKER_SLOTS=2`
- **THEN** it declares two slots

### Requirement: Protected hard links at the start
A Linux worker with a separate execution account SHALL read `fs.protected_hardlinks` at its start and SHALL fail the start before it enrolls, with `precondition-failed` and reason `hardlinks-unprotected`, unless the setting is `1`; a setting it cannot read SHALL fail it too. This is a start precondition, not a self-check, so a failed self-check still never fails the start. Other workers SHALL NOT read it.

#### Scenario: Unprotected hard links
- **WHEN** a Linux worker with an execution account starts while `fs.protected_hardlinks` is `0`
- **THEN** its start fails with reason `hardlinks-unprotected` and an error that names `fs.protected_hardlinks`

#### Scenario: Unreadable setting
- **WHEN** the setting cannot be read at the start
- **THEN** the start fails, and the setting is never taken as `1`

#### Scenario: macOS worker
- **WHEN** a macOS worker starts
- **THEN** it does not read `fs.protected_hardlinks`

### Requirement: Slot held by a handed-off workspace
A worker that composes the Git workspace SHALL count, once per attempt beside the attempts its journal counts, every attempt whose hand-off record exists as holding one slot, but not its CPU or memory, until its reclaim removes the record, read through `handedOff` at the start; it SHALL refuse an offer beyond its slots with `worker-slots-exhausted`, and a hand-off read that fails SHALL fail the start.

#### Scenario: Reclaim after the exit
- **WHEN** every slot of the worker is held, one of them by a handed-off attempt whose assignment has ended and whose reclaim has not removed the record, and an offer arrives
- **THEN** the worker refuses it with `worker-slots-exhausted`

#### Scenario: Held slot after a restart
- **WHEN** the worker restarts with a hand-off record on disk and an offer arrives beyond its other slots
- **THEN** it refuses it with `worker-slots-exhausted`

#### Scenario: Slot only
- **WHEN** a handed-off attempt that the journal no longer counts holds a slot and an offer fits the remaining slots, CPU, and memory
- **THEN** the worker accepts it

#### Scenario: Slot after the reclaim
- **WHEN** the reclaim of the only handed-off workspace succeeds and an offer arrives within the worker's capacity
- **THEN** the worker accepts it

#### Scenario: Delegated child on a second worker
- **WHEN** a parent's workspace is handed off on a Linux worker and the parent waits for its delegated child
- **THEN** the worker refuses the child's assignment with `worker-slots-exhausted`, so the child runs only on another worker with a free slot, in its own workspace

### Requirement: Failed workspace reclaim
A worker whose reclaim fails with `reclaim-failed` SHALL keep the workspace's slot held, SHALL log `worker.workspace.reclaim-failed` with the attempt, and with the containment when a start finds the failure, never with a path, a credential, or checkout content, and SHALL never run the reclaim program again for that hand-off by itself; a start that finds a hand-off record holding a failed reclaim SHALL do the same.

#### Scenario: Failed program
- **WHEN** the reclaim program of a handed-off workspace fails
- **THEN** the slot stays held, `worker.workspace.reclaim-failed` is logged once, and no new program starts

#### Scenario: Failure found after a restart
- **WHEN** the worker restarts with a hand-off record that holds a failed reclaim
- **THEN** the slot is held and `worker.workspace.reclaim-failed` is logged with the attempt and the containment

#### Scenario: No secret in the line
- **WHEN** a failed reclaim's message holds a checkout path and a credential
- **THEN** the logged line holds neither

### Requirement: Workspace start failures without paths
A worker whose start fails because it cannot read `fs.protected_hardlinks`, sweep its workspaces, or read its hand-off records SHALL report a fixed message with only the system error code, such as `EACCES`, and never the error's own message, which may name a checkout path.

#### Scenario: Unreadable hand-off records
- **WHEN** the hand-off records cannot be read at the start with an error whose message names a checkout path
- **THEN** the start failure that the worker writes names the error code and not the path

### Requirement: Recorded reclaim containment skipped by the scan
A Linux worker's start scan for unrecorded processes SHALL skip a cgroup that a hand-off record names at the start, and SHALL still report a populated cgroup that no record names.

#### Scenario: Surviving reclaim program at the start
- **WHEN** a Linux worker starts while a reclaim program runs in the cgroup its hand-off record names
- **THEN** the scan journals no `unrecorded-process` for that cgroup, and one for another populated cgroup

### Requirement: macOS workspace composition
A macOS worker with a launch command SHALL compose the Git workspace adapter with Apple's Git pin and the process-group reclaim host on its own account, SHALL keep its slot count, SHALL change neither its umask nor its groups, and SHALL allow several handed-off workspaces.

#### Scenario: Composition on macOS
- **WHEN** a macOS worker with a launch command starts
- **THEN** it verifies Apple's Git pin, reads no `fs.protected_hardlinks`, keeps its umask, and reclaims in a process group of its own

## MODIFIED Requirements

### Requirement: Worker settings
The worker SHALL read its data root, HTTPS control-plane URL, broker URL, enrollment token, installation CA fingerprint, and declared capacity from its environment. The capacity SHALL default to the configured slots, default 2, or 1 for a Linux worker with a separate execution account, and the host's CPU and memory less the daemon's 512 MiB. A failure SHALL name the variable, never its value.

#### Scenario: Invalid slot count
- **WHEN** `TASKELITH_WORKER_SLOTS` is `0`
- **THEN** the settings fail with `invalid`, naming the variable

#### Scenario: Plain control-plane URL
- **WHEN** `TASKELITH_CONTROL_PLANE_URL` is an `http:` URL
- **THEN** the settings fail with `invalid`, naming the variable

#### Scenario: Malformed fingerprint
- **WHEN** `TASKELITH_INSTALLATION_CA_SHA256` is not 32 bytes in hexadecimal, with or without colons
- **THEN** the settings fail with `invalid`, naming the variable

### Requirement: Capacity declaration
A worker SHALL journal `worker.capacity.declared` at its first start and whenever its slots, CPU, memory, enforceable controls, or protocol window differ from its last declaration, and after every reclaim that removes a hand-off record, also when its capacity is unchanged, so that the scheduler finds it eligible again. It SHALL owe that declaration durably before the reclaim, so that a later reclaim or the next start journals it after a journal failure or a crash.

#### Scenario: Unchanged capacity
- **WHEN** a worker starts again with the capacity it declared before, and no reclaim owes a declaration
- **THEN** it journals no new declaration

#### Scenario: Declaration after a reclaim
- **WHEN** a worker's reclaim removes a hand-off record and its capacity is unchanged
- **THEN** it journals `worker.capacity.declared` again

#### Scenario: Declaration owed after a fault
- **WHEN** the journal fails, or the worker crashes, after a reclaim removed a hand-off record and before its declaration was journaled
- **THEN** the next successful reclaim, or the next start, journals `worker.capacity.declared`
