# Verification: define-sdlc-workflow-model

## Scope and source

G1 item 4 of the [G1 work plan](../../../docs/g1-plan.md), delegated by the integrating session under the owner's 2026-10-24 authorization to start and merge reviewed G1 items. Base revision: `6df3ce5` on `dev`, with `origin/add-shared-kernel` at `0a155f4` (item 2, then in review) merged to build against the kernel; after pass 1, `origin/dev` at `029cf02`, which contains the merged and archived kernel, was merged (no rebase). Scope: the new package `packages/modules/sdlc` (`package.json`, `tsconfig.json`, `src/`, `test/`), the workspace link in `package-lock.json`, the regenerated `docs/dependencies/licenses.json` (lockfile provenance hash) and `docs/dependencies/sbom.cdx.json` (the private `@taskelith/sdlc` component), and this change. Prepared in a git worktree.

## Author self-check before review

- Against the ADR 0004 principles: the module's code is in `src/domain/`, imports only `@taskelith/kernel`, and performs no I/O; no code or test names a specific SDLC framework, harness, provider, or SCM; values are branded and frozen; failures are kernel `Result` values; coverage is 100%. Principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation for a domain-only package without an HTTP or message interface; `make verify` runs its build and tests.
- Evidence check: the change adds only repository-relative links; no external link.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree:

- `npm run inventory:dependencies` regenerated the inventory after `npm install --ignore-scripts` linked the package: "Generated 487 package paths; 14 with license coverage gaps (all reviewed; 3 declaration-only)".
- `make verify` passed: 78 tests passed, 0 failed; coverage 100% lines, branches, and functions, including every file of `packages/modules/sdlc/dist/`; "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; dependency inventory verified; strict OpenSpec validation 22 passed; package verification passed.

- After pass 1 and the merge of `origin/dev`: `npm install --ignore-scripts`; `npm run verify:dependencies` reported no drift. The first `make verify` failed two tests that compared the kernel's identifier message text, which the final kernel changed ("without spaces" to "without whitespace"); the tests now take that message from the kernel and check only the field prefix this package adds. `make verify` then passed: 83 tests, 0 failed; coverage 100% lines, branches, and functions; boundary and coverage scope checks passed; dependency inventory verified; strict OpenSpec validation 24 passed; package verification passed.
- After the pass-2 Low fix (records only): `make verify` passed with the same results, 83 tests and 100% coverage.
- ADR 0008, new on `dev`, was read: decision 1 keeps the per-run binding rule this model records, and decision 4's board columns match the six obligations; the design cites both.

## Independent review

Assigned reviewer (rotation): Codex CLI with `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`. The output header confirmed the model, `reasoning effort: medium`, and `sandbox: read-only`. Each pass reviewed the uncommitted diff on the base above. The worktree's SHA-256 snapshot (tracked and untracked files) was identical before and after each pass.

- **Pass 1** (session `01a16f42-2dda-7d02-bb0b-50ce36162d7c`). Findings: 0 Critical, 0 High, 2 Medium, 3 Low. No scope creep into items 5 to 7. All accepted and resolved:
  1. Medium: `LIFECYCLE_OBLIGATIONS` and `STAGE_ORIGINS` were mutable at run time, so a caller could change what the parsers accept. Both are frozen, with a test.
  2. Medium: the recursive cycle search threw `RangeError` on a valid 10,000-stage chain. It is iterative; tests cover a 20,000-stage chain and a cycle closed at its end, and a scenario was added.
  3. Low: native references accepted C1 control characters. The check now rejects Unicode category `Cc`, with C1 tests; spec and design say so.
  4. Low: the single-value parsers return no `field` detail, contrary to the field-failure requirement as worded. The requirement now covers the composite constructors and states that single-value parsers leave the field to their caller; the design says the same.
  5. Low: task 2.1 was unchecked although `make verify` had run. Checked.
- **Pass 2** (session `01a16f45-f438-7cd2-a385-a0c0c5a2475e`). All five pass-1 findings confirmed resolved. Findings: 0 Critical, 0 High, 0 Medium, 1 Low. Under the review process the Low finding was fixed without another pass and is unreviewed:
  1. Low: the records still described the kernel merge as pending (task 2.3 unchecked, a remaining gate, and a design risk saying the kernel was in review). Task 2.3 is checked, the gate is removed, and the risk is restated as resolved; tasks 2.2 and 2.3 are checked.
  After this fix `make verify` passed again (see Checks).

## Remaining gates

- Integration into `dev` by the integrating session, then archiving the change.
