# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's request on 2026-10-24, relayed by the session coordinating G0 closure: document two worktree pitfalls observed that day. Base revision: `1d7be7a` on `dev`. Scope: the "Parallel work with worktrees" section of `docs/releases.md` and this change, including a modified `integration-flow` requirement. Documentation only.

## Author self-check before review

- Both pitfalls match the observations as reported. The deletion-push behaviour also follows from the repository: `.githooks/pre-push` is `exec make verify` and does not inspect the pushed refs, and `make verify` starts with the toolchain check.
- The `gh` behaviour is documented as guidance only; the specification states only the hook behaviour.
- The modified requirement repeats the full requirement text and its existing scenario unchanged and adds one scenario.
- Work was done in its own worktree, `/Users/petarnenov/taskelith-worktrees/document-worktree-pitfalls`, created from `origin/dev` with the documented commands. No file owned by the parallel `close-g0-foundation` change was touched.
- Evidence check: the change adds no external link.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (19 tests passed, dependency inventory verified, strict OpenSpec validation 16 passed, package verification passed).

## Independent review

Assigned reviewer (rotation): Codex CLI 0.162.1 with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree>`; the output reports model `gpt-6.1-sol` and reasoning effort `medium`. The prompt named the ADR 0004 principles and asked for every instance of a problem. SHA-256 snapshots of `git ls-files -co --exclude-standard` in the worktree before and after the pass were equal. The reviewer consulted the gh 2.88.1 source on GitHub.

- **Pass 1 — session `01a16eeb-36dc-70b2-af3e-fc19a8de1a07`.** Findings: 0 Critical, 0 High, 0 Medium, 2 Low. Fixed without another pass, as the review process allows for a Low-only pass; **these fixes have not been independently reviewed**:
  1. Low: `docs/releases.md` gave an inaccurate cause for the remote branch being left in place. The author confirmed in gh 2.88.1 `pkg/cmd/pr/merge/merge.go` that local branch deletion runs first and switches to `dev`, which fails because the main clone has `dev` checked out, ending the command before remote deletion. The text and `design.md` now state that cause.
  2. Low: task 2.1 was unchecked although `make verify` had passed. Checked.

After the fixes, `make verify` passed again (19 tests passed, strict OpenSpec validation 16 passed). Remaining findings: 0.

## Remaining gates

Owner authorization to push and open a pull request into `dev`; merge; archival; promotion to `main`.
