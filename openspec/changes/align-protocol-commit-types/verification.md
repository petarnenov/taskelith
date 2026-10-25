# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

Assigned on 2026-10-25 by the session coordinating G2 (Niki) as `align-protocol-commit-types`, from the out-of-scope notes of `list-build-commits-in-release-table`: add `ci` to the private-work commit types in worker step 3 of `docs/agent-task-protocol.md`, and add the release table's missing patch rows (`perf:`, a revert) to `docs/releases.md`. Documentation only. Base revision: `325d854` on `dev`. Scope: those two documents and this change, with `skip_specs: true`.

## Environment

macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through `nvm use`, npm 12.2.1; installed `@semantic-release/commit-analyzer` 13.0.1 and `conventional-changelog-conventionalcommits` 9.3.1.

## Evidence

- A scratch run of `analyzeCommits` with the commit analyzer options from `release.config.js`, outside the repository's tracked files, gave: `perf: speed up output` → `patch`; `revert: add project creation` with the body `This reverts commit 0123456789abcdef.` → `patch`; `Revert "feat: add project creation"` with the same body → `patch`; `revert: add project creation` without that body → no release.
- The `conventionalcommits` parser's `revertPattern` (`src/parser.js`) requires a `Revert` or `revert:` header followed by `This reverts commit <hash>.`, which explains the last result.

## Author self-check before review

- The `automated-releases` scenarios stay true: they name fix, feat, and breaking changes, and the no-release types, without claiming the list of patch triggers is complete; no `agent-task-protocol` requirement lists commit types. Hence `skip_specs: true`.
- Evidence check: no external link was added.
- Commit type `docs:` only.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1, on the working tree committed as the change's first commit: `npm run openspec -- validate align-protocol-commit-types --strict` passed; `make verify` passed (572 tests passed, 0 failed; coverage 99.18% lines, 94.35% branches, 99.24% functions; strict OpenSpec validation 46 passed; archive dry run, dependency inventory check, and package verification passed).

## Independent review

Assigned reviewer: Codex CLI, `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree without network access. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` are taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

Pending.

## Limitations

The `perf:` and revert rows are confirmed by the scratch run, not by the repository's classification test, because this change is documentation only.

## Remaining gates

Independent review; integration by the coordinating session (pull request into `dev`, merge); archival.
