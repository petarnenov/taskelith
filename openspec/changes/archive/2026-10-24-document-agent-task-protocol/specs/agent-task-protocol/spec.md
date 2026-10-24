## Purpose

Record the working protocol for parallel owner, coordinator, and worker agent sessions that develop Taskelith: roles, handoff, integration, archival, cleanup, and the read-only reviewer invocations.

## ADDED Requirements

### Requirement: Recorded agent task protocol
The repository SHALL keep a protocol for parallel agent sessions in `docs/agent-task-protocol.md`, linked from `AGENTS.md`, that defines the owner, coordinator, and worker roles, the worker steps from worktree to handoff, cleanup, and conflict handling, the coordinator steps from assignment to integration, archive, and cleanup, and the read-only reviewer invocations, and that defers to the governance policy and the release flow where they differ.

#### Scenario: New session joins the work
- **WHEN** an agent session starts a Taskelith task
- **THEN** it can reach the protocol from `AGENTS.md` without another session's notes

#### Scenario: Conflict with governance
- **WHEN** the protocol and the governance policy or release flow differ
- **THEN** the governance policy or release flow applies

### Requirement: Worker handoff and coordinator integration
Under the protocol a worker SHALL push its reviewed and verified branch and hand it to the coordinator without opening, merging, or archiving a pull request; the coordinator SHALL integrate one branch at a time into `dev` with a merge commit, return a branch that conflicts with `dev` or whose evidence the merge invalidates to its worker for resolution, verification, and review, archive the change through its own pull request, and remove its worktrees and branches.

#### Scenario: Worker finishes a task
- **WHEN** a worker's change has passed `make verify` and its independent review
- **THEN** the worker pushes the branch, reports it to the coordinator, and stops

#### Scenario: Coordinator integrates
- **WHEN** the coordinator receives a reported branch that merges cleanly with `dev` and keeps its evidence valid
- **THEN** it merges the branch into `dev`, archives the change, cleans up, and tells the worker to clean up and clear its context

#### Scenario: Branch conflicts with dev
- **WHEN** merging `dev` into a reported branch conflicts or invalidates its evidence
- **THEN** the coordinator returns the task to its worker, who resolves it, runs the checks again, and has the assigned reviewer review the resolved diff before handing off again
