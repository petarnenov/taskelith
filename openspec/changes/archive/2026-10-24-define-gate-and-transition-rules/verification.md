# Verification: define-gate-and-transition-rules

## Scope and source

G1 item 5 of the [G1 work plan](/docs/g1-plan.md), delegated by the integrating session under the owner's 2026-10-24 authorization to start and merge reviewed G1 items. Base revision: `47a0931` on `dev`. Scope: new domain files `display-text.ts`, `generation.ts`, `gate-subject.ts`, `gate-evidence.ts`, `gate.ts`, and `stage-progress.ts` in `packages/modules/sdlc/src/domain/`, the root exports in `src/index.ts`, `native-reference.ts` (now uses the shared display-text check, same behavior), three new test files in `packages/modules/sdlc/test/`, and this change. Prepared in a git worktree.

## Author self-check before review

- Against the ADR 0004 principles: the new code is in `src/domain/`, imports only `@taskelith/kernel` and the module's own domain files, defines no port, application service, or admission, and reads no clock, random source, or I/O; values are branded and frozen; outcomes are kernel `Result` values; transitions are governed by two frozen tables that tests check exhaustively; no code or test names a specific SDLC framework, harness, provider, or SCM; coverage is 100%. Principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation for a domain-only change without an HTTP or message interface; `make verify` runs its build and tests.
- Evidence check: the change adds only repository-relative links; no external link.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree, after `npm ci --ignore-scripts`:

- `make verify` passed: 120 tests passed, 0 failed; coverage 100% lines, branches, and functions, including every file of `packages/modules/sdlc/dist/`; "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; "Verified 487 package paths; 14 with license coverage gaps (all reviewed; 3 declaration-only)"; strict OpenSpec validation 25 passed; package verification passed.
- `npm run openspec -- validate define-gate-and-transition-rules --strict --no-interactive`: valid.
- After the pass-1 Low fixes: `make verify` passed: 121 tests passed, 0 failed; coverage 100% lines, branches, and functions; boundary and coverage scope checks passed; dependency inventory verified (487 package paths); strict OpenSpec validation 25 passed; package verification passed.

## Independent review

Assigned reviewer (rotation): Antigravity CLI with `gemini-4-argon-medium`, effort `medium`, mode `plan` (read-only), run from the worktree. The log file named the model `gemini-4-argon-medium`. The pass reviewed the uncommitted diff on the base above. The worktree's SHA-256 snapshot of tracked and untracked files (`188144e9823390c7595c151342cc475989d377bf4839e4f2cd6433c7543df6ae`) was identical before and after the pass. The prompt named the nine ADR 0004 principles and asked for every instance of each problem.

- **Pass 1** (conversation `a5b298cc-e4b4-4e79-8617-fe1e6270c661`). No findings for principles 1 to 7, the state machines, compare-and-set ordering, invalidation, evidence distinctness, purity, frozen values, or scope. Findings: 0 Critical, 0 High, 0 Medium, 2 Low. Under the review process both were fixed without another pass and are unreviewed:
  1. Low: the test for the scenario "Same content read elsewhere" used the same native reference as the subject revision. The test helper takes a native reference; the outdating test and a new evidence test use a revision with the same artifact and digest read from another location.
  2. Low: task 2.1 was unchecked although `make verify` had run. Tasks 2.1 and 2.2 are checked.
  After these fixes `make verify` passed again (see Checks).

## Remaining gates

- Integration into `dev` by the integrating session, then archiving the change.
