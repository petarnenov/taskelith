## Context

`make verify` is the single definition of the checks, and GitHub runs it for pull requests into `main` and pushes to `main`; the release job depends on it. Without protection, a direct push could still put unchecked changes on `main`, even though a failing check would stop the release. The release sources were unversioned links.

## Goals / Non-Goals

Apply the owner-authorized settings and record them; make the release sources verifiable. Not in scope: required reviews, rulesets, or a check that pull requests into `main` come from `dev`.

## Decisions

- Classic branch protection: `main` requires a pull request (0 approvals, because the owner is the only maintainer) and the `verify` status check with up-to-date branches, includes administrators, and blocks force pushes and deletion. `dev` blocks force pushes and deletion only, so feature pull requests merge without CI.
- Squash merging is disabled repository-wide, which enforces the "never squash" promotion rule.
- Pin sources where a versioned copy exists (npm documentation repository commit, npm CLI tag); label the GitHub changelog post and the semantic-release site as unversioned pages.

## Risks / Trade-offs

With `strict` up-to-date checks, every promotion leaves `dev` behind `main` and requires a synchronization step: after a merge-commit promotion `dev` fast-forwards to `main`; after a rebase promotion the rewritten commits make the histories diverge, so `main` must be merged into `dev`. Merge-commit promotions are simpler; the owner's flow still allows both, so this is documented and reported rather than changed. The release job pushes only tags, which branch protection does not block.
