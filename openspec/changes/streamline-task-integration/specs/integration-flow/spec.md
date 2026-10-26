## MODIFIED Requirements

### Requirement: Local gate before push
`make hooks` SHALL set `core.hooksPath` to `.githooks`, and the `.githooks/pre-push` hook SHALL run `make verify` and block the push when it fails, except a push whose every ref is a deletion, which it SHALL let through without `make verify`. Because `make verify` checks the working tree, the hook SHALL first refuse a push that updates a ref to a commit other than the checked-out one, except a deletion.

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
- **WHEN** the hook receives no ref on its standard input
- **THEN** it runs `make verify`

#### Scenario: Another branch pushed
- **WHEN** a push from a worktree updates a branch other than the checked-out commit
- **THEN** the hook refuses it and names the ref to check out and push separately
