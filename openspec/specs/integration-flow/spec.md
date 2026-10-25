# integration-flow Specification

## Purpose
Define the repository checks once as `make verify`, gate every push locally with it, run it in GitHub only for promotion from `dev` to `main`, and release from `main`.

## Requirements

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
- **WHEN** `make verify` reaches the tests
- **THEN** it runs `make test`, which runs `npm test` against integration services of its own and removes them afterwards

### Requirement: Local gate before push
`make hooks` SHALL set `core.hooksPath` to `.githooks`, and the `.githooks/pre-push` hook SHALL run `make verify` and block the push when it fails. Because `make verify` checks the working tree, the hook SHALL first refuse a push that updates a ref to a commit other than the checked-out one, except a deletion.

#### Scenario: Failing check
- **WHEN** a push is attempted with hooks enabled and a check fails
- **THEN** the push is rejected

#### Scenario: Branch deletion push
- **WHEN** a remote branch is deleted with `git push origin --delete <branch>` with hooks enabled, a Node version that differs from `.nvmrc`, and no `.nvmrc` version available through nvm
- **THEN** the `pre-push` hook runs `make verify`, its toolchain check fails, and the deletion is refused

#### Scenario: Another branch pushed
- **WHEN** a push from a worktree updates a branch other than the checked-out commit
- **THEN** the hook refuses it and names the ref to check out and push separately

### Requirement: Promotion flow and releases
`dev` SHALL be the default branch for development; GitHub SHALL run the workflow only for pull requests into `main`, pushes to `main`, and manual dispatch; promotions from `dev` to `main` SHALL use a merge commit or rebase, not a squash; and pushes to `main` SHALL keep releasing qualifying Conventional Commits.

#### Scenario: Push to dev
- **WHEN** a commit is pushed to `dev`
- **THEN** no workflow run starts

#### Scenario: Promotion merged
- **WHEN** a promotion pull request from `dev` is merged into `main` with a merge commit
- **THEN** `make verify` runs and the release job analyzes every promoted Conventional Commit

### Requirement: Protected promotion branches
The `main` branch SHALL accept changes only through a pull request whose `verify` check passed on an up-to-date branch, with administrators included and force pushes and deletion blocked; the `dev` branch SHALL block force pushes and deletion; and squash merging SHALL be disabled for the repository.

#### Scenario: Direct push to main
- **WHEN** anyone, including an administrator, pushes a commit directly to `main`
- **THEN** GitHub rejects the push

#### Scenario: Promotion without a passing check
- **WHEN** a pull request into `main` has a failing or missing `verify` check
- **THEN** it cannot be merged

#### Scenario: Squash merge attempted
- **WHEN** a pull request is merged
- **THEN** only a merge commit or a rebase merge is offered

### Requirement: Parallel development in worktrees
Each change to Taskelith SHALL be developed on its own feature branch in its own git worktree and merged into `dev` through a pull request, so that several changes can proceed in parallel; the `make verify` pre-push gate SHALL apply in every worktree.

#### Scenario: Two changes at once
- **WHEN** two changes are in progress
- **THEN** `git worktree list` shows a separate worktree on its own branch for each change

#### Scenario: Push from a worktree
- **WHEN** a branch is pushed from a worktree after `make hooks` was run once in the repository
- **THEN** the `pre-push` hook runs `make verify` in that worktree

### Requirement: Archive dry run
`npm run verify:archive` SHALL copy `openspec/` to a temporary directory, archive every active change there in name order with the pinned OpenSpec CLI, its telemetry and update check off, and then run `validate --all --strict` on the copy, failing with the change name and the validator's message. It SHALL pass when no change is active, SHALL not change the repository, and SHALL remove the copy unless the check is killed with SIGKILL.

#### Scenario: New capability without a Purpose
- **WHEN** an active change creates a capability whose delta has no `## Purpose`
- **THEN** `make verify` fails and names the change, the capability (nested ones by their path), and the placeholder Purpose issue

#### Scenario: Requirement too long once applied
- **WHEN** an active change's delta makes a main spec fail strict validation once archived
- **THEN** `make verify` fails and names the change and the validator's message

#### Scenario: No active change
- **WHEN** `openspec/changes/` holds only `archive/`
- **THEN** the check passes without archiving anything

#### Scenario: Repository unchanged
- **WHEN** the check finishes, passing or failing, also when `openspec/` holds symbolic links
- **THEN** the repository's files are unchanged and the temporary copy is removed

#### Scenario: Interrupted check
- **WHEN** the check receives SIGINT or SIGTERM
- **THEN** it stops the OpenSpec CLI, waits for it to exit, removes the temporary copy, and exits nonzero
