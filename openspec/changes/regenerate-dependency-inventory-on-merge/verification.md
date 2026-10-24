# Verification: regenerate-dependency-inventory-on-merge

## Scope and source

The coordinator's brief of 2026-10-25, with the owner's approval: parallel branches conflict in the generated `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`, which three times sent a branch back for a hand resolution; make these conflicts resolve themselves, deterministically and without hiding a real dependency change, and document the flow. Base revision: `d113b6a` on `dev`. Scope: `.gitattributes`, `.githooks/`, `Makefile`, `scripts/` (inventory provenance, hook checks, environment checks), their tests, the inventory guide, the agent task protocol, the release flow, the README, and the spec deltas for `dependency-inventory`, `development-environment`, and `integration-flow`. Prepared in a git worktree.

## Self-check

- A test merges two branches that both changed both inventory files through the repository's `.gitattributes` and the configured driver; the merge succeeds and keeps the current side. With the driver configuration removed, the same test fails on the conflict.
- With a changed `package.json`, both the `post-merge` hook and `npm run verify:dependencies` reported the stale inventory with the changed input and `make dependency-inventory`. The hook was also run from a shell on Node.js v20.13.1 and selected the pinned Node.js through nvm.
- The hook scripts are tested from a copy without `node_modules`, and the pre-push checks are tested for uncommitted inventory changes, unrelated changes, another pushed ref, and a deletion.
- Every comment that the change adds is at most two lines of at most 80 characters.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree, with Docker: `make verify` passed at `175d0d9`, `125f568`, and `f09841c` and before this record was committed, with coverage above the 75% thresholds; `npm run openspec -- validate regenerate-dependency-inventory-on-merge --strict` passed. The regenerated inventory is committed, because the generator's provenance now includes `scripts/inventory-provenance.ts`.

## Independent review

Assigned reviewer (rotation): Codex CLI with `gpt-6.1-sol`, reasoning effort medium, sandbox `read-only`, all confirmed in each output header. SHA-256 snapshots of the worktree before and after each pass were equal.

- **Pass 1 at `175d0d9` — session `01a16ff0-5795-72f3-8f1b-b9eee5b815de`.** Findings: 0 Critical, 1 High, 1 Medium, 0 Low.
  1. High: `make verify` checks the working tree, so a regenerated but uncommitted inventory let the pre-push gate pass while the stale commit was pushed, and no CI job verifies pull requests into `dev`. Added a `pre-push` check that refuses uncommitted changes to the inventory files and their inputs, with tests.
  2. Medium: the hook check imported `typescript` through `dependency-inventory.ts` and failed without `node_modules`. Moved the provenance helpers to `scripts/inventory-provenance.ts`, which uses only Node.js built-ins, and tested the hook scripts from a copy without `node_modules`.
- **Pass 2 at `125f568` — session `01a16ff3-b411-7771-b452-05c8b80ee875`.** Confirmed the Medium fix and the specific High scenario. Findings: 0 Critical, 1 High, 1 Medium, 0 Low.
  1. High: the pre-push check examined only the checkout, so `git push origin <other-branch>` could send an unverified stale inventory. The hook now reads git's ref updates and refuses any non-deletion update to a commit other than `HEAD`, with unit and git-based tests and a spec delta for `integration-flow`.
  2. Medium: the hooks ran the shell's Node.js instead of the pinned one. Both hooks now run through `scripts/with-pinned-node.sh use`.
- **Pass 3 at `f09841c` — session `01a16ff6-51f8-7992-80b0-a3023a1c870b`.** Confirmed both resolutions and found no new problem: 0 Critical, 0 High, 0 Medium, 0 Low.

## Incident after pass 3 and its fix (unreviewed)

The first push of `d135225` ran the new git fixture tests inside the `pre-push` hook. Git exports `GIT_DIR` there, so the fixtures' git commands acted on this repository instead of their temporary ones. They set `core.bare=true` in the shared `.git/config`, moved the local `dev` to a fixture commit, created the local branches `feature` and `other`, switched this worktree to `feature`, and committed `61eb2f9`, which deletes almost every file, onto this branch, which the push then sent. Nothing was merged; the coordinator was told to hold integration.

Repair, approved by the owner without a force push: `core.bare` was set back to `false`, the local `dev` was restored to `d113b6a` from its reflog, the worktree was switched back to this branch, and `5c1b21b` reverts `61eb2f9`; `git diff d135225 5c1b21b` is empty. Deleting the stray local branches `feature` and `other` was not permitted in this session and is left to the owner.

Fix: the fixture tests now run git and the hook scripts with every `GIT_*` variable removed from their environment, in their own temporary repositories. `test/inventory-merge-isolation.test.ts` runs them with `GIT_DIR` and `GIT_WORK_TREE` naming a sentinel repository and asserts that its refs and configuration are unchanged; without the fix, the same run moved the sentinel's `dev` and failed three tests. After the fix, `make verify` passed, and the push ran it again from the `pre-push` hook, with the repository's refs and `core.bare` unchanged afterwards. This fix came after the third pass and is unreviewed; a further pass needs the owner's permission.

## Limitations

- No automated test runs the hooks under a non-pinned shell Node.js; this was checked by hand, as recorded above.
- GitHub's server-side merge ignores custom merge drivers, so the flow depends on merging `origin/dev` locally, as the protocol describes.
- The pre-push gate now refuses pushing a ref other than the checked-out commit, which also applies to tag pushes of other commits.

## Remaining gates

Merge into `dev` and archive by the coordinator.
