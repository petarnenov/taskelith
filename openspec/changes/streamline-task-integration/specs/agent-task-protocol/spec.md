## MODIFIED Requirements

### Requirement: Recorded agent task protocol
The repository SHALL keep a protocol for parallel agent sessions in `docs/agent-task-protocol.md`, linked from `AGENTS.md`, that defines the owner, coordinator, and worker roles, the worker steps from worktree to archive, handoff, cleanup, and conflict handling, the coordinator steps from assignment to integration and cleanup, and the read-only reviewer invocations, and that defers to the governance policy and the release flow where they differ.

#### Scenario: New session joins the work
- **WHEN** an agent session starts a Taskelith task
- **THEN** it can reach the protocol from `AGENTS.md` without another session's notes

#### Scenario: Conflict with governance
- **WHEN** the protocol and the governance policy or release flow differ
- **THEN** the governance policy or release flow applies

### Requirement: Worker handoff and coordinator integration
Under the protocol a worker SHALL archive its reviewed and verified change in the last commit of its branch, push the branch, and hand it to the coordinator without opening or merging a pull request; the coordinator SHALL integrate one branch at a time into `dev` through one pull request with a merge commit, return a branch that conflicts with `dev` or whose evidence the merge invalidates to its worker, and remove its worktrees and branches.

#### Scenario: Worker finishes a task
- **WHEN** a worker's change has passed `make verify` and its independent review
- **THEN** the worker archives the change in the last commit of its branch, pushes the branch, reports it to the coordinator, and stops

#### Scenario: Coordinator integrates
- **WHEN** the coordinator receives a reported branch that carries its archived change, merges cleanly with `dev`, and keeps its evidence valid
- **THEN** it merges the branch into `dev` through one pull request, opens no separate archive pull request, cleans up, and tells the worker to clean up and clear its context

#### Scenario: Branch conflicts with dev
- **WHEN** merging `dev` into a reported branch conflicts or invalidates its evidence
- **THEN** the coordinator returns the task to its worker, who resolves it, runs the checks again, and has the assigned reviewer review the resolved diff before handing off again

## ADDED Requirements

### Requirement: Re-archive after a spec conflict
When merging `dev` into a handed-off branch conflicts under `openspec/specs/` or `openspec/changes/archive/`, the coordinator SHALL return the task; the worker SHALL revert its archive commit, merge `dev`, resolve, check, and review as for any conflict, and archive the change again onto `dev`'s specs as the branch's last commit.

#### Scenario: Living spec changed on dev
- **WHEN** `dev` changed a living spec that the task's archive also changed, and the merge conflicts there
- **THEN** the worker restores the active change by reverting the archive commit, merges `dev`, and archives again before handing off

### Requirement: Integration gate in the archived record
A change's `verification.md` SHALL be complete before the change is archived and SHALL name integration into `dev` by the coordinator through one pull request as a remaining gate; the coordinator SHALL NOT edit the archived record at integration, and the merge pull request SHALL record the integrated revision.

#### Scenario: Coordinator merges an archived change
- **WHEN** the coordinator merges a branch whose archived `verification.md` names integration as its remaining gate
- **THEN** the record stays unchanged, and the pull request and its merge commit show the integrated revision
