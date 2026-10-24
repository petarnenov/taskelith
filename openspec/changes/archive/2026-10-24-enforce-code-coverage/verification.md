# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's direction on 2026-10-24: add a code coverage rule of 75% as a first-class principle; the owner chose to record it and enforce it in `make verify` for lines, branches, and functions over all product files. Base revision: `4f78d29` on `dev`. Scope: `package.json` (`test` script), `.gitignore`, `scripts/check-coverage-scope.ts` and `test/check-coverage-scope.test.ts` (new), `docs/dependencies/licenses.json` (root manifest hash), principle 9 in `docs/decisions/0004-first-class-engineering-principles.md`, the principle lists in `docs/architecture.md`, `README.md`, and `AGENTS.md`, the verification description in `docs/releases.md`, and this change. Prepared in a git worktree.

## Author self-check before review

- The thresholds and the scope check follow the owner's choice; the measured set (`dist/` only) and the scope check for unloaded product modules are the author's implementation, stated in the design.
- No new dependency: Node 24.22.1's built-in coverage flags only.
- `make verify` remains the single definition of the checks; the thresholds live in `npm test`, which it runs.
- Local link check passed; the change adds no external link.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree:

- From a state without `coverage/`, `make verify` passed in 9 s: 21 tests passed, 0 failed; coverage over the measured files 93.92% lines, 90.06% branches, 100% functions; "Every product module under src/ is in the coverage report."; dependency inventory verified; strict OpenSpec validation 16 passed; package verification passed.
- Threshold failure: running the tests with `--test-coverage-lines=99` reported "90.91% line coverage does not meet threshold of 99%." and exited 1.
- Scope failure: the scope check on an lcov report without `dist/cli.js` printed "Product modules missing from the coverage report: src/cli.ts" and exited 1.
- A first attempt without creating `coverage/` failed (exit 7) because the lcov reporter could not write; the `test` script now runs `mkdir -p coverage` first.
- `npm run inventory:dependencies` changed only the root `package.json` hash in `docs/dependencies/licenses.json`.
- After the pass-1 fixes, from a state without `coverage/`: `make verify` passed; 23 tests passed, 0 failed; coverage over `dist/` 100% lines, branches, and functions; scope check passed; strict OpenSpec validation 16 passed; package verification passed. The first run after removing the scripts from the measured set failed on dependency evidence drift for the changed `package.json`; `npm run inventory:dependencies` updated the root hash again. The new entrypoint test first failed because macOS temporary directories are reached through a symbolic link, so the entrypoint comparison now uses `realpathSync`.

## Independent review

Assigned reviewer (rotation): Codex CLI with `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`. The worktree's SHA-256 snapshot was identical before and after each pass.

- **Pass 1.** Findings: 0 Critical, 1 High, 1 Medium, 1 Low. All accepted and resolved:
  1. High: Node applies the thresholds to aggregate totals, so well-tested repository scripts in the measured set could mask product coverage below 75%. The measured set is now `dist/**/*.js` only; ADR 0004, the design, and the spec delta say so.
  2. Medium: the scope check compared `import.meta.url` with an unencoded `file://` path, so in a checkout path that needs URL encoding it exited 0 without checking. It now compares file system paths, and a test runs it from such a path.
  3. Low: relative `SF:` paths were resolved against the process directory instead of the workspace root. They are now resolved against the root, with a test whose root differs from the process directory.
- **Pass 2.** All pass-1 findings confirmed resolved. Fresh review: 0 Critical, 0 High, 0 Medium, 0 Low.

## Remaining gates

Merge into `dev`; promotion to `main`.
