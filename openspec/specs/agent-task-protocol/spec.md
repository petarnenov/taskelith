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
- **THEN** it merges the branch into `dev` through one pull request, opens no separate archive pull request, cleans up, and tells the worker to clean up

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

### Requirement: Integration gate in the archived record
A change's `verification.md` SHALL name integration into `dev` by the coordinator through one pull request as a remaining gate; the worker SHALL record the checks of the archived tree in the archive commit itself; the coordinator SHALL NOT edit the archived record, and the merge pull request SHALL record the integration checks, its merge commit being the integrated revision.

#### Scenario: Checks of the archived tree
- **WHEN** the worker archives the change and runs the checks on the resulting working tree
- **THEN** it writes their results into the moved `verification.md` before it commits the archive

#### Scenario: Coordinator merges an archived change
- **WHEN** the coordinator merges a branch whose archived `verification.md` names integration as its remaining gate
- **THEN** the record stays unchanged, and the pull request records the integration checks

### Requirement: Named fleet roles
The repository SHALL keep a fleet roster in `docs/fleet.md`, linked from the protocol, that names each session, its role, and its machine, with exactly one coordinator, and the owner's procedure to change the coordinator with a handover note; the `taskelith-coordinator` and `taskelith-worker` skills SHALL take a name, check it against the roster, and announce it.

#### Scenario: Session starts as a named worker
- **WHEN** the owner runs `/taskelith-worker <Name>` and the roster lists `<Name>` as a worker
- **THEN** the session sends `<Name> ready` to the roster's coordinator and waits for a brief

#### Scenario: Name conflicts with the roster
- **WHEN** the owner runs `/taskelith-coordinator <Name>` and the roster names another coordinator
- **THEN** the session stops and asks the owner

#### Scenario: Coordinator changes
- **WHEN** the owner names a new coordinator in the roster
- **THEN** the outgoing coordinator finishes running integrations and writes a handover note, and the new coordinator reads it and broadcasts its name to every worker

### Requirement: Review findings in the task flow
A worker SHALL create an empty `findings.jsonl` and `passes.jsonl` with its change, append a summary of every review pass that runs to a report and each of its findings, and at the archive check that both files exist and validate. Failed review attempts SHALL add no lines. The coordinator SHALL include in every brief the checklist that `make findings ARGS="checklist"` prints for the task's capabilities and files.

#### Scenario: Pass with findings
- **WHEN** a review pass reports findings
- **THEN** the worker appends one line per finding to `findings.jsonl` with its outcome once the pass's findings are resolved

#### Scenario: Pass summary
- **WHEN** a review pass runs to a report, with or without findings
- **THEN** the worker appends one summary line for it to `passes.jsonl`

#### Scenario: Review without findings
- **WHEN** a change is archived after a review that found nothing
- **THEN** its archived `findings.jsonl` exists and is empty

#### Scenario: Failed review attempt
- **WHEN** a review attempt does not run to a report
- **THEN** no line is added to `findings.jsonl` or `passes.jsonl`

#### Scenario: Brief for a new task
- **WHEN** the coordinator assigns a task
- **THEN** the brief contains the checklist printed for the capabilities and files the task is expected to touch

### Requirement: Record link rule
A change's records SHALL link to another repository file only inside the change directory or root-relative, a spec delta only root-relative, and never into an active change, because archiving moves the change directory and copies a delta's text into `openspec/specs/`. Worker step 6 of the protocol SHALL state the rule.

#### Scenario: Link to a document
- **WHEN** a change's `verification.md` links `docs/governance.md`
- **THEN** it writes `/docs/governance.md`, not a path with `../`

#### Scenario: Link to the change's own file
- **WHEN** a change's `design.md` links the same change's `proposal.md` or `specs/<capability>/spec.md`
- **THEN** it writes that path relative to the change directory

#### Scenario: Link from a spec delta
- **WHEN** a spec delta links a document
- **THEN** it writes a root-relative link

### Requirement: Checklist record in the task flow
A worker SHALL save the checklist of its brief as the change's `checklist.json` when it creates the change, before the first review pass, by running the brief's exact `make findings ARGS="checklist ..."` invocation with `--save <change> --at <commit>`, the dev commit the brief names, and, when the brief gives a size, `--size`. It SHALL NOT edit the file afterwards, and the archive SHALL keep it.

#### Scenario: Plan time
- **WHEN** a worker creates the OpenSpec change of a task whose brief holds a checklist
- **THEN** it runs the brief's checklist invocation with `--save <change> --at <commit>` and commits the resulting `checklist.json`

#### Scenario: Archive
- **WHEN** the worker archives the change
- **THEN** the archived change directory holds the unchanged `checklist.json`

### Requirement: Checklist in the brief
The coordinator SHALL give in every brief the output of `make findings ARGS="checklist ..."` for the task's capabilities and files, the exact invocation, the dev commit that the output names, and the task's size (S, S-M, M, M-L, or L), so that the worker can save the same checklist with `--at`.

#### Scenario: Brief with a checklist
- **WHEN** the coordinator assigns a task
- **THEN** the brief holds the checklist output with its dev commit line, the invocation, and the size

### Requirement: Unpushed coordinator merge
The coordinator SHALL merge `dev` into a handed-off branch only on a local integration branch in its own worktree, SHALL push the merge only when it will integrate, and on any return SHALL discard the local integration branch and worktree, so that a returned branch never carries a coordinator merge.

