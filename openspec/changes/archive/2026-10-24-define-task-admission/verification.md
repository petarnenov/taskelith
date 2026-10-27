# Verification: define-task-admission

## Scope and source

G1 item 7 of the [G1 work plan](/docs/g1-plan.md), delegated by the integrating session under the owner's 2026-10-24 authorization to start and merge reviewed G1 items. Base revision: `2890be6` on `dev`. Scope: new files `domain/task-admission.ts`, `ports/admission-repository.ts`, `ports/clock.ts`, `application/task-admission-service.ts`, and `adapters/in-memory-admission-repository.ts` in `packages/modules/sdlc/src/`, the root exports in `src/index.ts`, two new test files in `packages/modules/sdlc/test/`, the type-only rule in `scripts/check-coverage-scope.ts` with its test in `test/check-coverage-scope.test.ts`, and this change. Prepared in a git worktree.

## Author self-check before review

- Against the ADR 0004 principles: the admission rules are in `src/domain/`, import only `@taskelith/kernel` and the module's own domain files, and read no clock, random source, or I/O; the service in `src/application/` depends only on the domain and the module-owned ports in `src/ports/`; the in-memory adapter implements the repository port; values are frozen; outcomes are kernel `Result` values; admission transitions are governed by a frozen table that a test checks exhaustively; no code or test names a specific SDLC framework, harness, provider, or SCM. Principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation for a module-only change without a runnable component or an HTTP or message interface; wire contracts are item 13, and `make verify` runs the build and tests.
- G1 exit evidence: the domain test "an implementation task without a work item is rejected" and the service test "a planning task creates the missing specification, and implementation is admitted only when bound to it" show that unbound implementation tasks are rejected and that planning tasks can create missing specifications.
- Evidence check: the change adds only repository-relative links; no external link.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree:

- `make verify` passed: 160 tests passed, 0 failed; coverage 100% lines, 99.79% branches, 100% functions over the compiled product code (`task-admission.js` and `in-memory-admission-repository.js` 100%; `task-admission-service.js` 100% lines and functions, 96.88% branches, the uncovered branch being the defensive failure return after `invalidateAdmission`, which the outdated filter makes unreachable); "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; "Verified 492 package paths; 14 with license coverage gaps (all reviewed; 3 declaration-only)"; strict OpenSpec validation 27 passed; package verification passed.
- `npm run openspec -- validate define-task-admission --strict --no-interactive`: valid.
- After the pass-1 fixes: `make verify` passed: 161 tests passed, 0 failed; coverage 100% lines, 99.79% branches, 100% functions (`task-admission-service.js` 97.14% branches, the uncovered branch being the same defensive return); boundary and coverage scope checks passed; dependency inventory verified (492 package paths); strict OpenSpec validation 27 passed; package verification passed.

## Independent review

Assigned reviewer (rotation): Antigravity CLI with `gemini-4-argon-medium`, effort `medium`, mode `plan` (read-only), run from the worktree. The prompt named the nine ADR 0004 principles and asked for every instance of each problem. Each pass reviewed the uncommitted diff on the base above, with the diff of tracked files included in the prompt. The log file of each pass named the model `gemini-4-argon-medium`. The SHA-256 snapshot of tracked and untracked files was identical before and after each pass.

- **Attempt without a review** (conversation `f624c7bd-3b0b-488c-8632-44395288f11f`). The reviewer tried to run a shell command, which the headless plan mode denied, and returned no output. Not counted as a pass. The next prompt said that commands are unavailable and included the diff of tracked files.
- **Pass 1** (conversation `c0635961-2b1c-4314-9443-bd1388fc049f`, snapshot `5ed642e278581a4dff4a54fb1cdd637274e14e22ea37d1556151af1593311f89`). No findings for principles 1 to 7 and 9, the admission rules, the exit evidence, scope, or the coverage scope change. Findings: 0 Critical, 0 High, 1 Medium, 2 Low, all fixed:
  1. Medium: `TaskAdmissionService.recordCreatedRevision` stored the created revision before invalidating, so a `conflict` during invalidation left the revision recorded, and repeating the call failed on the planning admission's generation without completing the invalidation. The service now invalidates first and stores the planning admission last; a new test shows that a raced call stores nothing and that repeating it records the revision once and invalidates the outdated admission, and another test covers a conflict on the final store. The spec and design state the order.
  2. Low: the requirement "Admission record" omitted the workflow identifier. It now names the workflow identifier and version.
  3. Low: the requirement "Planning admission" did not state that two revisions of one artifact are rejected with `invalid` and the field `artifacts`. It now does.
- **Pass 2** (conversation `556051fc-4f7c-423b-b9ff-8b46939de3a5`, snapshot `025269c226218fc9ee1905faaf7e57949369af32da256f837c8ef1c00146d8c2`). Reviewed the whole change again, including the pass-1 fixes. Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

## Remaining gates

- Integration into `dev` by the integrating session, then archiving the change.
