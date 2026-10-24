## Context

`release.yml` ran four check steps on every pull request and on pushes to `main`, then released from `main`. `verify:dependencies` asserts the exact `.nvmrc` Node version and the npm version pinned in the workflow, so a local run with another toolchain failed late with an assertion.

## Goals / Non-Goals

One definition of the checks, a fast local gate, CI only on promotion, and unchanged releases. Not in scope: branch protection, new dependencies (no hook managers), version changes, or manual publishing.

## Decisions

- `make verify` depends on a `toolchain` target that compares `node -v` with `.nvmrc` and `npm -v` with the npm pin read from the workflow, failing with an actionable message before any check runs. The npm check is included because `verify:dependencies` asserts it too; reading the pin from the workflow keeps a single source.
- Hooks are opt-in through `make hooks` (`core.hooksPath`), because CI installs with `--ignore-scripts` and the owner excluded hook-manager dependencies.
- The workflow triggers on `pull_request` and `push` for `main` only, plus `workflow_dispatch`; GitHub runs no workflow for `dev`. Pinned action SHAs, the npm install, `npm ci --ignore-scripts`, permissions, concurrency, timeouts, and the release job are unchanged.
- Promotions use merge or rebase, not squash, so semantic-release sees every Conventional Commit.
- Rollout: this change merges into `main` through the current flow; `dev` is created only afterwards, so it never exists with the old workflow.

## Risks / Trade-offs

Without branch protection, a direct push to `main` or `dev` can bypass the gate; the owner holds that decision. The pre-push hook only runs where `make hooks` was run, and `git push --no-verify` skips it. Changes reach GitHub CI only at promotion, so a broken `dev` is caught later than before.
