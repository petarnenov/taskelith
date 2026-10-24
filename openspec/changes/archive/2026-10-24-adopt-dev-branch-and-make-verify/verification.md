# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

Owner request on 2026-10-24 with decisions already made: the checks are defined once as `make verify`, used as the local gate before every push and as the GitHub `verify` job; GitHub runs it only when `dev` is promoted to `main`; `dev` becomes the default branch; automatic releases from `main` stay. Owner authorization covers creating and pushing `dev` from the updated `main` and switching the default branch with `gh repo edit --default-branch dev` after this change is merged. Base revision: `57688bd`. Scope: `Makefile` and `.githooks/pre-push` (new); `.github/workflows/release.yml`; `docs/releases.md`, `AGENTS.md`, `README.md`, `docs/governance.md`. Branch protection is an owner gate and out of scope.

## Author self-check before review

- Requirements: every scope item is implemented once; the four check commands appear only in the `Makefile`.
- Beyond the request: `make verify` also checks the npm version against the workflow pin, because `npm run verify:dependencies` asserts it and would otherwise fail late; `docs/governance.md` was updated because its Verify stage described the old commands.
- Unchanged in the workflow: action SHAs, the npm 12.2.1 install, `npm ci --ignore-scripts`, permissions, concurrency, timeouts, and the release job. GNU Make is preinstalled on GitHub's Ubuntu runners.
- Evidence check: the new links are canonical links from the packaged `README.md` to this repository's own `main` branch, which the packaging rule requires; they are not external evidence. The check also flags four pre-existing unversioned source links in `docs/releases.md` ("Sources"), which this change does not touch; labeling them is left as a follow-up. Local link and anchor check passed.

## Checks

Local environment: macOS, Node v24.22.1 selected with `nvm use` (installed with nvm for this task; the nvm default stays 24.21.0), npm 12.2.1.

- `make verify` passed in 9 s: 19 tests passed, 0 failed; dependency inventory verified (487 paths); strict OpenSpec validation 14 passed, 0 failed; packed file allowlist and installed CLI verification passed. An earlier run, before this change's artifacts existed, failed at OpenSpec validation as expected.
- Mismatch: with Node v24.21.0, `make verify` failed in under 1 s, before any check, with `make verify: Node v24.21.0 does not match .nvmrc (v24.22.1). Run 'nvm use' first.`
- Hook: after `make hooks` (`core.hooksPath` = `.githooks`), an empty change directory was added to make OpenSpec validation fail. `git push --dry-run origin HEAD:refs/heads/hook-demo` ran the hook, which reported `Totals: 14 passed, 1 failed` and `make: *** [verify] Error 1`; git printed `failed to push some refs` and exited 1. The directory was removed afterwards, and no `hook-demo` branch exists on the remote.
- Workflow YAML: `actionlint` is not installed. The file was parsed with Ruby's YAML library: triggers are `pull_request` and `push` on `[main]` plus `workflow_dispatch`; the `verify` steps are the two pinned actions, the npm install, `npm ci --ignore-scripts`, and `make verify`; the release job keeps `needs: verify` and its `if`. With branch filters on both events, GitHub starts no run for pushes to `dev` or pull requests into `dev`.

## Independent review

Assigned reviewer (rotation): Antigravity CLI 1.4.7, `--model gemini-4-argon-medium --effort medium --mode plan`; the model was confirmed in the CLI log. SHA-256 snapshots of all tracked and untracked files before and after the pass were equal.

- **Pass 1 — conversation `63e1cf65-5e49-42be-adbb-2f1a84a10e01`.** Findings: 0 Critical, 0 High, 0 Medium, 0 Low. The reviewer judged the npm check in `toolchain` and the `docs/governance.md` edit justified elaborations, and noted that a manual dispatch on `dev` would run only `verify`, because the release job is guarded by `github.ref == 'refs/heads/main'`.

Remaining findings: 0.

## Rollout

- Pull request #14 into `main` (the last one through the old flow) ran `make verify` on GitHub's Ubuntu runner: the `verify` job passed in 25 s, and the release job was skipped for the pull request. It was merged with a rebase as `f0876b2`. The `main` run 40102142350 passed `verify` and `release`; semantic-release found no relevant changes, so no version was released.
- `dev` was created from `f0876b2` and pushed at 14:22 UTC; the pre-push hook ran `make verify`, which passed.
- The default branch was switched with `gh repo edit petarnenov/taskelith --default-branch dev`; `gh repo view --json defaultBranchRef` returned `{"defaultBranchRef":{"name":"dev"}}`.
- This archive was then integrated through a pull request into `dev`, as the test of the new flow. Its result (no workflow run for the pull request or the push to `dev`) is reported to the owner after the merge, because it cannot be recorded inside the commit it tests.

## Remaining gates

Owner gate: branch protection for `main` and optionally `dev`.
