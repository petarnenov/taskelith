# Verification: serve-workers-and-enrollment-tokens

## Scope and source

G3 plan item 33 (`docs/g3-plan.md`, row 33), change 1 of the item (backend, size M), developed by a briefed subagent from `dev` `79fb7130` (#443) under the coordinator (Desi) decisions Q1 to Q6 of 2026-11-04: the control plane serves `listWorkers` and the four enrollment token operations as `control-plane.openapi.json` 0.5.0 declares them, for the `installation-owner` that `access-requirements.ts` already names, with the worker details redacted again as the CLI prints them and the token secret only in the 201 of issue and rotate; a redemption refuses a revoked token (Q1); the migration identifies every stored token without deleting a row (Q2); a new `EnrollmentTokenService` in the fleet module (Q3); no audit of the token commands, named as a follow-up (Q4); a revocation of a rotated token names its direct replacement (Q5); and rotation wins over expiry (Q6). No OpenAPI document changes. Excluded: any UI, the audit of the token commands, and the enrollment endpoint's installation contract entry (item 26c).

## Revision

- Base: `dev` `79fb7130`; the brief's `checklist.json` was generated at `79fb713087669993b5301f1646140c933fe9aac3` with `--size M`.
- `d81a09ce` `chore: start the serve-workers-and-enrollment-tokens change`, `1be79911` `docs: create the serve workers and enrollment tokens change`.
- Fleet module: `3e90e986` (tests), `d1905ab3` `chore: list, revoke, and rotate enrollment tokens by identifier through a token service, and refuse a revoked token at redemption`.
- PostgreSQL: `18cc4257` (tests), `b2ba0944` `chore: identify, revoke, and rotate enrollment tokens in PostgreSQL under the redemption row lock`.
- Control plane: `d28cef2c` (tests), `9f649f84` `chore: serve the workers view and the enrollment token operations for the installation owner with the secret revealed once`.
- `3c273b4c` the wire contracts note (task 2.4), `0d4f28c9` this record and the tasks, `0cc99e5b` `route.json` (unedited), `d20ee8bb` the typecheck fix of two test files after `make verify` run 1, `cced19bf` its record and the stale route's removal, `91352dd7` the second route (unedited), then the `make record` output with the coverage notes and task 3.1.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Docker 29.5.2, Node.js v24.22.1 (the `.nvmrc` pin). The focused PostgreSQL runs used `scripts/docker-slot.ts run -- bash scripts/services.sh run taskelith-33-focus ...`; no other Docker resource was touched.

## Author self-check

- Scope: only the brief's items. `git diff --shortstat 79fb7130 3c273b4c -- '*.ts' '*.sql'`: 26 files, 1255 insertions, 179 deletions; all files: 36 files, 1480 insertions, 180 deletions, within the guard of about 40 code files and 5000 lines.
- Coordinator decisions, each with its test:
  - Q1: `unusedToken` and `enroll` read only rows whose `revoked_at` is null, and `enroll` of a revoked token fails `token-revoked`, which `EnrollmentService` maps to `token-invalid` with `token-used` and `token-expired` (`SPENT_TOKEN_REASONS`). Tests: `enrollment-token-service.test.ts` ("a revoked or rotated token enrolls nothing, and the replacement enrolls", "a revocation and a redemption of one token have exactly one winner, in either order"), the conformance case "a revoked token enrolls nothing, and a revocation racing a redemption has one winner" in both adapters, and the PostgreSQL row-lock race "a revocation and a redemption that wait for the same row lock have exactly one winner" (`fleet-conformance.integration.test.ts`). The `installation-enrollment` delta MODIFIES "Single-use enrollment" with the scenarios "Revoked token" and "Revocation races a redemption".
  - Q2: `1792934500000_enrollment-token-lifecycle.sql` adds `token_id`, fills every row with `'e' || replace(gen_random_uuid()::text, '-', '')`, then sets `NOT NULL` and the unique `enrollment_tokens_token_id_key`, and adds `revoked_at` and `replacement_token_id` with its foreign key; the down migration drops the three columns. `migrations.integration.test.ts` inserts a pending, a used, and an expired row before the migration and checks that each keeps its state and the pending one is redeemed after it, that every backfilled identifier matches `^e[0-9a-f]{32}$`, that a duplicate, a null, and an unknown replacement are rejected, that the down migration restores the table, and that no row is deleted. The pinned image is `postgres:18.6-trixie` (`infra/services/compose.yaml`, `infra/installation/compose.yaml`), where `gen_random_uuid()` is core.
  - Q3: `EnrollmentTokenService` (`packages/modules/fleet/src/application/enrollment-token-service.ts`) with `issue`, `list`, `revoke`, and `rotate`; `EnrollmentService.issueToken` delegates to it, which "EnrollmentService.issueToken still returns only the secret and stores the token with an identifier" checks. `IdentifierSource.newEnrollmentTokenId` is implemented by `RandomIdentifiers` (`e` and 32 hex digits) and the test fixture (`e001`, ...).
  - Q4: no audit event; follow-up below.
  - Q5: `revocationRefusal` answers `token-rotated` with `replacementTokenId` of the direct replacement; tested in the service, both conformance suites, and the routes test ("a revocation answers 204 for a pending, repeated, or expired token, 404 for an unknown one, 422 token-used for a used one, and 400 for a bad identifier", with the rotated case in the rotation test).
  - Q6: the adapters decide after the lock in the order unknown, used, rotated, revoked repeat, otherwise revoke (expired included); a rotation refuses a used, revoked, or expired token as `token-not-pending`, expiry read after the lock (`clock_timestamp()`). Tests: "a rotation refuses a used, expired, or revoked token as not pending" and the conformance rotation case.
  - Routes and roles: `FleetApi` behind `ApiServices.fleet`; `fleet-routes.test.ts` checks 401 without a credential and 403 `role-required` before the body on all five operations, the CSRF refusal of a cookie command, the view's identifier order and re-redaction, 503 without partial data, the 201 with `Cache-Control: no-store`, the 400s, the paging at 100 by identifier, and every revocation and rotation status; `access-requirements.test.ts` lists the five operations among the served ones; `control-plane-api.integration.test.ts` drives issue, list, rotate, revoke, and the workers view over PostgreSQL through the composition.
  - One-time reveal: "a token secret reaches only the 201 bodies of issue and rotate: never a list, a failure, or the request log" and "no refusal of a token command names a secret"; `grep -c tken_` over every run log of this change is 0.
- Requirement texts, in characters: `control-plane-api` "Workers and enrollment token operations served" 496, "Enrollment token command refusals" 499; `installation-enrollment` "Single-use enrollment" (MODIFIED, scenario "Token reuse" kept, two added) under 500. `npm run openspec -- validate serve-workers-and-enrollment-tokens --strict` passes.
- Commit types: no published `taskelith` code changes; `chore`, `test`, and `docs`, without AI attribution. `npm run verify:comments` before every commit: `Every comment is within the comment length rule.`
- Hexagonal placement: the refusal rules are domain functions of `enrollment.ts` that both adapters apply; the service is in the fleet application layer; `printableWorkerAdmission` moved from the admin CLI to `apps/control-plane/src/application/worker-admission-view.ts`, which the CLI and `FleetApi` share, so no api-to-admin import was added.

## Fail-before

Each behavior's tests were committed before its implementation and run with `node --experimental-strip-types --test` against the base `dist` (`build-33-1-base.log`); logs in the session scratchpad.

- `fb-33-1-1.log`, fleet module: tests 45, pass 44, fail 1: `enrollment-token-service.test.ts` failed to load (`ENROLLMENT_TOKEN_PAGE_SIZE` not exported), so its ten tests and the four new conformance cases did not run; mutation control 1 below shows them running.
- `fb-33-1-2.log`, PostgreSQL migration and conformance: tests 98, pass 76, fail 22.
- `fb-33-1-3.log`, routes and roles: tests 43, pass 32, fail 11 (the ten `fleet-routes.test.ts` tests with 404 `no operation has this method and path`, and the served-operations list).
- `fb-33-1-4.log`, composition over PostgreSQL: tests 33, pass 32, fail 1 ("the owner lists the workers and issues, lists, rotates, and revokes enrollment tokens over the API", 404).

After the implementation: `run-33-1-fleet.log` 58 of 58, `run-33-1-pg.log` 98 of 98, `run-33-1-routes.log` (routes, access requirements, API server, admin CLI, fleet) 123 of 123, `run-33-1-int.log` 33 of 33.

### Mutation controls

| Control | Mutation | Result |
| --- | --- | --- |
| Pending list (`mut-33-1-1.log`) | the in-memory `pendingTokens` ignores the token state | tests 78, fail 5, among them "the list leaves out used, expired, and revoked tokens" and "the pending tokens are listed by identifier after a cursor, without used, expired, or revoked ones" |
| Re-redaction (`mut-33-1-2.log`) | `FleetApi.listWorkers` returns the view without `printableWorkerAdmission` | tests 10, fail 1: "the workers view lists the enrolled workers in identifier order with every detail redacted again" |
| Used token (`mut-33-1-3.log`) | the PostgreSQL `revokeToken` revokes a used token | tests 46, fail 1: "PostgreSQL fleet registry: a token revocation applies once, repeats, and refuses a used or rotated token" |

Each mutation was restored and its `dist` rebuilt; `git status` showed no change.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| Focused fleet, PostgreSQL, route, and composition runs | `9f649f84` | Listed under "Fail-before": all pass |
| `make verify` run 1 (`verify-33-1-1.log`) | `0cc99e5b`, clean | Failed in `check:boundaries` before any test: `tsc -p tsconfig.check.json` rejected the five `ApiServices` fixtures of `api-server.test.ts` without `fleet` and two result types in `enrollment-token-service.test.ts`; fixed in the `test:` commit after `0cc99e5b`, which the route of the next commit covers |
| `make verify` run 2 (`verify-33-1-2.log`) | `91352dd7`, tree `9b30b5f2`, clean | Passed, profile full, stamp written: tests 4833, pass 4824, fail 0, skipped 9; all files 99.45 % lines, 92.85 % branches, 98.87 % functions. `make record` refused the log because the subagent's wrapper appended an `exit 0` line after the stamp line, so the log was left as it is and the run repeated |
| `make verify` run 3 (`verify-33-1-3.log`) | `91352dd7`, tree `9b30b5f2`, clean | Passed, profile full, stamp written, logged with the brief's plain redirection: tests 4833, pass 4824, fail 0, skipped 9; recorded below |

No run hit the known flakes (`installation-script` base-ten bound, `web-app.test.ts:279`).

### Coverage

Per-file coverage of the changed `dist` files in `make verify` run 3 (lines, branches, functions):

| File | Lines | Branches | Functions | Note |
| --- | --- | --- | --- | --- |
| `apps/control-plane/dist/api/fleet-api.js` | 100 % | 91.18 % | 100 % | New |
| `apps/control-plane/dist/api/routes.js` | 100 % | 100 % | 100 % | |
| `apps/control-plane/dist/api/control-plane-api.js` | 97.47 % | 87.43 % | 97.06 % | The uncovered lines predate the change |
| `apps/control-plane/dist/api/project-api.js` | 100 % | 90.67 % | 100 % | |
| `apps/control-plane/dist/application/worker-admission-view.js` | 100 % | 100 % | 100 % | New |
| `apps/control-plane/dist/admin/admin-main.js` | 95.32 % | 91.67 % | 84.62 % | Only the import moved |
| `apps/control-plane/dist/composition/control-plane.js` | 98.40 % | 75.76 % | 90.91 % | Uncovered lines 70-72 and 250-252 predate the change |
| `packages/modules/fleet/dist/domain/enrollment.js` | 100 % | 100 % | 100 % | |
| `packages/modules/fleet/dist/application/enrollment-token-service.js` | 100 % | 80.95 % | 100 % | New; the uncovered branches are `??` defaults of the dependencies |
| `packages/modules/fleet/dist/application/enrollment-service.js` | 99.60 % | 81.44 % | 100 % | |
| `packages/modules/fleet/dist/adapters/in-memory-fleet.js` | 100 % | 99.30 % | 100 % | |
| `packages/modules/fleet/dist/ports/fleet-conformance.js` | 99.11 % | 86.42 % | 100 % | Lines 540-544: in the conformance race both adapters let the revocation win; the redemption-first order is covered by the service test and the PostgreSQL row-lock test |
| `packages/adapters/postgres/dist/fleet-repositories.js` | 100 % | 97.59 % | 100 % | |
| `packages/adapters/postgres/dist/committing-repositories.js` | 100 % | 99.39 % | 100 % | |
| `packages/adapters/secrets/dist/node-secrets.js` | 100 % | 100 % | 100 % | |

### Route

`route.json` (rule version 5) at `0cc99e5b`: elevated; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees (P(third) 0.75). Reviews run at effort medium (owner decision 2026-11-02); the coordinator assigns the reviewers. The typecheck fix after it changed the diff, so `route.json` was deleted (`cced19bf`) and routed again at `cced19bf` and committed unedited (`91352dd7`): again elevated, rule version 5, the same reviewers; the shadow router `jev-1.14.0` timed out on that run, so the rule decided alone, as the route records.

## Deviations

1. `afterOf` of `project-api.ts` is exported and reused by `FleetApi`; `scm-integration-api.ts` keeps its own copy, named below.
2. `WorkerAdmissionEntry.results` is cast to the wire `SelfCheckResult` union in `fleet-api.ts`, because the domain result is not a discriminated union; `successResponse` checks the body against the schema before it leaves.

## Follow-ups

- Audit of the enrollment token commands (issue, revoke, rotate) as administrative invocations (coordinator decision Q4).
- The installation contract section 5, check 1, entry for a revoked token belongs to item 26c (wire contracts section 12).
- `afterOf` is duplicated in `scm-integration-api.ts`; a later change can import the exported one.
- The reachability and capacity fields of the workers view stay as the contract declares them; nothing in this change reads them.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `9b30b5f218489b6a5105669918549dd21849fea5`; tests 4833, pass 4824, fail 0, skipped 9; all files 99.45% lines, 92.84% branches, 98.88% functions.
- `npm run openspec -- validate serve-workers-and-enrollment-tokens --strict`: passed, `Change 'serve-workers-and-enrollment-tokens' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 120 file(s); every pass summary file is valid: 100 file(s); every route file is valid: 53 file(s).`.
- Spec diff against the merge base `79fb71308766` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Remaining gates

The independent review passes (task 4.1), the archive (task 4.2), and the integration into `dev` by the coordinator.
