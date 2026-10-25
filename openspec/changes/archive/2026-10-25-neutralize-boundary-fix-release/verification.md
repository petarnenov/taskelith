# Verification: neutralize-boundary-fix-release

## Scope and source

The owner decided on 2026-10-25, in Bulgarian and paraphrased here, to promote `dev` to `main` after neutralizing the release-triggering `fix` commit (the coordinator's option (a)). The coordinator developed this change itself, following the worker steps. Base revision: `f83e36d` on `dev`.

## Evidence

- `@semantic-release/commit-analyzer` with the `conventionalcommits` preset, the configuration of `release.config.js`, run locally over `git log origin/main..<ref>`:
  - `origin/main..origin/dev` (`f83e36d`), 722 commits: `patch`.
  - `origin/main..8337a12` (the revert `93867c2` plus the `chore` commit), 724 commits: no release. The `chore` commit was later recreated with the original author (see Pass 1); its tree is unchanged.
- `git diff origin/dev 8337a12` is empty: the revert and the `chore` commit cancel out.

## Environment

macOS on arm64, Node.js 24.22.1.

## Author self-check before review

- The revert message keeps the header and the full hash as `git revert` writes them, which the analyzer needs to pair it.
- No external link or fact is added; the evidence check has nothing to verify.

## Checks

At `c03f472` (base `f83e36d` plus the revert, the `chore` commit and these records), and again on the final revision after the unreviewed fixes, whose only differences are these records and the `chore` commit's author:

- `npm run openspec -- validate neutralize-boundary-fix-release --strict`: passed.
- `make verify`: passed.

## Independent review

Reviewer: Codex CLI, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.

### Pass 1

Session `01a17445-9f58-74d1-a266-62d0d114af96`. The output header reports model `gpt-6.1-sol`, reasoning effort `medium`, and a read-only sandbox. Pass 1 ran at `5d3626a`, and the SHA-256 snapshots before and after were equal (`004813b5…e3c6`). The reviewer's own analyzer run over `origin/main..HEAD` returned no release.

Findings: Critical 0, High 0, Medium 0, Low 3. This was a Low-only pass, so the findings are fixed without another review and recorded as unreviewed fixes:

1. The `chore` commit had a different author from `5bdf525`, against coordinator step 2's "with the same author". Fixed: the unpushed commit was recreated with the original author and the same tree.
2. The checks did not name their revision. Fixed under Checks.
3. Remaining gates omitted the integration and the archive. Fixed under Remaining gates.

## Remaining gates

- Integration of this branch into `dev`, and its archive, by the coordinator steps.
- The promotion pull request from `dev` into `main` and its merge, which the owner approves after GitHub's `make verify` passes.
