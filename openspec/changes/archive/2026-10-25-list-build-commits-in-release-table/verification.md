# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

Assigned on 2026-10-25 by the session coordinating G2 (Niki) as `list-build-commits-in-release-table`: confirm from the semantic-release configuration and the commit analyzer's default rules that `build:`, and `ci:` if used, publish no release, then add them to the commit table in `docs/releases.md` and to the matching `automated-releases` requirement as a MODIFIED delta with its full text. Documentation only, plus test cases that the review asked for. Base revision: `87d048d` on `dev`. Scope: `docs/releases.md`, the classification cases in `test/release.test.ts`, and this change.

## Environment

macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through `nvm use`, npm 12.2.1; installed `@semantic-release/commit-analyzer` 13.0.1 and `conventional-changelog-conventionalcommits` 9.3.1.

## Evidence

- `release.config.js` configures `@semantic-release/commit-analyzer` with `preset: 'conventionalcommits'` and no `releaseRules`.
- `node_modules/@semantic-release/commit-analyzer/lib/load-release-rules.js` returns only configured rules; `index.js` falls back to `lib/default-release-rules.js`, whose rules release breaking changes, reverts, the types `feat`, `fix`, and `perf`, and the upper-case types `FEAT` and `FIX`, and otherwise match the `emoji`, `tag`, and `component` fields that the `conventionalcommits` parser does not produce. No rule names `build` or `ci`.
- `git log --format=%s origin/dev` shows 45 `build:` commits and 1 `ci:` commit.
- `test/release.test.ts` runs the analyzer with `release.config.js` on each row of the table; its new `test:`, `build:`, and `ci:` cases classify as no release.

## Author self-check before review

- The MODIFIED delta keeps the requirement text and the first scenario unchanged and changes only the non-release scenario; the requirement text is 109 characters.
- Evidence check: no external link was added.
- Commit types `docs:` and `test:`; neither publishes a release.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1, on the working tree committed as `ce05c56`: `npm run openspec -- validate list-build-commits-in-release-table --strict` passed; `make verify` passed (569 tests passed, 0 failed; coverage 99.18% lines, 94.35% branches, 99.24% functions; strict OpenSpec validation 46 passed; archive dry run, dependency inventory check, and package verification passed). After the pass-1 fixes, on `1743ac1`, `make verify` passed with 572 tests and the same coverage and validation results.

## Independent review

Assigned reviewer: Claude Code, `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` are taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

- **Pass 1 — session `e8826681-9985-4660-9baf-6b10853e62d9`**, at `ce05c56`. The JSON `modelUsage` reports `claude-fable-5-1`. Snapshot before and after: `5ac7391e3e9dafd71709a014da2fb268ee071f979bad99a467bfb658f2287810`, unchanged. Findings: 0 Critical, 0 High, 1 Medium, 4 Low.
  1. Medium: the table now names `build:` and `ci:`, but the existing classification test, which runs the analyzer with `release.config.js` on the table's rows, did not cover them. Cases for `build:` and `ci:` are added; tested.
  2. Low: the requirement text is 109 characters, not 95. Corrected.
  3. Low: the checks did not name the revision they ran on. They now name `ce05c56`.
  4. Low: `test:` is in the table without a classification case. Added with the others.
  5. Low, out of scope and not changed: `docs/agent-task-protocol.md` lists `chore`, `build`, `docs`, and `test` for private work but not `ci`; reported to the coordinator.
- **Pass 2 — session `463494b5-3897-499b-884f-78420279b05c`**, at `1743ac1`. The JSON `modelUsage` reports `claude-fable-5-1`. Snapshot before and after: `c1ecd64ce5aed4354e68f61fac412c69c6167de7441056592a65b5e7765780cc`, unchanged. The reviewer confirmed pass-1 findings 1, 2, and 4 as resolved, finding 3 as partly resolved, and finding 5 as acceptable. Findings: 0 Critical, 0 High, 0 Medium, 3 Low, fixed as **unreviewed fixes** as the review process requires for a Low-only pass:
  1. Low: the self-check said `docs:` only, although the branch has a `test:` commit. Corrected.
  2. Low: the repeated `make verify` did not name its revision. It now names `1743ac1`.
  3. Low: the design and the evidence said every other default rule matches fields the parser does not produce, but the upper-case `FEAT` and `FIX` rules match the `type` field. Both now name them; the conclusion for `build:` and `ci:` is unchanged.

## Limitations

The release behavior is read from the installed analyzer's source and asserted by the classification test, not observed in a release run.

## Remaining gates

Integration by the coordinating session (pull request into `dev`, merge); archival.
