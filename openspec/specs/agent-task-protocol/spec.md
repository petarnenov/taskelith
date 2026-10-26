# agent-task-protocol Specification

## Purpose
Record the working protocol for parallel owner, coordinator, and worker agent sessions that develop Taskelith: roles, handoff, integration, archival, cleanup, and the read-only reviewer invocations.

## Requirements

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
- **THEN** the coordinator returns the task to its worker, who restores the active change, merges `dev`, reconciles its deltas, runs the checks again, has the assigned reviewer review the resolved diff, and archives again before handing off again

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

### Requirement: Return and re-archive
On any return of a branch that carries its archive commit, the worker SHALL restore the active change by reverting that commit, merge `dev`, reconcile each restored delta with `dev`'s current requirement text, keeping others' edits, have the assigned reviewer review the resolved diff and the reconciliation, record it, and archive again as the last commit; a branch without an archive commit only needs the archive.

#### Scenario: Requirement changed on dev
- **WHEN** `dev` changed a requirement that a restored delta modifies
- **THEN** the worker rewrites the delta from `dev`'s current text, and the re-archived specs differ from `dev` only by the task's own edits

#### Scenario: Conflict outside the specs
- **WHEN** a task is returned for a conflict outside `openspec/`
- **THEN** the worker still restores the active change and ends the branch with a new archive commit

#### Scenario: Branch without an archive commit
- **WHEN** a task is returned because its branch lacks its archive commit
- **THEN** the worker archives the change as the branch's last commit and reverts nothing

### Requirement: Uncommitted coordinator merge
The coordinator SHALL merge `dev` into a handed-off branch with `git merge --no-commit --no-ff origin/dev`, SHALL commit the merge only when it will integrate, and SHALL run `git merge --abort` on any return, so that a returned branch never carries a coordinator merge.

#### Scenario: Clean merge that invalidates evidence
- **WHEN** the merge of `dev` completes without a conflict but invalidates the task's evidence
- **THEN** the coordinator aborts the uncommitted merge and returns the task, and the worker's merge base still predates `dev`'s changes

### Requirement: Integration gate in the archived record
A change's `verification.md` SHALL name integration into `dev` by the coordinator through one pull request as a remaining gate; the worker SHALL record the checks of the archived tree in the archive commit itself; the coordinator SHALL NOT edit the archived record, and the merge pull request SHALL record the integration checks, its merge commit being the integrated revision.

#### Scenario: Checks of the archived tree
- **WHEN** the worker archives the change and runs the checks on the resulting working tree
- **THEN** it writes their results into the moved `verification.md` before it commits the archive

#### Scenario: Coordinator merges an archived change
- **WHEN** the coordinator merges a branch whose archived `verification.md` names integration as its remaining gate
- **THEN** the record stays unchanged, and the pull request records the integration checks
