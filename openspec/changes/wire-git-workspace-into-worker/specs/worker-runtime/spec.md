## ADDED Requirements

### Requirement: Git workspace composition
A worker with a launch command SHALL compose the Git workspace adapter with the Git client pin of its platform and the remote policy `https-only`, SHALL fail its start with `precondition-failed` and reason `git-client-mismatch` before it enrolls or opens its journal when the client is not the pinned one, and SHALL sweep the workspace root before any workspace is prepared.

#### Scenario: Mismatched Git client
- **WHEN** a worker with a launch command starts and its Git client prints another version than its pin
- **THEN** the start fails with reason `git-client-mismatch`, and the worker neither enrolls nor opens its journal

#### Scenario: Leftover staging entry
- **WHEN** a worker starts with a staging entry left by a crash under its workspace root
- **THEN** the entry is deleted before any workspace is prepared

### Requirement: Linux workspace composition
A Linux worker whose executions run under a separate execution account SHALL compose the reclaim host with its containment parent and that account, SHALL pass the account's group to the worker root, SHALL hold that group as a supplementary group, and SHALL run with umask `0007`.

#### Scenario: Worker in the worker image
- **WHEN** the worker starts through the worker image's entrypoint with a launch command
- **THEN** its groups include the execution group and its umask is `0007`

### Requirement: Single slot with a separate execution account
A Linux worker whose executions run under a separate execution account SHALL declare one slot when `TASKELITH_WORKER_SLOTS` is unset or `1`, and SHALL refuse to start when it is greater than `1`, with an `invalid` failure that names the variable and the execution account. A worker whose executions run as its own account SHALL keep the slot count it is given.

#### Scenario: Two slots requested
- **WHEN** a Linux worker with an execution account starts with `TASKELITH_WORKER_SLOTS=2`
- **THEN** its start fails before it enrolls, with an error that names `TASKELITH_WORKER_SLOTS` and the execution account

#### Scenario: Slots unset
- **WHEN** a Linux worker with an execution account starts without `TASKELITH_WORKER_SLOTS`
- **THEN** it declares one slot

#### Scenario: macOS slots
- **WHEN** a macOS worker starts with `TASKELITH_WORKER_SLOTS=2`
- **THEN** it declares two slots

### Requirement: Protected hard links at the start
A Linux worker whose executions run under a separate execution account SHALL read `fs.protected_hardlinks` at its start and SHALL refuse to start, before it enrolls, unless the setting is `1`; a setting it cannot read SHALL refuse the start too. A worker without a separate account SHALL NOT read it.

#### Scenario: Unprotected hard links
- **WHEN** a Linux worker with an execution account starts while `fs.protected_hardlinks` is `0`
- **THEN** its start fails with an error that names `fs.protected_hardlinks`

#### Scenario: Unreadable setting
- **WHEN** the setting cannot be read at the start
- **THEN** the start fails and the setting is never taken as `1`

#### Scenario: macOS worker
- **WHEN** a macOS worker starts
- **THEN** it does not read `fs.protected_hardlinks`

### Requirement: Slot held by a handed-off workspace
A Linux worker whose executions run under a separate execution account SHALL count, once per attempt beside the attempts its journal counts, every attempt whose workspace is handed off as holding a slot until its reclaim removes the hand-off record, read through `handedOff` at its start; it SHALL refuse an assignment beyond its slots with `worker-slots-exhausted`, and a `handedOff` read that fails SHALL fail the start.

#### Scenario: Reclaim after the exit
- **WHEN** the execution of a handed-off attempt has exited, its reclaim has not removed the record, and an offer arrives
- **THEN** the worker refuses it with `worker-slots-exhausted`

#### Scenario: Held slot after a restart
- **WHEN** the worker restarts with a hand-off record on disk and an offer arrives
- **THEN** it refuses it with `worker-slots-exhausted`

#### Scenario: Slot after the reclaim
- **WHEN** the reclaim of the only handed-off workspace succeeds and an offer arrives within the worker's capacity
- **THEN** the worker accepts it

### Requirement: Failed workspace reclaim
A worker whose reclaim fails with `reclaim-failed` SHALL keep the workspace's slot held, SHALL report the workspace for reconciliation, and SHALL never run the reclaim program again for that hand-off by itself; a start that finds a hand-off record holding a failed reclaim SHALL do the same.

#### Scenario: Failed program
- **WHEN** the reclaim program of a handed-off workspace exits with a failure
- **THEN** the slot stays held, the workspace is reported for reconciliation, and no new program starts

#### Scenario: Failure found after a restart
- **WHEN** the worker restarts with a hand-off record that holds a failed reclaim
- **THEN** the slot is held and the workspace is reported for reconciliation

### Requirement: Recorded reclaim containment skipped by the scan
A Linux worker's scan for unrecorded processes SHALL skip a containment that a hand-off record names, and SHALL report a populated `reclaim-<name>` containment that no record names.

#### Scenario: Surviving reclaim program at the start
- **WHEN** a Linux worker starts while a reclaim program runs in the containment its hand-off record names
- **THEN** the scan journals no `unrecorded-process` for that containment

### Requirement: macOS workspace composition
A macOS worker with a launch command SHALL compose the Git workspace adapter with Apple's Git pin and the process-group reclaim host on its own account, SHALL keep its slot count, change neither its umask nor its groups, and allow several handed-off workspaces.

#### Scenario: Two handed-off workspaces on macOS
- **WHEN** a macOS worker with two slots holds one handed-off workspace and receives an offer within its capacity
- **THEN** it accepts the offer

## MODIFIED Requirements

### Requirement: Capacity declaration
A worker SHALL journal `worker.capacity.declared` at its first start, whenever its slots, CPU, memory, enforceable controls, or protocol window differ from its last declaration, and after each reclaim that removes a hand-off record, even with an unchanged capacity.

#### Scenario: Unchanged capacity
- **WHEN** a worker starts again with the capacity it declared before
- **THEN** it journals no new declaration

#### Scenario: Declaration after a reclaim
- **WHEN** a worker's reclaim removes a hand-off record
- **THEN** it journals `worker.capacity.declared` with its unchanged capacity
