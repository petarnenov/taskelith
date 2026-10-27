## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Uncommitted coordinator merge
**Reason**: `make integrate` commits the merge of `dev` on a local integration branch, so that a passing `make verify` can stamp the merged tree for the push; the guarantee moves to "Unpushed coordinator merge".
**Migration**: Integrate with `make integrate`, which pushes the merge only after the full `make verify` passed and leaves a failed merge in the local integration worktree.

## ADDED Requirements

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
