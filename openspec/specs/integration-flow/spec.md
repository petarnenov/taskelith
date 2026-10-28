# integration-flow Specification

## Purpose
Define the repository checks once as `make verify`, gate every push locally with it, run it in GitHub only for promotion from `dev` to `main`, and release from `main`.

## Requirements

### Requirement: Single definition of the checks
The checks SHALL be defined once, as `make verify`, which SHALL run with the `.nvmrc` Node.js when nvm has it and the shell uses another, check Node against `.nvmrc` and npm against the CI pin, then run `make test` (full profile only), `make contract-compatibility`, `npm run verify:dependencies`, strict OpenSpec validation, `npm run verify:archive`, and `npm run verify:package`, in that order; the GitHub `verify` job SHALL run only `make verify`.

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

### Requirement: Promotion flow and releases
`dev` SHALL be the default branch for development; GitHub SHALL run the release workflow only for pull requests into `main`, pushes to `main`, and manual dispatch, and any other workflow, such as the Linux acceptance workflow, only on manual dispatch; promotions from `dev` to `main` SHALL use a merge commit or rebase, not a squash; and pushes to `main` SHALL keep releasing qualifying Conventional Commits.

#### Scenario: Push to dev
- **WHEN** a commit is pushed to `dev`
- **THEN** no workflow run starts

#### Scenario: Promotion merged
- **WHEN** a promotion pull request from `dev` is merged into `main` with a merge commit
- **THEN** `make verify` runs and the release job analyzes every promoted Conventional Commit

#### Scenario: Linux acceptance workflow
- **WHEN** a commit is pushed to `main` or a pull request into `main` is opened
- **THEN** the Linux acceptance workflow does not start; it starts only when someone dispatches it manually

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
Each change to Taskelith SHALL be developed on its own feature branch in its own git worktree and merged into `dev` through a pull request, so that several changes can proceed in parallel; the `make verify` pre-push gate SHALL apply in every worktree, to every push except one whose every ref is a deletion.

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

### Requirement: Record link check
`make verify` SHALL run `npm run verify:links` before the archive dry run. It SHALL fail on each inline or reference Markdown link under `openspec/changes/`, `openspec/specs/`, and `docs/`, outside code and HTML, without a URI scheme, whose target or GitHub heading anchor is missing, that enters an active change, or that is relative and leaves its change directory, capability directory, or the repository, or sits in a spec delta. Active changes SHALL be checked at their archived path.

#### Scenario: Link out of the change directory
- **WHEN** an active change's `design.md` links `../../../../docs/governance.md`, which resolves once the change is archived
- **THEN** `make verify` fails and prints the file, the line, the target, and that the link must be root-relative

#### Scenario: Link that archiving would break
- **WHEN** an active change links `../../../docs/governance.md`, which resolves only from the change's current directory
- **THEN** the check fails before the change is archived

#### Scenario: Root-relative link
- **WHEN** a record links `/docs/governance.md#independent-review-process` and that heading exists
- **THEN** the check passes

#### Scenario: Missing anchor
- **WHEN** a link names an anchor that no heading of its target produces, counting the `-1` suffix of a repeated heading
- **THEN** the check fails and names the missing anchor

#### Scenario: Link into an active change
- **WHEN** a document or an archived record links into an active change's directory
- **THEN** the check fails, because the target moves when that change is archived

#### Scenario: Code and external links
- **WHEN** a link is inside a code block, a code span, or raw HTML, or starts with a URI scheme such as `https:`, `mailto:`, or `tel:`
- **THEN** the check ignores it

#### Scenario: Archived record
- **WHEN** an archived record holds a link that fails any of these rules
- **THEN** the check fails on it; no list of accepted archived links exists

### Requirement: Verified-tree stamp
`make verify` SHALL write a stamp under the clone's common git directory, never tracked, when it passes on a tree that was clean when it started and is unchanged when it ends. The stamp key SHALL cover the HEAD tree, its merge base with `origin/dev`, the profile, the Node.js and npm versions, the lockfile hash, and the service images. A docs-only stamp SHALL NOT satisfy a full requirement, CI SHALL never reuse a stamp, and a dry run SHALL write none.

#### Scenario: Clean tree passes
- **WHEN** `make verify` passes on a clean tree that it leaves unchanged
- **THEN** it prints that it wrote a stamp of its profile for that tree

#### Scenario: Uncommitted changes
- **WHEN** `make verify` passes while the working tree has uncommitted or untracked changes
- **THEN** it writes no stamp

#### Scenario: Toolchain changed
- **WHEN** the npm version, the Node.js version, or the lockfile differs from a stamp's
- **THEN** that stamp does not satisfy a check of the same tree

#### Scenario: Same tree on another merge base
- **WHEN** HEAD has a stamped tree but another merge base with `origin/dev` than the stamped run
- **THEN** that stamp does not satisfy a check

#### Scenario: Docs-only stamp for a full requirement
- **WHEN** a tree has only a docs-only stamp and a full `make verify` is required, as at integration
- **THEN** the stamp does not satisfy it

### Requirement: Docs-only verify profile
`make verify` SHALL use the docs-only profile, which skips only `make test`, on a feature branch whose committed, staged, unstaged, and untracked changes since its merge base with `origin/dev` touch only `docs/**` except `docs/review-findings/**` and `docs/qualification/**`, `openspec/**`, or root-level Markdown other than `CHANGELOG.md`. `dev`, `main`, other branches, a detached HEAD, CI, an empty change, no merge base, and `TASKELITH_VERIFY_PROFILE=full` SHALL get the full profile.

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

### Requirement: Integration verify record
After its verify step passes, `make integrate` SHALL print `Integration: tree <tree>; verify <ran|reused stamp of <time>>; profile <profile>; verify seconds <n>; change <archived change directory>; branch <branch>; started <UTC time>`, add it after `BODY` to a pull request it opens or append it to the body of an open pull request it continues, and append it as one JSON line to `integrations.jsonl` in its state directory. A failed append SHALL only warn.

#### Scenario: Stamp reused
- **WHEN** the merged tree already has a full stamp
- **THEN** the line says `reused stamp of` the stamp's verification time, and the verify seconds count only the stamp check, since `make verify` does not run

#### Scenario: Verify ran
- **WHEN** the command runs `make verify` and it passes
- **THEN** the line says `verify ran`, the pull request body ends with the line after `BODY`, and the log gains one JSON object with the line's fields

#### Scenario: Resume continues an open pull request
- **WHEN** a resume continues the open pull request of the branch
- **THEN** the command appends the new line to that pull request's body, after its earlier text and lines, before it merges

#### Scenario: Log not writable
- **WHEN** the line cannot be appended to the log
- **THEN** the command warns and integrates as usual