#### Scenario: Clean merge that invalidates evidence
- **WHEN** the merge of `dev` completes without a conflict but invalidates the task's evidence
- **THEN** the coordinator discards the local merge and returns the task, and the worker's merge base still predates `dev`'s changes

#### Scenario: Failing verification after the merge
- **WHEN** the full `make verify` of the merged tree fails
- **THEN** nothing is pushed, and the merge stays only in the local integration worktree

### Requirement: Shared integration command
The repository SHALL provide `make integrate BRANCH=<change> TITLE=<title> BODY=<body>`, through `scripts/integrate.sh`, passing the arguments as typed, which integrates one archived branch: it checks the main clone, merges `origin/dev` in an integration worktree, requires a clean tree and a full stamp of the merged tree, running the full `make verify` when there is none, pushes, merges the pull request, cleans up, and prints `LANDED <branch> <url> <head>`.

#### Scenario: Clean integration
- **WHEN** the coordinator runs `make integrate` for an archived branch that merges cleanly and passes
- **THEN** the pull request is merged into `dev`, the integration worktree, local branch, and remote branch are removed, and the last line starts with `LANDED`

#### Scenario: Conflict
- **WHEN** merging `origin/dev` conflicts
- **THEN** the command aborts the merge, prints `CONFLICT <branch>`, pushes nothing, and exits with status 3

#### Scenario: Merged tree already verified
- **WHEN** the merged tree already has a full stamp
- **THEN** the command does not run `make verify` again

#### Scenario: Resume after the pull request was created
- **WHEN** a resumed integration finds the branch's pull request open, or merged at the pushed commit
- **THEN** it merges that pull request, or only cleans up, and opens no second one

#### Scenario: Branch already in dev
- **WHEN** a run or a resume finds the integration HEAD already in `origin/dev`, because an earlier attempt's pull request was merged with a merge commit
- **THEN** it skips the merge, `make verify`, the push, and the pull request, only cleans up, and opens no second pull request

#### Scenario: Interrupted verify
- **WHEN** the command receives `INT`, `TERM`, or `HUP` while `make verify` runs
- **THEN** it stops the whole `make verify` process group, waits until it is gone, prints `INTERRUPTED <branch>`, and exits with 128 plus the signal number

#### Scenario: Main clone not ready
- **WHEN** the main clone is not on a clean `dev` that `origin/dev` fast-forwards
- **THEN** the command exits with status 8 before it changes anything on the remote

### Requirement: Generated verification record
`make record CHANGE=<change> LOG=<log>` SHALL write the mechanical part of the change's `verification.md` between generated markers: the `make verify` result, tree, test counts, and coverage of the log's last complete run, the strict OpenSpec and findings validations, the spec diff stat, and the passes of `passes.jsonl`. `make record-check` SHALL fail when that part differs from reality or from the line `make record` stored with the stamp; a worker SHALL run it before pass 1.

#### Scenario: Record refreshed
- **WHEN** a worker runs `make record` after a passing `make verify`
- **THEN** only the text between the generated markers of `verification.md` changes

#### Scenario: Stale record
- **WHEN** the working tree differs from the recorded verified tree in any file other than the change's `verification.md`, `tasks.md`, `findings.jsonl`, or `passes.jsonl`, or a recomputed part differs
- **THEN** `make record-check` fails and names the stale part

#### Scenario: Edited result
- **WHEN** a recorded test count or coverage figure differs from what `make record` read from the log
- **THEN** `make record-check` fails

### Requirement: Thin session context
A coordinator SHALL offload polling to background scripts or notifications and keep briefs in files; a worker SHALL do task work in subagents and keep its session across tasks, with no owner `/clear` after each integration. The tracked `.claude/settings.json` SHALL run a hook that warns, without blocking and without printing transcript content, when the estimated context nears 150,000 tokens.

#### Scenario: Worker after integration
- **WHEN** the coordinator reports that a worker's task is merged
- **THEN** the worker cleans up and takes the next brief in the same session

#### Scenario: Context nears the limit
- **WHEN** a prompt is submitted in a session whose last recorded context is at least 140,000 tokens
- **THEN** the hook prints one warning line with the estimate and the protocol section, and the prompt proceeds

### Requirement: Fresh subagents for fix rounds
A session SHALL NOT resume a subagent that has been idle for more than five minutes; for a round of review fixes it SHALL start a fresh subagent with a short brief that names the findings, the files, and the checks to run.

#### Scenario: Fix round after a review pass
- **WHEN** a review pass reports findings and the implementation subagent has been idle for more than five minutes
- **THEN** the session briefs a new subagent with those findings instead of resuming the old one

### Requirement: Deterministic test authoring
Tests SHALL synchronize through injected clocks, barriers, or events rather than sleeps, SHALL give any timing bound at least six times the stubbed work it bounds, and SHALL NOT rely on scheduling luck; a review finding against this rule SHALL use the category `test-flakiness`.

#### Scenario: Waiting for a concurrent step
- **WHEN** a test needs a concurrent operation to reach a point
- **THEN** it waits on a barrier or event the operation signals, not on a fixed sleep

#### Scenario: Timing bound
- **WHEN** a test asserts that stubbed work of 100 ms finishes within a bound
- **THEN** the bound is at least 600 ms
