## MODIFIED Requirements

### Requirement: Single definition of the checks
The checks SHALL be defined once, as `make verify`, which SHALL run with the `.nvmrc` Node.js when nvm has it and the shell uses another, check Node against `.nvmrc` and npm against the CI pin, then run `make test`, `make contract-compatibility`, `npm run verify:dependencies`, strict OpenSpec validation, `npm run verify:archive`, and `npm run verify:package`, in that order; the GitHub `verify` job SHALL run only `make verify`.

#### Scenario: Shell on another Node version
- **WHEN** `make verify` runs from a shell on another Node version and nvm has the `.nvmrc` version installed
- **THEN** it runs every check with the `.nvmrc` version and its npm

#### Scenario: Mismatched Node version
- **WHEN** `make verify` runs with a Node version that differs from `.nvmrc`, or with no Node.js, and nvm is missing or does not have that version
- **THEN** its toolchain check fails before running any other check and names the expected version, `make setup` with nvm, and a manual install without it

#### Scenario: CI verify job
- **WHEN** the GitHub `verify` job runs
- **THEN** its only check step is `make verify`

#### Scenario: Tests run through make test
- **WHEN** `make verify` of the full profile reaches the tests
- **THEN** it runs `make test`, which runs `npm test` against integration services of its own and removes them afterwards

### Requirement: Local gate before push
`make hooks` SHALL set `core.hooksPath` to `.githooks`, and the `.githooks/pre-push` hook SHALL run `make verify` and block the push when it fails, except a push whose every ref is a deletion, or whose clean HEAD tree has a stamp of its profile, which it SHALL let through without `make verify`. Because `make verify` checks the working tree, the hook SHALL first refuse a push that updates a ref to a commit other than the checked-out one, except a deletion.

#### Scenario: Failing check
- **WHEN** a push is attempted with hooks enabled and a check fails
- **THEN** the push is rejected

#### Scenario: Branch deletion push
- **WHEN** a remote branch is deleted with `git push origin --delete <branch>` with hooks enabled
- **THEN** the `pre-push` hook says that the push only deletes refs, skips `make verify`, and lets the deletion through

#### Scenario: Deletion pushed with an update
- **WHEN** one push deletes a remote branch and updates the checked-out branch
- **THEN** the hook runs `make verify` and blocks the push when it fails

#### Scenario: Hook input without refs
- **WHEN** the hook receives no ref on its standard input and HEAD's tree has no stamp
- **THEN** it runs `make verify`

#### Scenario: Another branch pushed
- **WHEN** a push from a worktree updates a branch other than the checked-out commit
- **THEN** the hook refuses it and names the ref to check out and push separately

#### Scenario: Stamped tree
- **WHEN** a push updates the checked-out branch, the working tree is clean, and HEAD's tree has a stamp of a passing full `make verify`
- **THEN** the hook names the stamp, skips `make verify`, and lets the push through

#### Scenario: Stamped tree with uncommitted changes
- **WHEN** HEAD's tree has a stamp but the working tree has uncommitted or untracked changes
- **THEN** the hook runs `make verify`

## ADDED Requirements

### Requirement: Verified-tree stamp
`make verify` SHALL write a stamp under the clone's common git directory, never tracked, when it passes on a tree that was clean when it started and is unchanged when it ends. The stamp key SHALL cover the HEAD tree, the profile, the Node.js and npm versions, the lockfile hash, and the integration service images. A docs-only stamp SHALL NOT satisfy a full requirement, CI SHALL never reuse a stamp, and a dry run SHALL write none.

#### Scenario: Clean tree passes
- **WHEN** `make verify` passes on a clean tree that it leaves unchanged
- **THEN** it prints that it wrote a stamp of its profile for that tree

#### Scenario: Uncommitted changes
- **WHEN** `make verify` passes while the working tree has uncommitted or untracked changes
- **THEN** it writes no stamp

#### Scenario: Toolchain changed
- **WHEN** the npm version, the Node.js version, or the lockfile differs from a stamp's
- **THEN** that stamp does not satisfy a check of the same tree

#### Scenario: Docs-only stamp for a full requirement
- **WHEN** a tree has only a docs-only stamp and a full `make verify` is required, as at integration
- **THEN** the stamp does not satisfy it

### Requirement: Docs-only verify profile
`make verify` SHALL use the docs-only profile, which skips only `make test`, on a feature branch whose committed, staged, unstaged, and untracked changes since its merge base with `origin/dev` touch only `docs/**` except `docs/review-findings/**` and `docs/qualification/**`, `openspec/**`, or root-level Markdown other than `CHANGELOG.md`. Every other branch, `dev`, `main`, CI, an empty change, a missing merge base, and `TASKELITH_VERIFY_PROFILE=full` SHALL get the full profile.

#### Scenario: Documentation branch
- **WHEN** a feature branch changes only `docs/governance.md` and its OpenSpec change
- **THEN** `make verify` prints the docs-only profile, skips `make test`, and runs every other check

#### Scenario: Script changed
- **WHEN** the branch also changes a file under `scripts/` or `.claude/`
- **THEN** `make verify` runs the full profile and names that file

#### Scenario: Tested documentation changed
- **WHEN** the branch also changes a file under `docs/review-findings/` or `docs/qualification/`
- **THEN** `make verify` runs the full profile, because tests read those files

#### Scenario: Integration
- **WHEN** the coordinator integrates a documentation branch
- **THEN** `make verify` runs the full profile, because integration sets `TASKELITH_VERIFY_PROFILE=full`
