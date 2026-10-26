# agent-task-protocol Specification

## Purpose
Record the working protocol for parallel owner, coordinator, and worker agent sessions that develop Taskelith: roles, handoff, integration, archival, cleanup, and the read-only reviewer invocations.

## Requirements

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

### Requirement: Context size warning
Under the protocol, a coordinator or worker session whose context approaches 150,000 tokens SHALL tell the owner and recommend `/compact` or `/clear`, after recording what a reset would lose; a worker SHALL also tell the coordinator, and SHALL NOT recommend `/clear` in the middle of a task.

#### Scenario: Session nears the limit
- **WHEN** a session's context approaches 150,000 tokens
- **THEN** it records its state, tells the owner, and recommends `/compact` or `/clear`

#### Scenario: Worker in the middle of a task
- **WHEN** a worker nears the limit before its handoff
- **THEN** it recommends `/compact`, not `/clear`, and tells the coordinator

### Requirement: Subagent task execution
For a task assigned from 2026-10-26 on, the developing session SHALL delegate its worktree work to a subagent it briefs and SHALL check the result before review and handoff; the session SHALL keep messages, owner questions, the independent review, and the handoff itself; the subagent MAY record review results the session provides.

#### Scenario: New task
- **WHEN** a worker receives a task assigned on or after 2026-10-26
- **THEN** a subagent does the worktree work and the worker checks it before review

#### Scenario: Protocol steps
- **WHEN** the subagent's work is ready
- **THEN** the worker, not the subagent, runs the review and hands off to the coordinator
