# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

Assigned on 2026-10-25 by the session coordinating G2 (Niki) as `list-build-commits-in-release-table`: confirm from the semantic-release configuration and the commit analyzer's default rules that `build:`, and `ci:` if used, publish no release, then add them to the commit table in `docs/releases.md` and to the matching `automated-releases` requirement as a MODIFIED delta with its full text. Documentation only. Base revision: `87d048d` on `dev`. Scope: `docs/releases.md` and this change.

## Environment

macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through `nvm use`, npm 12.2.1; installed `@semantic-release/commit-analyzer` 13.0.1 and `conventional-changelog-conventionalcommits` 9.3.1.

## Evidence

- `release.config.js` configures `@semantic-release/commit-analyzer` with `preset: 'conventionalcommits'` and no `releaseRules`.
- `node_modules/@semantic-release/commit-analyzer/lib/load-release-rules.js` returns only configured rules; `index.js` falls back to `lib/default-release-rules.js`, whose rules release breaking changes, reverts, and the types `feat`, `fix`, and `perf`, and otherwise match fields the `conventionalcommits` parser does not produce. No rule names `build` or `ci`.
- `git log --format=%s origin/dev` shows 45 `build:` commits and 1 `ci:` commit.

## Author self-check before review

- The MODIFIED delta keeps the requirement text and the first scenario unchanged and changes only the non-release scenario; the requirement text is 95 characters.
- Evidence check: no external link was added.
- Commit type `docs:` only.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `npm run openspec -- validate list-build-commits-in-release-table --strict` passed; `make verify` passed (569 tests passed, 0 failed; coverage 99.18% lines, 94.35% branches, 99.24% functions; strict OpenSpec validation 46 passed; archive dry run, dependency inventory check, and package verification passed).

## Independent review

Assigned reviewer: Claude Code, `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` are taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

Pending.

## Limitations

The release behavior is read from the installed analyzer's source, not observed in a release run.

## Remaining gates

Independent review; integration by the coordinating session (pull request into `dev`, merge); archival.
