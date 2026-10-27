# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](/docs/g2-plan.md) item 7, assigned by the coordinating session (Niki) to the worker session Pepi under decision D14 (a). Base revision: `30e7675` on `dev` (items 3 to 6 merged and archived). Scope: the new packages `packages/modules/execution` and `packages/modules/scheduling` (domain sources and tests), the ownership generation in `@taskelith/sdlc` (`domain/ownership-generation.ts`, an optional parameter of `useAdmission` and `TaskAdmissionService.useAdmission`, new exports, new tests), the lockfile and regenerated dependency inventory for the two workspace packages, and this change with the new `execution-model` and `scheduling-model` capabilities and a modified `sdlc-task-admission`. Inputs: the launch authorization, supervisor identity, worker journal, and capacity reservation contracts; architecture sections 5, 6, and 9; G1 decision D4 (a) and G1 item 7's deferral. Prepared in a git worktree.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1.
- Evidence check: the change adds only repository-relative links; no external link. No external dependency is added.

## Author self-check

The author ran these checks and `make verify` before pass 1, but recorded them here only after pass 1 found the record missing (pass-1 finding 8).

- Every topic of the plan row is covered: the attempt state machine (derived phases with a frozen phase table) and the assignment state machine (`offered`, `accepted`, `ended`); the task outcome facts; the ownership generation, bound into admission; reachability, orthogonal to execution; cancellation requested versus termination observed; and version-based acceptance of out-of-order facts and of the producer sequence.
- Against the contracts: the execution states, grants, rejection reasons in section 9 order, the ownership rule, transport retries, invalidation, and start observations of the launch authorization contract; `uncertain` and `termination-unproven` as evidence of the supervisor identity contract; lost local history and the producer sequence of the worker journal contract; the reservation record, justified release, and supersession of the capacity reservation contract.
- Against ADR 0004 and architecture section 6: both packages hold only `src/domain/`, import only the kernel, `@taskelith/sdlc`, and (for Scheduling) `@taskelith/execution` by package name, and read no clock, random source, file, or network; values are frozen; outcomes are kernel results; Execution does not import Scheduling. Principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation for a domain-only change without a runnable component or a wire interface; wire contracts are item 8.
- G1 compatibility: the G1 tests are unchanged and pass; `useAdmission` and the service keep their signatures with an added optional parameter; the frozen `SdlcFramework` port is untouched.
- Every requirement of the spec deltas is under 500 characters, and each new capability starts with a `## Purpose`.

## Checks

In the worktree, `make verify` passed at `295cdca` before review, after the pass-1 fixes (365 tests), and after the pass-2 fixes. After the pass-2 fixes: 367 tests passed, 0 failed; coverage over the compiled product code 99.71% lines, 96.45% branches, 99.50% functions, with every new file at 100% lines and functions (branches: `execution/task.js` 94.07%, `execution/launch-authorization.js` 99.09%, all others 100%); "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; "Every comment is within the comment length rule."; "Verified 681 package paths"; strict OpenSpec validation 39 passed; package verification passed. The dependency inventory was regenerated with `make dependency-inventory` for the two new workspace packages. After the pass-3 fixes and the merge of `origin/dev` at `9fb1c00` (item 9's `apps/*` workspaces), whose lockfile conflict was resolved by taking `dev`'s lockfile, adding the two workspace packages, and regenerating the inventory, `npm ci` and `make verify` passed: 379 tests passed, 0 failed; coverage 99.71% lines, 96.49% branches, 99.51% functions; boundary, coverage-scope, comment, and package checks passed; "Verified 695 package paths"; strict OpenSpec validation 39 passed.

## Independent review

Assigned reviewer: Codex CLI with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree. The prompt named AGENTS.md, ADR 0004, the governance review process, architecture sections 5, 6, and 9, the four contracts and their specs, and the coordinator's scope, and asked for every instance of a problem with severity, file, line, and fix. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` were taken before and after each pass.

