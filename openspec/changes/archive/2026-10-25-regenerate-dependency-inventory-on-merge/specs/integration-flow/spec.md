## MODIFIED Requirements

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
