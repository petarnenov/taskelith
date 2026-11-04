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
- `af641297` `docs: record the review route of the audit scm integration changes change` (`route.json` unedited): the tree that `make verify` run 1 checked; `175783a7` and `c50b5e2a` add the `make record` output and this record.
- Coordinator decisions before pass 1 (Niki, 2026-11-04): `595ac1f5` `test: expect scm integration secrets named secrets.<name> in the audit` and `eaec2e61` `chore: name scm integration secrets secrets.<name> in the audit` (Q-1); `c0696a98` `chore: start the scm integration services from one ports object` (Q-3); `5c44de22` `test: refuse an scm integration command without a principal as internal`; `c43300f5` `docs: state the secrets.<name> audit names, the recorded plugin, and the string actor` (Q-1, Q-2, and the actor in `design.md`, the `scm-port` delta, and wire contracts section 4).
- `53838bef` `docs: record the review route of the audit scm integration changes change after the pre-review fixes` (`route.json` deleted and written again, unedited): the tree that `make verify` run 2 checked; `279d0e4e` adds the `make record` output, and the commit after it this record.
- Merge of `origin/dev` `fa3fbce7` (20d #437), merge commit `7716fd87`: 20d `9f4e88ed` renames `readResult` to `readUntrustedResult` in `untrusted-shapes.ts`, `conformance-case.ts`, `index.ts`, and the copy of `pluginAnswer` in `repository-binding-service.ts`, which this branch had moved, with `pluginDefect` and `asProvider`, into `application/plugin-answer.ts` and joined with `pluginMember`. The one conflict, in `repository-binding-service.ts`, keeps this branch's import from `plugin-answer.ts` and drops dev's copies of `ReportedDefect`, `DefectOfCall`, `pluginAnswer`, and `asProvider`; `plugin-answer.ts` takes 20d's name `readUntrustedResult`, so the helpers have one home and no `readResult` remains in the module. Every other file merged without a conflict. After the merge: `npx tsc -p tsconfig.check.json` clean, and the integrations, `scm-github`, and control-plane SCM tests 329 of 329.
- Webhook plugin boundary (coordinator request after pass 2, Niki, 2026-11-04): `940957a5` `test: expect the webhook receiver to keep plugin verification defects inside the plugin boundary`; `fb-11b2-p2b-1.log`: tests 33, pass 23, fail 10 (eight service cases of four misbehaviours of the provider's and the decoy's `verifyWebhookDelivery`, the eventless rule case, and the HTTP test, which got 500 with the secret in its message for 401). `ad9f8aff` `chore: keep webhook verification and the eventless rule inside the scm plugin boundary`: `ScmWebhookReceiver` calls `verifyWebhookDelivery` of the provider and of the decoy through `pluginAnswer` with `readWebhookEvent`, and `isEventless` through `pluginMember`; a defect is one `scm.plugin.defect` record of operation `verifyWebhookDelivery` or `isEventless` under the receiver's new `pluginId` and `defects` ports, then the decoy's verification and the one 401, so a defect, a bad signature, and an unknown integration answer the same status, headers other than `date` and `x-correlation-id`, and body (the HTTP test "a plugin defect, a bad signature, and an unknown integration answer byte-equal 401s"); a decoy defect names no integration. An event in another shape is now such a defect and the one 401, not a 500 `internal`. Mutation control `fb-11b2-p2b-2.log`: without the decoy's verification after a defect, 6 of 33 fail. `after-11b2-p2b-1.log`: 338 of 338.
- Plugin failure text (coordinator decision after pass 2, Niki, 2026-11-04): every plugin failure that the SCM integration service, the repository binding service, or the webhook receiver passes to a client keeps its code with a fixed message, never the plugin's message or details. `be1b964f` `test: expect every plugin failure of the scm integration paths without its message or a quoted secret`: for every kernel failure code, a plugin failure whose message and details quote a known secret, and an assertion that the secret is in neither the answer nor the captured log. `fb-11b2-p2c-1.log` (module receiver): tests 16, pass 15, fail 1; `fb-11b2-p2c-2.log` (HTTP checks and webhook): tests 2, pass 1, fail 1, the webhook's `not-found` refusal answered with the secret in its message and details; `fb-11b2-p2c-3.log` (HTTP binding resolver and provider build): tests 1, pass 1. The checks and the binding already answered fixed messages, so mutation controls show those tests fail for their behavior: `mut-11b2-p2c-1.log`, a `checkSecret` refusal and a resolver refusal passed through unchanged, tests 3, fail 2; `mut-11b2-p2c-2.log`, a `createProvider` refusal passed through unchanged, tests 1, fail 1. `f016ac20` `chore: answer every scm webhook verification refusal with a fixed message and no plugin details`: a refusal other than `forbidden` and `invalid` keeps its code with a fixed message per code and no details. `5c546e03` states it in wire contracts sections 4 and 5. `after-11b2-p2c-1.log`: the module and the SCM HTTP tests 259 of 259.

## Environment

A 2020 Intel iMac, macOS 26.6.2 (Darwin 25.6.0, x86_64), Docker 29.5.2, Node.js v24.22.1, the `.nvmrc` pin. The focused PostgreSQL runs used `scripts/docker-slot.ts run -- bash scripts/services.sh run taskelith-audit11b2 ...`.

## Author self-check

- Scope: only the brief's step 2 items and the coordinator's decisions before pass 1. `git diff --shortstat 2700c16a 53838bef -- '*.ts' '*.sql'`: 27 files, 780 insertions, 126 deletions; all files: 40 files, 1239 insertions, 127 deletions. The decisions before pass 1 alone (`c50b5e2a..53838bef`, `*.ts`): 9 files, 70 insertions, 18 deletions.
- Coordinator decisions, each with its test:
  - Table: `scm_integration_audit_events` with the identity `position`, the foreign key, the kind check, `changed_fields text[]`, the revision, and the `refuse_audit_change()` trigger; the migration test "the SCM integration audit migration keeps immutable rows of known kinds for stored integrations, and its down migration removes them" refuses an unknown kind, a missing integration, an update, and a delete, and its down migration keeps `scm_integrations` and the shared function. No column holds a value.
  - Q1 same transaction: `ScmIntegrations.add` and `update` take a `ScmIntegrationAuditEntry`; the store computes the changed fields from its before-state (`changeAudit` and `creationAudit` in `ports/scm-integration-audit.ts`). PostgreSQL appends through `tx.scmIntegrationAudit` in the existing SERIALIZABLE write transaction; "an update whose audit row the table refuses rolls back with the integration, its secrets, and its revision intact" writes the row through a double with a kind outside the check and shows that neither the update nor a creation is kept. In memory, the row is staged inside `exclusive()`, then published with the integration in one synchronous step; "in memory, a refused audit row fails the creation or update and keeps nothing of it" checks it. `SCM_INTEGRATION_AUDIT_CONFORMANCE` (8 cases) runs against both adapters; `trail` is in position order.
  - Q2 actor and reason: the handlers pass the request's `principalId` and `control-plane API createScmIntegration` or `updateScmIntegration`; the route test "each committed create and update is audited with the caller as actor and its operation as reason" checks the operator bearer and a browser session. The module keeps the actor a string, so it does not depend on `@taskelith/access`.
  - Q3 changed fields: on create `pluginId`, `label`, `allowedOrigin`, `settings.<key>`, and `secrets.<name>` for each secret; on update `label`, `allowedOrigin`, and each `settings.<key>` of the old or new settings whose value differs, then `secrets.<name>` for each name in the update's `secrets`. The conformance case "a secret is named secrets.<name>, so a secret named label stays apart from the label field" creates an integration with a secret named `label`, replaces only it, then renames the label, and expects `secrets.label`, `secret-changed`, and then `label`. No secret value is compared, decrypted, or hashed (`design.md` decision 4); the conformance case "an update that names only secrets, or unchanged fields beside them, is secret-changed, also with the stored value sent again" sends the stored value again and expects `secret-changed`.
  - Q4 one row per update: `secret-changed` only when secrets alone changed, otherwise `updated` with the secret names (conformance and route tests).
  - Q5 no-op: `updated` with no changed field (conformance case).
  - Q6 refusals: no row for 400, 403, 404, or 409 (route test "a refused create or update, 400, 403, 404, or 409, writes no audit row", the service test, and the conformance case for `conflict` and `not-found`).
  - Q7 revision and time: the row records the new revision; the clock is a port of `ScmIntegrationService`, which `startScmIntegrationServices` takes from the composition.
  - Q8 spec: the `control-plane-api` requirement "Request logs without secrets" is MODIFIED with its scenario kept and one scenario added.
  - Q9 redaction: the route test "no secret value of a create, an update, or a secret change reaches the request log or the audit trail" captures the request log and reads the in-memory trail; the PostgreSQL test "the audit rows hold the field and secret names, the actor, and the reason, and no secret value" reads the rows with SQL. The audit write logs nothing.
- Edits of existing tests: the store conformance suites and every caller of `add` and `update` pass an audit entry; `scm-integration-start.test.ts` passes the clock; `migrations.integration.test.ts` adds the migration to its lists, holds it back where it holds back `1792934300000_project-repository-bindings`, and takes it down first where an earlier down migration drops `scm_integrations`; the PostgreSQL SCM integration test truncates the audit table.
- Requirement texts, in characters: `control-plane-api` "Request logs without secrets" (MODIFIED) 349, "Audited SCM integration commands" 281; `postgres-state` "SCM integration audit table" 415, "SCM integration audit in the change's transaction" 170; `scm-port` "SCM integration audit" 475 (445 before Q-1), "Secret values outside the audit" 197.
- Hexagonal boundaries: `npm run check:boundaries` passes. Commit types: `chore`, `test`, and `docs`, with no AI attribution. Comments: `npm run verify:comments` passes. Only synthetic secrets are used.
- Coordinator decisions before pass 1 (Niki, 2026-11-04), on the deviations that run 1 reported:
  - Q-1: secret names carry the `secrets.` prefix, symmetric with `settings.<key>`, in `creationAudit` and `changeAudit`, which both adapters use; the conformance, service, route, and PostgreSQL tests expect it, and the new conformance case covers a secret named `label`.
  - Q-2: a creation keeps naming `pluginId`; `design.md` decision 4 states it.
  - Q-3: `startScmIntegrationServices` takes one `ScmIntegrationStartPorts` object (`namespace`, `database`, `projects`, `clock`) and the logger, as `scmIntegrationServices` takes `ScmIntegrationPorts`; the composition and the start test pass it, with no change of behavior.
  - The missing-principal `internal` branch of `scm-integration-api.ts` has the test "a create or update handler without a principal fails as internal and never reaches the service".
  - The actor stays a `string`, not `PrincipalId`, because `@taskelith/integrations` does not depend on `@taskelith/access`; `design.md` decision 3 states it. The API passes the `PrincipalId`.

## Fail-before

Each behavior's tests were committed before its implementation and run with `node --experimental-strip-types --test`; the logs are in the session scratchpad (`fb-11b2-<n>.log`, `after-11b2-<n>.log`, `mut-11b2-<n>.log`).

- Module (`f949158c`): the build failed (`TS2307` for the missing `scm-integration-audit.js`, `TS2554` for the third argument), so every one of the 15 module test files failed to load (`fb-11b2-1.log`: tests 15, pass 0, fail 15). After `e851454d`: 171 of 171 pass.
- PostgreSQL (`7038a1ce`): `scm-integrations.integration.test.ts` failed to load (`PostgresScmIntegrationAudit` not exported), and 16 migration tests failed on the missing migration (`fb-11b2-2.log`: tests 62, pass 45, fail 17). After `c92df7af`: 82 of 82 pass.
- HTTP (`7166de8a`): the control-plane build failed (`TS2554`, `TS2345`), so the three route and start files failed to load (`fb-11b2-3.log`: tests 3, fail 3). After `fe3159b2`: the route, start, binding route, webhook, access requirement, and API server tests 76 of 76 pass.

- Q-1 (`595ac1f5`): the module audit conformance, service, and route tests failed on the bare secret names, the new `label` case among them (`fb-11b2-pre-1.log`: tests 185, pass 175, fail 10). After `eaec2e61`: 185 of 185 pass (`after-11b2-pre-1.log`).
- Q-3 (`c0696a98`) changes no behavior; the start tests pass (`after-11b2-pre-2.log`: tests 3, pass 3).
- Missing principal (`5c44de22`): the branch existed, so the test passes on the implementation (`after-11b2-pre-3.log`: 1 of 1); its mutation control, `invocationOf` without the principal check and with the actor `principalId ?? 'anonymous'`, fails it (`fb-11b2-pre-2.log`: tests 1, fail 1).

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
| `make verify` (run 3, after the pass 1 fixes) | `9c977d5d`, tree `e9f6e5f8`, clean; recorded by `3c236c67` | Passed, profile full, stamp written: tests 4711, pass 4702, fail 0, skipped 9; all files 99.44 % lines, 92.80 % branches, 98.86 % functions. No rerun |
| `make verify` (run 2) | `53838bef`, tree `fc5a74ff`, clean | Passed, profile full, stamp written: tests 4704, suites 50, pass 4695, fail 0, cancelled 0, skipped 9; all files 99.44 % lines, 92.79 % branches, 98.86 % functions; `scm-integration-api.js` 87.50 % branches (75 % in run 1), the composition `scm-integrations.js` 83.33 % branches, `scm-integration-audit-conformance.js` 90 % branches, the other changed files as in run 1. No rerun |
| `make verify` (run 1) | `af641297`, tree `5be7372b`, clean | Passed, profile full, stamp written: tests 4701, suites 50, pass 4692, fail 0, cancelled 0, skipped 9; all files 99.44 % lines, 92.76 % branches, 98.86 % functions; new and changed files 100 % lines; branches: module `scm-integration-audit.js` and `in-memory-scm-integration-audit.js` 100 %, `scm-integration-audit-conformance.js` 89.47 %, postgres `scm-integration-audit.js` 100 %, postgres `scm-integrations.js` 94.92 %, `scm-integration-api.js` 75 %; functions: `in-memory-scm-integrations.js` 93.33 %, the others 100 %. No rerun |
| `npm run openspec -- validate audit-scm-integration-changes --strict` | `9cbbef55`, again at `c43300f5` | `Change 'audit-scm-integration-changes' is valid` |
| `npm run verify:archive`, inside runs 1 and 2 | trees `5be7372b` and `fc5a74ff` | `Every active OpenSpec change archives into strictly valid specs.` |

verify-11b2-p2c failed only in verify:dependencies because node_modules predated the dev merge's lockfile (@octokit/plugin-paginate-rest 15.0.0 vs 16.0.0); make setup reinstalled them and the rerun passed.

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees (P(third) 0.71; 0.73 after the decisions before pass 1, with the same tier and reviewers). Reviews run at effort medium (owner decision 2026-11-02), although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `f5d0453fe47e3818bdc59b6cbea55af979ec3808`; tests 4769, pass 4760, fail 0, skipped 9; all files 99.45% lines, 92.83% branches, 98.87% functions.
- `npm run openspec -- validate audit-scm-integration-changes --strict`: passed, `Change 'audit-scm-integration-changes' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 114 file(s); every pass summary file is valid: 94 file(s); every route file is valid: 47 file(s).`.
- Spec diff against the merge base `fa3fbce73c99` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a3ed-9608-71b3-8fe3-6fce07b0ddca` | 0 | 1 | 2 | 1 |
| 2 | B | `claude claude-fable-5-1#medium` | `62bc5f56-1273-4480-937c-f72e50b41d3c` | 0 | 0 | 1 | 8 |
<!-- make record: end -->

## Review

### Pass 1

- Reviewer: Codex CLI, model `gpt-6-astra`, effort `medium`, role A, read-only.
- Invocation: `env -u JEV_MAF_LAB make review CHANGE=audit-scm-integration-changes PASS=1 REVIEWER='codex gpt-6-astra#medium' PROMPT=<scratchpad prompt> LOG=<scratchpad log>`; the reviewer reported model `gpt-6-astra` and session `01a1a3ed-9608-71b3-8fe3-6fce07b0ddca`.
- Reviewed `2700c16a..f2fa35ee`; the snapshot (`5a5459a6…`) was unchanged after the pass.
- Counts: Critical 0, High 1, Medium 2, Low 1, recorded in `passes.jsonl` and `findings.jsonl` (`8278862e`). H1 and M2 concern the 20f service code that this change's requirement extends; the coordinator (Niki, 2026-11-04) put both in scope. Every finding is fixed; pass 2 checks the fixes.

| # | Severity | Finding | Test (fail-before) | Fix |
| --- | --- | --- | --- | --- |
| H1 | High | `checkSettings` and `checkSecret` and their result envelopes had no exception boundary, so a plugin's thrown message reached the 500 answer | `7be13fe5`; `fb-11b2-p1-1.log`: tests 31, pass 29, fail 2 (the service test of four misbehaviours of each check on create and update, and the HTTP test that checks the answer, the log records, and the audit trail) | `91d6008e`: `pluginAnswer` and `pluginDefect` move unchanged from `repository-binding-service.ts` into `application/plugin-answer.ts`, which both services use, so the two boundaries cannot drift; each check's envelope is read once inside the `try`; a throw, a throwing getter, or a bad envelope is the fixed `internal` failure and one `scm.plugin.defect` record through `ScmPluginDefects`, whose `ScmPluginOperation` adds `checkSettings` and `checkSecret`; a creation mints its identifier before the checks so the record names it. `after-11b2-p1-1.log`: 201 of 201 |
| M2 | Medium | A plugin-controlled `details.setting` was copied into the public failure, so a setting value or free text could be quoted | `bb2e5c97`; `fb-11b2-p1-2.log`: tests 19, pass 17, fail 2 (a reported value; and a missing setting on create, which the existing case now expects as `settings`) | `a641b00d`: a reported setting is kept only when the request or the integration holds that name, otherwise `settings`; an update keeps naming a held setting that the request drops; malformed details are the plugin defect; wire contracts section 4 says so. `after-11b2-p1-2.log`: 204 of 204 |
| M3 | Medium | The in-memory store published the audit row before the integration, so a reader between them saw one without the other | `7ed7fd15`; `fb-11b2-p1-3.log`: tests 10, pass 9, fail 1 (the torn reads `[undefined, 1]` and `[1, 2]`) | `552465c6`: `InMemoryScmIntegrationAudit.stage` accepts a row without showing it, and the store publishes it and the integration in one synchronous step, as the access store replaces its state on commit; the test reads the store and the trail after every microtask of a create and an update, with no sleep. `after-11b2-p1-3.log`: 48 of 48 |
| L4 | Low | The PostgreSQL retry tests did not show that an attempt which appended its audit row leaves no duplicate | Test only, `149d0c7a`: the gated race asserts the rows `created` 1 and `updated` 2, and a new test throws a serialization failure (`40001`) after the append and before the commit and expects one `updated` row after the retry (`after-11b2-p1-4.log`: 23 of 23); negative control `fb-11b2-p1-4.log`: with the update's append in a second transaction, tests 23, fail 2 (the new test, with 4 attempts, and the read-only transaction test) | `149d0c7a` |

- Follow-up of 11b1 "Audit other control-plane reads of plugin results (20f integration operations, the credential issue) for throwing getters": pass 2 found the 20f part only partly done; see pass 2 below.

### Pass 2

- Reviewer: Claude Code, model `claude-fable-5-1`, effort `medium`, role B, read-only.
- Invocation: `env -u JEV_MAF_LAB make review CHANGE=audit-scm-integration-changes PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium' PROMPT=<scratchpad prompt> LOG=<scratchpad log>`; the reviewer reported model `claude-fable-5-1` and session `62bc5f56-1273-4480-937c-f72e50b41d3c`.
- Reviewed `2700c16a..3c236c67`; the snapshot was unchanged after the pass. The pass found the four pass 1 fixes correct and complete.
- Counts: Critical 0, High 0, Medium 1, Low 8, recorded in `passes.jsonl` and `findings.jsonl`. Because of M1, pass 3 reviews these fixes. L2, L4, and L6 name pass 1 in `missedBy`.

| # | Severity | Finding | Test (fail-before) | Resolution |
| --- | --- | --- | --- | --- |
| M1 | Medium | The record called the 20f follow-up done, while `StoredScmIntegrationVerifiers` called `createProvider` with the revealed secrets outside any boundary, so a throw quoting a secret reached the webhook's 500 | `939f0f3e`; `fb-11b2-p2-1.log`: tests 2, fail 2 (the service test of four misbehaviours, and the HTTP test, which got 500 for 401) | `74ad73a7`: the verifiers build the provider through `pluginAnswer` with `asProvider`, which moves unchanged from the binding service into `plugin-answer.ts`; a defect is one `scm.plugin.defect` record of operation `createProvider`, naming the stored plugin, and the one 401, cached by revision and not also reported as unverifiable; the composition passes `pluginDefectLog`. `after-11b2-p2-1.log`: 81 of 81 |
| L1 | Low | Stale wording after M3 | Docs only | `design.md` decision 2 and the self-check above say the row is staged, then published with the integration in one synchronous step |
| L2 | Low | A dead branch for a refused append in the PostgreSQL store | No behaviour change; the PostgreSQL store, rollback, and retry tests of `make verify` cover it | `3614ebd8`: `PostgresScmIntegrationAuditRecords` fails only by throwing and answers no result; `PostgresScmIntegrationAudit` wraps it |
| L3 | Low | A create missing a required setting answers `settings`, since the plugin port declares no setting names | None | Deferred: `design.md` decision 10 records the coordinator's decision and its reason; adding `settingNames` to the plugin port touches every plugin and test double, so it is a follow-up |
| L4 | Low | `plugin.id`, `plugin.secretNames`, and `pluginOf` were read outside the boundary | `9fb80c14`; `fb-11b2-p2-2.log`: tests 2, fail 2 (the service test of a throwing and a malformed `id` and `secretNames` on create and update, and the registry test, whose second `id` read threw) | `14d6115c`: `pluginMember` reads one member inside the boundary; the service reads `id` and `secretNames` once into plain values before any check, and a defect is one record of the new operation `descriptor`, with the plugin `UNREADABLE_PLUGIN_ID`, `(unreadable)`, when the identifier cannot be read; `singlePlugin` reads the identifier once at registration, so `pluginOf` runs no plugin code. `after-11b2-p2-2.log`: 230 of 230 |
| L5 | Low | A refused create's defect names an identifier that is never stored | Docs only | `0f103b5e`: wire contracts section 4 states it; `design.md` decision 11 records the coordinator's reason |
| L6 | Low | `trail()` is unbounded | Docs only | `0f103b5e`: `design.md` decision 13 |
| L7 | Low | The snapshot loop would hang on a write that waits on a macrotask | Probe `fb-11b2-p2-7.log`: a write on a 0 ms timer spun for 38.7 s until the process failed with `Map maximum size exceeded` without the cap, and failed in 34 ms with it | `987cf5e5`: the loop fails after 10000 microtasks. `after-11b2-p2-7.log`: 10 of 10 |
| L8 | Low | The checks table lacked run 3 | Docs only | The run 3 row above |

- Fixes after pass 2 that pass 3 reviews, with those in the table above: the webhook plugin boundary (`940957a5`, `ad9f8aff`) and the fixed messages of plugin failures (`be1b964f`, `f016ac20`, `5c546e03`), both in the revision list above.
- Coordinator decisions after pass 2 (Niki, 2026-11-04): `design.md` decisions 10 (a missing setting on create answers `settings`) and 11 (a refused create consumes an identifier), each with its reason, and decision 12 (the plugin boundary of the descriptor and the verifier).
- Follow-up of 11b1, 20f part: the checks (H1), the descriptor (L4), the provider build of webhook verification (M1), and, after pass 2, every per-request plugin call of the webhook receiver, `verifyWebhookDelivery` of the provider and of the decoy, its result envelope, and `isEventless` (`ad9f8aff`), now run inside the boundary. Still outside it, and kept as a follow-up: `createDecoy` and the plugin `id` reads of the registry and the receiver, which run once at start, not per request. The credential issue part stays open (item 21).
- Flaky test outside the change (coordinator request): one full run of another worker answered 503 for 200 in `repository-binding-routes.test.ts` (the test at line 269 of `2700c16a`). Cause: its fixture logged in five browsers at once from one address, and the login throttle answers 503 beyond 4 pending attempts per source address (`LOGIN_THROTTLE.pendingPerSource`), so under load the fifth login failed in `browser()`. Reproduced: 20 runs, 5 at a time, passed (`flake-11b1-269-before-*.log`); 20 runs at once failed 9 of 20 with `503 !== 200` at `Promise.all (index 4)` (`flake-11b1-269-load-*.log`). `09fa7974` logs in one browser at a time; 20 runs at once then passed 20 of 20 (`flake-11b1-269-after-*.log`).

## Limitations

- Follow-up: the webhook receiver reports a defect under the composition's one `pluginId`; with several plugins, that may not be the plugin of the known integration whose verifier failed (today's composition has one plugin).
- Follow-up: `receiveScmWebhook` declares no 404, 409, or 422, so a verification refusal of `not-found`, `conflict`, or `precondition-failed` answers 500 with that code in its body; the source control contract names no codes that `verifyWebhookDelivery` may answer, so whether other codes are a plugin defect is open.
- The audit trail has no read operation and no UI; only tests read it.
- The table has no retention rule, as the other audit tables have none.
- A handler without a principal answers `internal`; the server always sets one for these operations, so only a direct handler test reaches that branch.

## Remaining gates

- Review pass 3, Antigravity CLI `gemini-4-argon-medium`, role A, which reviews the pass 2 fixes, because pass 2 reported a Medium finding.
- Architect check by the coordinator of any fix that no later pass reviews.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