- **Pass 1 — session `01a17067-aa92-76b2-8489-325952b06d4c`,** reviewed revision `295cdca`; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `48d6b6ce…ee35`, equal. Findings: 0 Critical, 2 High, 6 Medium, 0 Low. All accepted and resolved:
  1. High: `duplicate` and `historical` were decided before checking that the grant exists and is bound to the execution, so an unknown or foreign-bound grant could produce history instead of `unauthorized-start`. The decision now requires a grant bound to the execution and naming the observed `launchAuthId` before `historical` or `started`, keeps `duplicate` for a recorded start, and never records over one; the spec and tests cover both cases.
  2. High: `taskOutcomeFact` reported the task's current ownership generation, so a later owner relabeled an old outcome. The outcome now keeps the generation its attempt ended in, with a test after a retry and a new placement.
  3. Medium: a grant shared its parameters object with the input. It now keeps a frozen copy, with a test.
  4. Medium: a recorded exit shared its status with the report. It now keeps a frozen copy, with a test of the exit and the outcome.
  5. Medium: a reservation shared its scope, request, and hard-control list with the input. It now keeps frozen copies, with a test.
  6. Medium: an accepted assignment could be refused for admission pressure, releasing its reservation. Such a refusal is now rejected, since capacity contract section 8 makes it wait; spec, design, and a test cover it.
  7. Medium: the producer cursor accepted any number as a sequence. Sequences are now a branded type created only by `parseSequence`, with tests of invalid values.
  8. Medium: this record lacked the author self-check, evidence check, and checks before the first pass. They are recorded above, with the note that they were recorded after pass 1.

- **Pass 2 — session `01a1706e-e6fc-7c10-a35f-7f6a8d92935b`,** reviewed revision `e061aa7`; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `0ac793a0…29e9`, equal. The reviewer confirmed pass-1 findings 2 to 8 resolved and finding 1 resolved in part, with the gap raised as finding 1 below. Findings: 0 Critical, 2 High, 1 Medium, 0 Low. All accepted and resolved:
  1. High: a recorded start with the same `launchAuthId` still made a later observation a `duplicate` without a bound grant. `duplicate` now requires a grant bound to the execution; spec, design, and tests follow.
  2. High: an `unauthorized-start` occupied the execution's single start field, so the valid start under the real grant became a `duplicate` and the execution stayed `authorized`. Unauthorized starts are now a separate list on the execution, kept once per grant identity, and a test shows the valid start (or a historical one after an exit) still recorded.
  3. Medium: `authorizeLaunch` accepted structurally typed parameters that bypassed `parseLaunchParameters`, such as an infinite ttl or a negative skew. `LaunchParameters` is now a branded type that only the parser creates, with tests of invalid values.

- **Pass 3 — session `01a17074-8f23-74d1-b590-049f06584583`,** reviewed revision `d0e2b8b`; the header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `2942d7a8…7dbc`, equal. The reviewer confirmed pass-2 findings 1 and 2 resolved and finding 3 resolved in part, with the gap raised as finding 1 below. Findings: 0 Critical, 0 High, 1 Medium, 1 Low, both open:
  1. Medium, **resolved by an owner decision:** a spread of parsed `LaunchParameters` with replaced values (an infinite ttl, a negative skew) kept the brand, so `authorizeLaunch` could still issue a grant with unparsed parameters, and the design's claim that it cannot was not true. This is the third pass, so the finding went to the owner, through the coordinator, with options. On 2026-10-25 the owner chose option (a), a fix without review: `LaunchParameters` is now a frozen class with a private constructor and a private field, created only by `parseLaunchParameters`, so an object literal or a spread copy no longer type-checks as one; the grant keeps the parsed instance; a regression test asserts with `@ts-expect-error` that a spread copy with replaced values is rejected by the type check, which `make verify` runs over the tests, and that the instance cannot be changed; the design line is corrected. **This fix has not been independently reviewed.**
  2. Low, **resolved without review under the same owner decision:** the comment on `RETRYABLE_LAUNCH_REJECTIONS` said a retryable rejection is retried "with the same operation". It now says the worker retries under a new `operationId`, because a rejection is final for its operation (launch authorization section 6). **This fix has not been independently reviewed.**

## Remaining gates

- Integration into `dev` by the coordinator, then archiving the change.
- Integration into `dev` by the coordinator, then archiving the change.
