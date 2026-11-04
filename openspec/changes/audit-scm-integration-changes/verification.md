# Verification: audit-scm-integration-changes

## Scope and source

G3 plan item 11 (`docs/g3-plan.md`, row 11), sub-change 11b2, which the coordinator (Niki) split from 11b on 2026-11-03, developed by a briefed subagent from `dev` `2700c16a` (#436): one immutable audit row for each committed creation and update of an SCM integration, in migration `1792934400000_scm-integration-audit-events`; the `ScmIntegrationAudit` port with its conformance suite and in-memory and PostgreSQL adapters; the audit entry of the store's `add` and `update`, written in the change's own transaction; the caller's principal as the actor and `control-plane API <operationId>` as the reason; the clock injected by the composition; the changed field names decided without any secret value; and the control-plane requirement that names SCM integration secret values. The coordinator's decisions of 2026-11-04 (the table and Q1 to Q9) are in `design.md`. Excluded, as the brief lists: reading the audit trail through the API, and any UI.

## Revision

- Base: `dev` `2700c16a`; the brief's checklist was saved with `--at 2700c16a4620abc0ed0fdd76061110ace3afa341 --size S-M`.
- `9cbbef55` `docs: create the audit scm integration changes change` (proposal, design, deltas, tasks, checklist, empty `findings.jsonl` and `passes.jsonl`).
- Module: `f949158c` `test: specify the scm integration audit port, its conformance, and the audited service`, `706e13eb` `test: pass an audit entry to the integration update of the binding race test` (a call site the first test commit missed), `e851454d` `chore: audit scm integration creations and updates in the store's transaction`.
- PostgreSQL: `7038a1ce` `test: specify the scm integration audit table and its write in the postgresql store's transaction`, `88857677` `test: expect the thrown check violation of a refused scm integration audit row` (a check violation throws after the rollback, as every statement error other than a unique violation does, so the rollback test expects the rejection), `c92df7af` `chore: store scm integration audit events in postgresql in the change's transaction`.
- HTTP: `7166de8a` `test: specify the audited scm integration routes, their refusals, and their redaction`, `fe3159b2` `chore: audit scm integration commands with the caller and the composition clock`.
- `4e30533b` `docs: state the scm integration audit in the control-plane wire contracts`; `dabca4d3` ticks tasks 2.1 to 2.4.
- `af641297` `docs: record the review route of the audit scm integration changes change` (`route.json` unedited): the tree that `make verify` run 1 checked; the commits after it add this record and the `make record` output.

## Environment

A 2020 Intel iMac, macOS 26.6.2 (Darwin 25.6.0, x86_64), Docker 29.5.2, Node.js v24.22.1, the `.nvmrc` pin. The focused PostgreSQL runs used `scripts/docker-slot.ts run -- bash scripts/services.sh run taskelith-audit11b2 ...`.

## Author self-check

- Scope: only the brief's step 2 items. `git diff --shortstat 2700c16a af641297 -- '*.ts' '*.sql'`: 26 files, 727 insertions, 125 deletions; all files: 39 files, 1077 insertions, 126 deletions.
- Coordinator decisions, each with its test:
  - Table: `scm_integration_audit_events` with the identity `position`, the foreign key, the kind check, `changed_fields text[]`, the revision, and the `refuse_audit_change()` trigger; the migration test "the SCM integration audit migration keeps immutable rows of known kinds for stored integrations, and its down migration removes them" refuses an unknown kind, a missing integration, an update, and a delete, and its down migration keeps `scm_integrations` and the shared function. No column holds a value.
  - Q1 same transaction: `ScmIntegrations.add` and `update` take a `ScmIntegrationAuditEntry`; the store computes the changed fields from its before-state (`changeAudit` and `creationAudit` in `ports/scm-integration-audit.ts`). PostgreSQL appends through `tx.scmIntegrationAudit` in the existing SERIALIZABLE write transaction; "an update whose audit row the table refuses rolls back with the integration, its secrets, and its revision intact" writes the row through a double with a kind outside the check and shows that neither the update nor a creation is kept. In memory, the row is appended inside `exclusive()` before the integration is kept; "in memory, a refused audit row fails the creation or update and keeps nothing of it" checks it. `SCM_INTEGRATION_AUDIT_CONFORMANCE` (7 cases) runs against both adapters; `trail` is in position order.
  - Q2 actor and reason: the handlers pass the request's `principalId` and `control-plane API createScmIntegration` or `updateScmIntegration`; the route test "each committed create and update is audited with the caller as actor and its operation as reason" checks the operator bearer and a browser session. The module keeps the actor a string, so it does not depend on `@taskelith/access`.
  - Q3 changed fields: on create `pluginId`, `label`, `allowedOrigin`, `settings.<key>`, and the secret names; on update `label`, `allowedOrigin`, and each `settings.<key>` of the old or new settings whose value differs, then the names in the update's `secrets`. No secret value is compared, decrypted, or hashed (`design.md` decision 4); the conformance case "an update that names only secrets, or unchanged fields beside them, is secret-changed, also with the stored value sent again" sends the stored value again and expects `secret-changed`.
  - Q4 one row per update: `secret-changed` only when secrets alone changed, otherwise `updated` with the secret names (conformance and route tests).
  - Q5 no-op: `updated` with no changed field (conformance case).
  - Q6 refusals: no row for 400, 403, 404, or 409 (route test "a refused create or update, 400, 403, 404, or 409, writes no audit row", the service test, and the conformance case for `conflict` and `not-found`).
  - Q7 revision and time: the row records the new revision; the clock is a port of `ScmIntegrationService`, which `startScmIntegrationServices` takes from the composition.
  - Q8 spec: the `control-plane-api` requirement "Request logs without secrets" is MODIFIED with its scenario kept and one scenario added.
  - Q9 redaction: the route test "no secret value of a create, an update, or a secret change reaches the request log or the audit trail" captures the request log and reads the in-memory trail; the PostgreSQL test "the audit rows hold the field and secret names, the actor, and the reason, and no secret value" reads the rows with SQL. The audit write logs nothing.
- Edits of existing tests: the store conformance suites and every caller of `add` and `update` pass an audit entry; `scm-integration-start.test.ts` passes the clock; `migrations.integration.test.ts` adds the migration to its lists, holds it back where it holds back `1792934300000_project-repository-bindings`, and takes it down first where an earlier down migration drops `scm_integrations`; the PostgreSQL SCM integration test truncates the audit table.
- Requirement texts, in characters: `control-plane-api` "Request logs without secrets" (MODIFIED) 349, "Audited SCM integration commands" 281; `postgres-state` "SCM integration audit table" 415, "SCM integration audit in the change's transaction" 170; `scm-port` "SCM integration audit" 445, "Secret values outside the audit" 197.
- Hexagonal boundaries: `npm run check:boundaries` passes. Commit types: `chore`, `test`, and `docs`, with no AI attribution. Comments: `npm run verify:comments` passes. Only synthetic secrets are used.
- Deviations, for the coordinator: the `ScmIntegrationAuditEntry` actor is a `string`, not `PrincipalId`, because `@taskelith/integrations` does not depend on `@taskelith/access`; the API passes the `PrincipalId`. A creation also names `pluginId`, a supplied field. Secret names are recorded bare, as the decision states, beside the `settings.` prefix of settings. `startScmIntegrationServices` takes the clock as a fifth positional parameter.

## Fail-before

Each behavior's tests were committed before its implementation and run with `node --experimental-strip-types --test`; the logs are in the session scratchpad (`fb-11b2-<n>.log`, `after-11b2-<n>.log`, `mut-11b2-<n>.log`).

- Module (`f949158c`): the build failed (`TS2307` for the missing `scm-integration-audit.js`, `TS2554` for the third argument), so every one of the 15 module test files failed to load (`fb-11b2-1.log`: tests 15, pass 0, fail 15). After `e851454d`: 171 of 171 pass.
- PostgreSQL (`7038a1ce`): `scm-integrations.integration.test.ts` failed to load (`PostgresScmIntegrationAudit` not exported), and 16 migration tests failed on the missing migration (`fb-11b2-2.log`: tests 62, pass 45, fail 17). After `c92df7af`: 82 of 82 pass.
- HTTP (`7166de8a`): the control-plane build failed (`TS2554`, `TS2345`), so the three route and start files failed to load (`fb-11b2-3.log`: tests 3, fail 3). After `fe3159b2`: the route, start, binding route, webhook, access requirement, and API server tests 76 of 76 pass.

Because the module and HTTP fail-before runs fail at load, the behavior negative controls below show that each test fails for its behavior.

### Behavior negative controls

Each control applied one mutation to the committed implementation, rebuilt, ran the named tests, and restored the file; `git status` afterwards showed no change.

| Control | Mutation | Tests run | Result with the mutation |
| --- | --- | --- | --- |
| 1 Secret value diffed | in-memory store: a named secret counts only when its value differs from the stored one | module audit conformance and service tests | tests 23, fail 2: the conformance case for a secret sent again and the service audit test |
| 2 Write outside the transaction | in-memory store: the integration is kept before the append | module audit conformance tests | tests 8, fail 1: "in memory, a refused audit row fails the creation or update and keeps nothing of it" |
| 3 No-op skipped | in-memory store: no row without changed fields | module audit conformance tests | tests 8, fail 1: the no-op conformance case |
| 4 Kind | `changeAudit`: always `updated` | module audit conformance tests | tests 8, fail 1: the `secret-changed` conformance case |
| 5 Removed setting | `changeAudit`: only the new settings' keys | module audit conformance tests | tests 8, fail 1: the changed fields conformance case |
| 6 Write outside the transaction | PostgreSQL store: the row is appended in a second transaction after the change commits | `scm-integrations.integration.test.ts` | tests 21, fail 2: the rollback test (the update was kept) and the read-only transaction test |
| 7 Removed trigger | migration: the trigger fires on no update or delete | `migrations.integration.test.ts` | tests 51, fail 1: the audit migration test |
| 8 Old revision | PostgreSQL store: the row records the before-state | `scm-integrations.integration.test.ts` | tests 21, fail 5: four PostgreSQL conformance cases and the SQL row test |
| 9 Fixed actor | handler: the actor `control-plane` | `scm-integration-routes.test.ts` | tests 13, fail 1: the actor and reason route test |
| 10 Secret value in the audit | `changeAudit`: each named secret as `name=value` | `scm-integration-routes.test.ts` | tests 13, fail 2: the actor and reason route test and the redaction route test |

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` (run 1) | `af641297`, tree `5be7372b`, clean | Passed, profile full, stamp written: tests 4701, suites 50, pass 4692, fail 0, cancelled 0, skipped 9; all files 99.44 % lines, 92.76 % branches, 98.86 % functions; new and changed files 100 % lines; branches: module `scm-integration-audit.js` and `in-memory-scm-integration-audit.js` 100 %, `scm-integration-audit-conformance.js` 89.47 %, postgres `scm-integration-audit.js` 100 %, postgres `scm-integrations.js` 94.92 %, `scm-integration-api.js` 75 %; functions: `in-memory-scm-integrations.js` 93.33 %, the others 100 %. No rerun |
| `npm run openspec -- validate audit-scm-integration-changes --strict` | `9cbbef55` | `Change 'audit-scm-integration-changes' is valid` |
| `npm run verify:archive`, inside run 1 | tree `5be7372b` | `Every active OpenSpec change archives into strictly valid specs.` |

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees (P(third) 0.71). Reviews run at effort medium (owner decision 2026-11-02), although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `5be7372b1d618b9f704199e79bc59f311b690ad2`; tests 4701, pass 4692, fail 0, skipped 9; all files 99.44% lines, 92.76% branches, 98.86% functions.
- `npm run openspec -- validate audit-scm-integration-changes --strict`: passed, `Change 'audit-scm-integration-changes' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 113 file(s); every pass summary file is valid: 93 file(s); every route file is valid: 46 file(s).`.
- Spec diff against the merge base `2700c16a4620` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Review

No review pass has run yet.

## Limitations

- The audit trail has no read operation and no UI; only tests read it.
- The table has no retention rule, as the other audit tables have none.
- A handler without a principal answers `internal`; the server always sets one for these operations, so no test reaches that branch, which is why `scm-integration-api.js` has 75 % branches.

## Remaining gates

- Review pass 1, reviewer A, assigned by the coordinator.
- Review pass 2, reviewer B.
- Review pass 3, reviewer A, only after a pass 2 with a Medium or worse finding.
- Architect check by the coordinator of any fix that no later pass reviews.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
