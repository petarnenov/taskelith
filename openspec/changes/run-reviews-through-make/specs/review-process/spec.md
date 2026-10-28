## ADDED Requirements

### Requirement: Review command
`make review` SHALL run one review pass of an active change with the authorized reviewer its canonical key names, using that reviewer's fixed command and flags in `scripts/reviewer-invocations.ts` and the effort of governance "Authorized reviewers", with the prompt and log outside the worktree. It SHALL write no `passes.jsonl` line; after a run that exits 0 and reports a valid session ID and the expected model, it SHALL print a line template whose counts fail validation until filled.

#### Scenario: Fixed flags
- **WHEN** a pass runs with the key `codex gpt-6.1-sol#medium`
- **THEN** the reviewer runs `codex exec` with `-s read-only`, `-C` the worktree, and the prompt on stdin

#### Scenario: Unknown key
- **WHEN** `REVIEWER` is no key of the table
- **THEN** `scripts/review-run.ts` lists the keys, exits 2, and runs no reviewer

#### Scenario: Failed attempt
- **WHEN** the reviewer exits non-zero, reports no session ID, or reports another model
- **THEN** `scripts/review-run.ts` exits 4 and writes no pass line

#### Scenario: Pass line template
- **WHEN** a pass runs to a report
- **THEN** `passes.jsonl` is unchanged, and the printed template has the pass, role, reviewer, and session and fails the pass schema until its count placeholders are filled

### Requirement: Review route gate
Before pass 1, when the change's `route.json` is missing or was made for another merge base or another tree outside the change directory, `make review` SHALL route the change only on a clean tree with a passing `make verify` stamp and then stop for the commit, and SHALL otherwise refuse without routing. Later passes SHALL NOT route.

#### Scenario: No stamp
- **WHEN** pass 1 starts with a missing or stale `route.json` and no stamp of the tree
- **THEN** `scripts/review-run.ts` exits 1, routes nothing, and runs no reviewer

#### Scenario: Stamped tree
- **WHEN** pass 1 starts with a missing `route.json` on a stamped clean tree
- **THEN** `scripts/review-run.ts` writes `route.json`, exits 3, and runs no reviewer

### Requirement: Reviewer environment
`make review` SHALL start the reviewer with no inherited environment except `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `TMPDIR`, and the variables that the reviewer's row declares, so that no secret reaches a reviewer.

#### Scenario: Planted secret
- **WHEN** the caller's environment holds `JEV_MAF_LAB` and another secret
- **THEN** neither the names nor the values reach the reviewer process
