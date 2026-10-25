# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

Assigned on 2026-10-25 by the session coordinating G2 (Niki) as `align-protocol-commit-types`, from the out-of-scope notes of `list-build-commits-in-release-table`: add `ci` to the private-work commit types in worker step 3 of `docs/agent-task-protocol.md`, and add the release table's missing patch rows (`perf:`, a revert) to `docs/releases.md`. Documentation only. Base revision: `325d854` on `dev`. Scope: those two documents and this change, with `skip_specs: true`.

## Environment

macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through `nvm use`, npm 12.2.1; installed `@semantic-release/commit-analyzer` 13.0.1 and `conventional-changelog-conventionalcommits` 9.3.1.

## Evidence

- A scratch run of `analyzeCommits` with the commit analyzer options from `release.config.js`, outside the repository's tracked files, gave: `perf: speed up output` → `patch`; `revert: add project creation` with the body `This reverts commit 0123456789abcdef.` → `patch`; `Revert "feat: add project creation"` with the same body → `patch`; `revert: add project creation` without that body → no release.
- The `conventionalcommits` parser's case-insensitive `revertPattern` (`src/parser.js`) requires `Revert` or `revert:`, optionally quoted header text, and `This reverts commit <hash>.`, which explains the last result. The analyzer's `index.js` drops a revert and the commit it reverts before applying the rules when both are in range and the revert's extracted header and hash match that commit's exactly (`filterRevertedCommitsSync` in `conventional-commits-filter`); this is read from the source, not run.

## Author self-check before review

- The `automated-releases` scenarios stay true: they name fix, feat, and breaking changes, and the no-release types, without claiming the list of patch triggers is complete; no `agent-task-protocol` requirement lists commit types. Hence `skip_specs: true`.
- Evidence check: no external link was added.
- Commit type `docs:` only.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1, on the working tree committed as the change's first commit: `npm run openspec -- validate align-protocol-commit-types --strict` passed; `make verify` passed (572 tests passed, 0 failed; coverage 99.18% lines, 94.35% branches, 99.24% functions; strict OpenSpec validation 46 passed; archive dry run, dependency inventory check, and package verification passed). After the pass-1 fixes, `make verify` passed again with 572 tests, and again after the pass-2 fixes.

## Independent review

Assigned reviewer: Codex CLI, `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree without network access. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` are taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

- **Pass 1 — session `01a170ef-cc59-7ae0-9f6d-a7db188b9832`**, at `5a06a5f`. The output header reports model `gpt-6.1-sol`, reasoning effort medium, and sandbox read-only. Snapshot before and after: `d953f6ebcfe1ed9c4e7f3ddf6d3022b0edc60e894d4239a86d7e00c95d3d4282`, unchanged. The reviewer found `skip_specs` justified. Findings: 0 Critical, 0 High, 1 Medium, 1 Low.
  1. Medium: the revert row was unconditional, but the analyzer first drops a revert together with the commit it reverts when both are in range. `docs/releases.md` now states the pair filtering below the table, the protocol says these types "can" trigger a release, and the design describes the filter. Pass 2 found this description still too broad (see below).
- **Pass 2 — session `01a170f1-ffe5-7563-8e24-851b46d1af13`**, at `f41a07a`. The output header reports model `gpt-6.1-sol`, reasoning effort medium, and sandbox read-only. Snapshot before and after: `dd8bd1490ce81197371d24f9cdd57edcab9c0ab0f07c2ef1911b97b1c3e51db2`, unchanged. The reviewer confirmed the pass-1 Low as resolved and the Medium as partly resolved. Findings: 0 Critical, 0 High, 1 Medium, 0 Low.
  1. Medium: being in the same range does not suffice: the filter drops the pair only when the revert's extracted header and hash match the reverted commit's exactly, so a `revert: add project creation` does not cancel `feat: add project creation`. `docs/releases.md`, the design, and this record now state that condition, as `git revert` writes it.
  2. Low: the design described the revert pattern as exactly two header forms; it now describes the case-insensitive pattern, and the table gives the forms as examples.

## Limitations

The `perf:` and revert rows are confirmed by the scratch run, not by the repository's classification test, because this change is documentation only.

## Remaining gates

Independent review; integration by the coordinating session (pull request into `dev`, merge); archival.
