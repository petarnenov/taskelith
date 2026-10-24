# Verification

Date: 2026-10-24. Author verification and independent review are recorded separately below.

## Scope and source

Delegated by the coordinating session Niki with owner approval: fix the silent skip in `scripts/check-boundaries.ts` when it is started through a symlinked path, add a regression test, and stop before push. Base revision: `7306ba8` (`origin/dev`). Branch `fix-boundary-entrypoint` in its own worktree. Changed files:

- `scripts/check-boundaries.ts`: the CLI guard compares `realpathSync(process.argv[1])` with `fileURLToPath(import.meta.url)`.
- `test/check-boundaries.test.ts`: regression test that runs the CLI through a symlinked directory.
- `openspec/changes/fix-boundary-entrypoint/`: this change.

`scripts/check-coverage-scope.ts` is not touched. No product runtime behavior, published CLI surface, dependency, or tarball change.

## Reproduction

Before the fix, from a scratch directory containing `bridge.go`, with `link -> real` and `real/cb.ts -> scripts/check-boundaries.ts`: `node --experimental-strip-types link/cb.ts` and `node --experimental-strip-types real/cb.ts` both exited 0 with no output. After the fix, `link/cb.ts` printed `Boundary violation: bridge.go: prohibited Go artifact in product repository (R02/R36)` and exited 1.

## Checks

All checks ran under the exact CI pins Node v24.22.1 and npm 12.2.1, via `npm exec --yes --package=node@24.22.1 --package=npm@12.2.1 --`, on macOS:

- New test without the fix (script change stashed): `boundary checker CLI runs when started through a symlinked path` failed; the two existing tests passed. With the fix: 3 of 3 passed.
- `make verify`: passed. `npm test` 20 tests passed, 0 failed; dependency verification passed; `openspec validate --all --strict` 17 passed, 0 failed; tarball allowlist and installed CLI verification passed.
- `git diff --check`: passed.
- After the review fix: `make verify` and `git diff --check` passed again with the same results.

Native Linux CI execution is not claimed.

## Author self-check

Checked against the ADR 0004 principles before the first pass. Clean Code: one-line guard change, the test names the behavior, arranges its fixture, and asserts exit code and message. SOLID and hexagonal architecture: no module, port, or adapter changes; the checker's rules are unchanged. Microkernel, Docker, OpenAPI: not affected. Makefile: verified through `make verify`. OpenSpec: this change. Evidence check: the change contains no external links.

## Independent review

One assigned reviewer by rotation. A SHA-256 snapshot of all tracked and untracked worktree files (`git ls-files -co --exclude-standard -z | xargs -0 shasum -a 256`, 211 files) taken before and after the pass was identical.

- **Pass 1 — Claude Code 2.1.310, model `claude-fable-5-1`, effort `medium`, permission mode `plan`, `--disallowedTools Edit Write NotebookEdit`, session `b764885e-b340-4d27-be36-26e144dc06d2`.** The JSON output's `modelUsage` reports `claude-fable-5-1`. The prompt was passed on stdin; two earlier attempts that passed it as the `-p` argument ended with `Error: No messages returned from query` and produced no review. Reviewed the uncommitted diff against `7306ba8`. The reviewer ran the test file and strict OpenSpec validation; its attempt to reproduce the failure without the fix needed a write outside the repository and was refused, so it confirmed that claim analytically only. Findings: 0 Critical, 0 High, 0 Medium, 1 Low.
  1. Low (`scripts/check-boundaries.ts:135`, `design.md` "Decisions"): `realpathSync` throws when the module is imported in a process whose `process.argv[1]` names no existing file, and design.md wrongly said the guard only runs for a main module started from a file. Resolved as an unreviewed fix: design.md now states that the guard is evaluated on every load, when it throws, and why that is acceptable. The code is unchanged.

Only a Low finding remained, so no further pass was run. Remaining findings: 0.

## Remaining gates

Push, pull request, merge into `dev`, and archival need the owner's explicit permission.
