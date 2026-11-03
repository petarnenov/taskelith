# Verification: bind-project-repository

## Scope and source

G3 plan item 11 (`docs/g3-plan.md`, row 11), sub-change 11b1, which the coordinator (Niki) split from 11b on 2026-11-03 (11b2 carries the audit events of SCM integrations), developed by a briefed subagent for the worker Desi from `dev` `634080a0` (#435): `readRepositoryBinding` and `bindRepository` served over a store of their own; the remote URL resolved by the integration's plugin through `resolveRemoteUrl`, so `remoteUrl` is output-only; the resolver failures mapped to the statuses of coordinator decision Q4; the integration revision re-checked inside the store's transaction (Q6); compare-and-set rebinds (Q5); one binding per project in `@taskelith/integrations` with migration `1792934300000_project-repository-bindings` (Q1); the contract break declared as `control-plane.openapi.json` 0.5.0 (Q7) with the regenerated web client; and the wire, source control, and execution contract texts. Excluded, as the brief lists: audit events (11b2), 11c, any UI, live GitHub calls, and the per-run credential issue (item 21).

## Revision

- Base: `dev` `634080a0`; the brief's checklist was saved with `--at 634080a0e3792e5d5c0fb0796e89ed9b1ac5d65c --size M`.
- `117c0a86` `docs: create the bind project repository change` (proposal, design, deltas, tasks, checklist, empty `findings.jsonl` and `passes.jsonl`).
- Contract: `b9295f50` `test: expect an output-only remote url in the repository binding contract`, `6b8548d1` `test: decouple the scm credential re-check reasons from the binding refusal reasons`, `9d9658cd` `chore: make the binding remote url output-only in control-plane contract 0.5.0`.
- Module: `79466462` `test: specify the repository binding service and store conformance`, `af73cc82` `chore: add repository bindings with plugin-resolved remote urls to the integrations module`, and `e3ba9c43` `chore: keep the repository binding record in the integrations store port`, which moves the record type from `domain/` to `ports/repository-bindings.ts` after `npm run check:boundaries` refused the domain's import of `MergeMethod` from a port (rule R03).
- PostgreSQL: `e496f27c` `test: specify the repository binding table and its postgresql store`, `972f8172` `chore: store one repository binding per project in postgresql`.
- HTTP: `3d8b888e` `test: specify the repository binding routes, their roles, and their resolver answers`, `cc3d769f` `chore: serve the repository binding operations over http`.
- `d1f16138` `docs: describe the plugin-resolved repository binding in the wire and source control contracts`.
- `d579a758` `docs: record the review route of the bind project repository change` (`route.json` unedited): the tree that `make verify` run 1 checked; the commit after it adds this record and the `make record` output.

## Environment

The worker Desi's host, a 2020 Intel iMac, macOS 26.6.2 (Darwin 25.6.0, x86_64), Docker 29.5.2. Every focused run and `make verify` used Node.js v24.22.1, the `.nvmrc` pin. The focused PostgreSQL runs used `scripts/docker-slot.ts run -- bash scripts/services.sh run taskelith-desi11b1 ...`.

## Author self-check

- Scope: only the brief's step 2 items. `git diff --shortstat 634080a0 d579a758 -- '*.ts' '*.sql'`: 29 files, 1275 insertions, 59 deletions, within the guard of about 40 code files and 5000 lines; all files: 46 files, 1692 insertions, 87 deletions.
- Coordinator decisions, each with its test:
  - Q1 one binding per project: `project_repository_bindings` keyed by `project_id`, foreign keys to `projects` and `scm_integrations`; port `RepositoryBindings`, `REPOSITORY_BINDINGS_CONFORMANCE` run against the in-memory and the PostgreSQL store, and the migration test.
  - Q2 rebind and running attempts: the `control-plane-wire-contracts` scenario "Rebind while attempts run" and wire section 4; nothing serves the credential issue yet (item 21), so it has no test here.
  - Q4 resolver errors: `not-found` 422 `repository-not-visible`, `forbidden` 422 `integration-credential-refused`, `unavailable` 503, `invalid` 400, `internal` and any other code 500, a malformed or foreign resolved value 500, a plugin that throws 500 without its message, origin mismatch 422 `remote-origin-mismatch`, a missing plugin 503; each has a case in `repository-binding-service.test.ts`; over HTTP, `repository-binding-routes.test.ts` covers every resolver code above except `precondition-failed`, which the service suite alone covers, the malformed and the foreign resolved value, the throwing plugin (since pass 1, `8044b747`), the origin mismatch, the undeclared merge method, and the missing plugin, checks every 422 body against `BindingRefusal` (all four reasons since `8044b747`), and checks that no answer quotes the resolver's message.
  - Q5 compare-and-set: same binding at the current revision 200 at that revision; first bind on a bound project 409; stale revision 409; any field changes (conformance and route tests).
  - Q6 transaction: the resolver runs before `put`; `put` re-checks the integration's revision in its transaction. In memory, the service and route tests change the integration from inside the resolver and get 409. In PostgreSQL, `repository-bindings.integration.test.ts` commits an integration update after the put's snapshot and before its locking read (`FOR SHARE`), and the put is retried and answers `conflict`. A read returns the binding as stored. Non-members get 403 before 404 (`requirementBeforeBody`, unchanged). `merge-method-undeclared` is checked against `provider.capabilities` through `readCapabilities`.
  - Q7 contract: `RepositoryBindingInput` without `remoteUrl` (`additionalProperties: false`, so 400 for old clients, tested over HTTP); `RemoteUrlCandidate` removed; version 0.5.0; `breaking-changes.json` declares the two breaking changes that `make contract-breaking-changes BASE=634080a0` printed; `make contract-compatibility`: `Contract documents have no undeclared breaking change.`; `npm run verify:web-api-types`: the generated client matches.
  - Roles: 401 without a credential, the identical 403 `role-required` for an existing and a missing project before the body, 403 for a viewer, an operator, and an owner without the maintainer role, and 403 `csrf-token-invalid` for a browser without its CSRF header, each in `repository-binding-routes.test.ts`.
- Deviation, for the coordinator: `BindingRefusal` also loses `remote-not-https`, `remote-userinfo`, `remote-query`, and `remote-fragment`, because only a client-sent URL could reach them and Q4 makes a malformed resolved URL a 500. The execution document's `ScmCredentialRefusal` keeps them for the stored URL's re-check; `execution-http-contracts.test.ts` therefore no longer derives those reasons from `BindingRefusal` (`6b8548d1`), and `docs/contracts/execution-wire-contracts.md` section 8 says so. The shared `RemoteUrl` schema is unchanged, as the contract generator requires.
- Edits of existing tests: `access-requirements.test.ts` lists the two operations among the served ones; `api-server.test.ts` adds `repositoryBindings` to its stub services; `scm-integration-start.test.ts` passes the new `projects` argument; the PostgreSQL `test-database.ts` truncation list and `scm-integrations.integration.test.ts` truncate `project_repository_bindings`, which now references `projects` and `scm_integrations`; `migrations.integration.test.ts` adds the migration to its lists, holds it back where it holds back `1792934200000_inbox-answers`, and takes it down first where an earlier down migration drops a table it references.
- Requirement texts, in characters: `control-plane-api` "Repository binding operations served" 374, "Repository binding by compare-and-set" 274, "Remote URL resolution failures" 457, "Binding against a current resolution" 340; `control-plane-wire-contracts` "Remote origin of a binding" (MODIFIED, its scenario kept) 418, "Remote origin at credential issue" (MODIFIED, its scenario kept) 348, "Binding refusal reasons" 385; `postgres-state` "Repository binding table" 420; `scm-port` "Repository binding store" 341.
- Hexagonal boundaries: the module names no SCM, does not depend on `@taskelith/access` (the composition adapts `ProjectSetupService.readProject` as `BindableProjects`), and `npm run check:boundaries` passes.
- Commit types: no code of this change is in the published `taskelith` package; the commits use `chore`, `test`, and `docs`, with no AI attribution. Comments: `npm run verify:comments`: `Every comment is within the comment length rule.` Only synthetic secrets are used.

## Fail-before

Each behavior's tests were committed before its implementation and run with `node --experimental-strip-types --test` after `npm run build`; the logs are in the session scratchpad (`fb-11b1-<n>.log`).

- Contract (`b9295f50`, `6b8548d1`): `control-plane-contracts.test.ts` tests 25, pass 22, fail 3 (version 0.5.0, the binding schemas, the refusal reasons); `execution-http-contracts.test.ts` against the unchanged document tests 20, pass 19, fail 1 (the decoupled re-check reasons). After `9d9658cd`: the contract tests and `test/check-contract-compatibility.test.ts` 154 of 154 pass.
- Module (`79466462`): both new files failed to load (`does not provide an export named 'InMemoryRepositoryBindings'`; tests 2, fail 2). After `af73cc82`: the module's tests 153 of 153 pass.
- PostgreSQL (`e496f27c`): the migration file failed 18 of its tests on the missing migration (the lists, the table, and the new migration test) and the store file failed to load (`PostgresRepositoryBindings` not exported): tests 51, pass 32, fail 19. After `972f8172`, with the truncation fixes: every PostgreSQL integration file, 402 of 402 pass.
- HTTP (`3d8b888e`): `repository-binding-routes.test.ts` failed to load (`bindableProjects` not exported) and `access-requirements.test.ts` failed its served-operations test: tests 10, pass 8, fail 2. After `cc3d769f`: the module tests and the route, access, API server, start, SCM integration, and project route tests 223 of 223 pass.

### Behavior negative controls

Each control applied one mutation to the committed implementation, rebuilt, ran the named tests, and restored the file; `git status` afterwards showed no change.

| Control | Mutation | Tests run | Result with the mutation |
| --- | --- | --- | --- |
| Resolver `not-found` | `repository-binding-service.ts`: `not-found` maps to the plugin defect | service and route tests | tests 21, fail 2: "each resolver failure maps to its typed answer and stores nothing", "each resolver failure answers its declared status and stores nothing" |
| Stale resolution, in memory | `in-memory-repository-bindings.ts`: only a missing integration is refused | service, conformance, and route tests | tests 27, fail 3: the service and route race tests and the conformance case "a put against a moved integration revision or a missing integration fails with conflict and changes nothing" |
| Stale resolution, PostgreSQL | `postgres/src/repository-bindings.ts`: the integration read loses `FOR SHARE` | `repository-bindings.integration.test.ts` | tests 8, fail 1: "an integration update that commits while a put is open makes the put a conflict, never a stale binding" |
| Same binding | `repository-bindings.ts`: `nextBinding` always moves the revision | service, conformance, and route tests | tests 27, fail 3: the compare-and-set service and route tests and the conformance case "a put of the stored values at the current revision returns the binding at that revision" |
| Origin check | `repository-binding-service.ts`: any parsable origin matches | service and route tests | tests 21, fail 2: "a remote URL outside the allowed origin, and then an undeclared merge method, are typed refusals" and its route counterpart |
| Maintainer role | `access-requirements.ts`: `bindRepository` needs `project-operator` | route tests | tests 10, fail 2: the 403 tests for a principal without a role and for a viewer, an operator, and an owner |

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` (run 1) | `d579a758`, tree `24440332`, clean | Passed, profile full, stamp written: tests 4666, suites 50, pass 4657, fail 0, cancelled 0, skipped 9; all files 99.44 % lines, 92.75 % branches, 98.88 % functions; new files 100 % lines and functions each except `repository-binding-service.js` 98.48 % lines; branches: `repository-binding-service.js` 98.53 %, `repository-bindings-conformance.js` 88.24 %, `in-memory-repository-bindings.js` 90.91 %, module `repository-bindings.js` 100 %, postgres `repository-bindings.js` 96.67 %, control-plane `repository-bindings.js` 90 %, `repository-binding-api.js` 83.33 %. No known flake failed; no rerun |
| `npm run openspec -- validate bind-project-repository --strict` | `117c0a86` | `Change 'bind-project-repository' is valid` |
| `make contract-compatibility` | `9d9658cd` | `Contract documents have no undeclared breaking change.` |
| `npm run verify:archive`, inside run 1 | tree `24440332` | `Every active OpenSpec change archives into strictly valid specs.` |

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees (P(third) 0.76). Reviews run at effort medium (owner decision 2026-11-02), although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `9379bc96b26a0d8b03e503913d030bc5a94e4681`; tests 4676, pass 4667, fail 0, skipped 9; all files 99.44% lines, 92.76% branches, 98.87% functions.
- `npm run openspec -- validate bind-project-repository --strict`: passed, `Change 'bind-project-repository' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 112 file(s); every pass summary file is valid: 92 file(s); every route file is valid: 45 file(s).`.
- Spec diff against the merge base `634080a0e379` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a37b-5df2-7510-9179-31c62a1fd763` | 0 | 1 | 2 | 1 |
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer: Codex CLI, model `gpt-6-astra`, effort `medium`, role A, read-only.
- Invocation: `env -u JEV_MAF_LAB make review CHANGE=bind-project-repository PASS=1 REVIEWER='codex gpt-6-astra#medium' PROMPT=<scratchpad prompt> LOG=<scratchpad log>`; the reviewer reported model `gpt-6-astra` and session `01a1a37b-5df2-7510-9179-31c62a1fd763`.
- Reviewed `634080a0..89638ea9`; the snapshot (`a4aec648…`) was unchanged after the pass.
- Counts: Critical 0, High 1, Medium 2, Low 1, recorded in `passes.jsonl` and `findings.jsonl` (`964308f1`). Every finding is fixed; pass 2 checks the fixes.

| # | Severity | Finding | Test (fail-before) | Fix |
| --- | --- | --- | --- | --- |
| H1 | High | The provider factory and resolver envelopes were read outside the protected boundary, so a throwing getter's message reached the 500 answer | `b7a9c61f`; `fb-11b1-p1-1.log`: tests 24, pass 21, fail 3 (two service tests, one HTTP test that checks the answer and the log records) | `d9ecede2`: `pluginAnswer` reads each envelope and its value once inside the `try`, with `readResult` and the value reader, into a plain snapshot; a throw or a broken envelope is the plugin defect |
| M2 | Medium | The in-memory put checked an integration revision captured before an `await`, so an update could land between the check and the write | `21119d0a`; `fb-11b1-p1-2.log`: tests 7, pass 6, fail 1 (an update after the paused snapshot moved the integration to revision 2) | `1a8fef1f`: `InMemoryScmIntegrations.exclusive` serializes `add`, `update`, and the binding put, so the update waits for the put, as the PostgreSQL `FOR SHARE` lock makes it wait; the test pauses after the snapshot and asserts the order put, then update |
| M3 | Medium | The stored origin went through `normalizeOrigin` and the resolved one through WHATWG `URL` first, so `https://127.1` failed to match itself, and some numeric hosts made `new URL` throw | `55fa93d8`; `fb-11b1-p1-3.log`: tests 15, pass 13, fail 2 (numeric hosts, and an origin that does not normalize) | `fe40c9c5`: `normalizeRemoteOrigin` takes the scheme and authority as written and normalizes them as an allowed origin; an origin that does not normalize is the plugin defect; wire section 4.1 and the spec delta say so |
| L4 | Low | The record claimed HTTP evidence that the route suite lacked | Evidence only: `8044b747` adds the HTTP cases; negative control `fb-11b1-p1-4.log`: with the repository identity check removed the route suite fails 1 of 11 | `8044b747`, and the self-check above states the evidence per suite |

### Both orders of a put and an integration update

The coordinator accepted the M2 semantics: while a put holds the integration's share lock, an update waits; a put after a completed update answers 409. `7666867a` replaces `Promise.withResolvers`, which the ES2022 lib of `tsconfig.check.json` lacks (TS2550 in `check:boundaries` of the verify run after pass 1), with a local deferred. `48df27d5` moves the in-memory pause test into `REPOSITORY_BINDINGS_CONFORMANCE` as two cases, run against the in-memory store and `PostgresRepositoryBindings`: (1) an update that starts while a put, paused after its integration read, holds the integration has not finished after 50 ms, finishes after the put, and the put stores revision 1; (2) a first put at revision 1 after a completed update fails with `conflict` and stores nothing. The target's `pausingAfterIntegrationRead` wraps the integration read: in memory its `get` inside `exclusive`, in PostgreSQL `integrationRevision`, after its `FOR SHARE`, inside the put's transaction.

- Results: the integrations module tests 159 of 159 pass; `repository-bindings.integration.test.ts` 10 of 10 pass, 5 runs in a row (`pg-bindings.log`, `pg-bindings-repeat.log`).
- Negative controls: the in-memory put without `exclusive` fails case (1), tests 8, fail 1, with the order update, then put (`nc-11b1-order1-memory.log`); the PostgreSQL read without `FOR SHARE` fails case (1) and the existing overlap test, tests 10, fail 2 (`nc-11b1-order1-pg.log`). `git status` was clean after each.
- Limit: the outcome of case (1) is deterministic in both stores, but the observation that the update waits is bounded by the 50 ms grace; a store that does not wait is caught when its update finishes within it, as both controls did. A store that waits correctly never fails it. Pass 2 finding L1 replaced the grace with an observed wait (`f1afd259`, below).

### Coordinator decisions after pass 1

Decided by the coordinator (Niki) after pass 1 and committed apart from the findings, so that pass 2 reviews them:

- Q1: the four `remote-*` reasons stay removed from `BindingRefusal`; the 0.5.0 declaration in `packages/contracts/breaking-changes.json` names the removal next to the added values (`4eb0840b`); `make contract-compatibility` passes.
- Q2: a plugin that cannot build a provider from the stored configuration answers 503, never 500, with `details.reason` `integration-configuration-unusable` and the message "the integration's stored configuration is unusable", without the plugin's message. Test `a2ba93ee` (`fb-11b1-p1-q2.log`: tests 27, pass 25, fail 2), fix `06c1a122` with the OpenAPI 503 description, wire section 4, and two `control-plane-api` scenarios; the regenerated web client is unchanged (`npm run verify:web-api-types` matches). A factory that throws or returns a broken envelope stays the 500 plugin defect, and the test that a plugin throw answers 500 without its message is kept.
- Q3: the 422 order stays resolver, origin, merge method.
- Q4: `docs/g3-plan.md` row 11 records the split of 11b into 11b1 and 11b2 (`ec6d081a`).
- The design records the fixes and decisions (`6b4900b0`).

### Pass 2

- Reviewer: Claude Code, model `claude-fable-5-1`, variant `medium`, role B, read-only.
- Invocation: `env -u JEV_MAF_LAB make review CHANGE=bind-project-repository PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium' PROMPT=<scratchpad prompt> LOG=<scratchpad log>`; the reviewer reported model `claude-fable-5-1` and session `5e548a65-4794-401c-acce-5a5992e5bec0`.
- Reviewed `634080a0..9da12f10`, including the pass 1 fixes, deviations 1 to 5, and the coordinator decisions, all of which it accepted; the snapshot (`7ed21ba3…`) was unchanged after the pass.
- Counts: Critical 0, High 0, Medium 0, Low 4, recorded in `passes.jsonl` and `findings.jsonl` with the outcome `fixed-unreviewed`. The pass is Low-only, so the review ends; no pass reviews the fixes below.
- The reviewer cited lines 897 and 615 for L1 and L4, beyond the end of both files; the findings record the lines of the cited code before the fix, 169 and 114.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| L1 | Low | The conformance case observed the waiting update with a fixed 50 ms sleep, which the test authoring rule forbids | Fixed: the target observes the wait, see below |
| L2 | Low | The binding 409 description omitted a revision named while the project is unbound | Fixed in the OpenAPI document and wire section 4 |
| L3 | Low | The one-plugin lookup was duplicated in two compositions | Fixed: `singlePlugin`, built once and passed to both services |
| L4 | Low | A plugin defect left no record of the failing plugin call | Fixed: one sanitized `scm.plugin.defect` error record per defect |

### Pass 2 fixes (unreviewed)

- `f1afd259` `test: observe the waiting integration update instead of a fixed wait in the binding conformance suite` (L1): `RepositoryBindingsTarget.untilUpdateWaits` answers whether the started update waits for the held put. In memory, a test subclass of `InMemoryScmIntegrations` records an `exclusive` call queued while earlier exclusive work runs; `update` calls `exclusive` synchronously, so the answer is known without waiting. In PostgreSQL, the test polls `pg_stat_activity` for a backend of the test database in `wait_event_type = 'Lock'` running `UPDATE scm_integrations`, every 10 ms, to a 30 s deadline that only bounds a store whose update never waits. Both stores pass, 18 of 18 (`l1-run.log`). Negative controls, rerun: the in-memory put without `exclusive` fails the case, tests 8, fail 1, "the update waits for the put: expected true, got false" and the order update, then put (`nc-11b1-p2-memory.log`); the PostgreSQL read without `FOR SHARE` fails the case at the 30 s deadline and the overlap test, tests 10, fail 2 (`nc-11b1-p2-pg.log`). `git status` was clean after each. Test-only, so no fail-before log.
- `f5a093e7` `chore: name a revision on an unbound project in the binding conflict description` (L2): the `bindRepository` 409 description and wire section 4; `npm run generate:web-api-types` leaves the generated client unchanged, as it carries no descriptions.
- `291d50db` `chore: build the installation's scm plugin lookup once for the integration and binding services` (L3): `singlePlugin` in `composition/scm-plugins.ts`; `startScmIntegrationServices` builds it once and passes it to `repositoryBindingService` and `scmIntegrationServices`, which now takes `ScmIntegrationPorts`; `RepositoryBindingPorts` takes `plugins`. Behavior unchanged; the two route suites pass, 22 of 22 (`l3-run.log`).
- `83a39ed4` `test: expect one sanitized report of each scm plugin defect of a repository binding` (L4 test): `fb-11b1-p2-4.log`: tests 29, pass 27, fail 2 (the service case of every defect kind, and the HTTP leak test, which now also asserts the `scm.plugin.defect` records and that no secret reaches them).
- `06268da1` `test: expect a throwing envelope getter as a malformed envelope and a throwing capabilities getter as a throw` (L4 test correction): the readers catch a throwing getter of an envelope or a value and answer a broken shape, so only a throwing call or `capabilities` getter is the kind `threw`.
- `3f061c97` `chore: report each scm plugin defect of a repository binding as one sanitized error record` (L4 fix): port `ScmPluginDefects` with `ScmPluginDefect` (integration id, plugin id, operation `createProvider`, `resolveRemoteUrl`, or `capabilities`, and kind `threw`, `malformed-envelope`, `malformed-value`, `foreign-repository`, `unnormalizable-origin`, or `unexpected-failure-code`); the composition logs it as the error `scm.plugin.defect` with these four fields only, never the plugin's message, stack, or a value. A typed refusal, an unusable configuration, and a bind report nothing. The integrations module and both route suites pass, 183 of 183 (`l4-run.log`).
- Architect check by the coordinator (Niki): _pending_.

## Limitations

- No live GitHub call: the resolver is a fake plugin in the module and route tests; the live conformance of `resolveRemoteUrl` is 20d.
- The credential issue that re-reads a rebound binding (Q2) is item 21's; this change states it in the contracts and the spec only.
- Audit events of SCM integrations are 11b2.

## Follow-ups

- The contract-breaking check (oasdiff) misses the removal of a request property: it did not report `remoteUrl` leaving `RepositoryBindingInput`.
- Audit other control-plane reads of plugin results (20f integration operations, the credential issue) for throwing getters.

## Remaining gates

- The architect check by the coordinator (Niki) of the pass 2 fixes, which no pass reviews.
- Integration into dev by the coordinator (single pull request).
