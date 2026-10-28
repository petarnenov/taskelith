## MODIFIED Requirements

### Requirement: Shared integration command
The repository SHALL provide `make integrate BRANCH=<change> TITLE=<title> BODY=<body>`, through `scripts/integrate.sh`, passing the arguments as typed under GNU Make 3.81 and 4.4, which integrates one archived branch: it checks the main clone, merges `origin/dev` in an integration worktree, requires a clean tree and a full stamp of the merged tree, running the full `make verify` when there is none, pushes, merges the pull request, cleans up, and prints `LANDED <branch> <url> <head>`.

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

#### Scenario: Arguments as typed under GNU Make 3.81 and 4.4
- **WHEN** `BRANCH`, `TITLE`, `BODY`, or `RESUME` contains `$(shell ...)`, `$$`, or backticks and the command runs under GNU Make 3.81 or 4.4
- **THEN** make runs none of it and the script receives every argument byte for byte

### Requirement: Generated verification record
`make record CHANGE=<change> LOG=<log>`, taking both as typed, SHALL write the mechanical part of CHANGE's `verification.md` between generated markers: the `make verify` result, tree, test counts, and coverage of the log's last complete run, the strict OpenSpec and findings validations, the spec diff stat, and the passes of `passes.jsonl`. `make record-check` SHALL fail when that part differs from reality or from the line `make record` stored with the stamp; a worker SHALL run it before pass 1.

#### Scenario: Record refreshed
- **WHEN** a worker runs `make record` after a passing `make verify`
- **THEN** only the text between the generated markers of `verification.md` changes

#### Scenario: Stale record
- **WHEN** the working tree differs from the recorded verified tree in any file other than the change's `verification.md`, `tasks.md`, `findings.jsonl`, or `passes.jsonl`, or a recomputed part differs
- **THEN** `make record-check` fails and names the stale part

#### Scenario: Edited result
- **WHEN** a recorded test count or coverage figure differs from what `make record` read from the log
- **THEN** `make record-check` fails

#### Scenario: Arguments as typed under GNU Make 3.81 and 4.4
- **WHEN** `CHANGE` or `LOG` contains `$(shell ...)`, `$$`, or backticks and `make record` or `make record-check` runs under GNU Make 3.81 or 4.4
- **THEN** make runs none of it and the script receives every argument byte for byte
