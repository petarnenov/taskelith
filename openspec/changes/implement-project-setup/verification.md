# Verification: implement-project-setup

## Scope and source

G3 item 11 (`docs/g3-plan.md`, row 11), sub-change 11a by the coordinator's split of 2026-11-03 (design, "Coordinator decisions" Q1 to Q3), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `a21913f1` (#426): projects, members, and defaults in `@taskelith/access` with the PostgreSQL store and migration `1792933800000_project-setup.sql`, and the control plane's `listProjects`, `createProject`, `readProject`, `updateProject`, `listProjectMembers`, `assignProjectMember`, `removeProjectMember`, `readProjectDefaults`, `updateProjectDefaults`, and `readAutoMergeSetting` ([design](design.md), decisions 1 to 9). Out of scope and untouched: `readRepositoryBinding`, `bindRepository`, and the integration branch (11b); `updateAutoMergeSetting` (item 23); SCM integrations and the webhook receiver (20e); `listProjectAccountSlots` (item 12); views and screens; the temporary G2 bridge, which the follow-up sub-change 11c removes (design, "Pass 1 coordinator decisions" (a)). The pass 1 fix round adds the 403 declarations of the G2 documents (decision (c)).

Commit type: `packages/modules/access`, `packages/adapters/*`, and `apps/control-plane` are private workspaces; the published `taskelith` package ships none of them (`package.json` `files`, checked by `scripts/verify-package.ts`), so every commit uses `chore`, `test`, or `docs`.

## Revision

- Base: `dev` `a21913f13672d87306b86b8f26cf474ef8264bba`, the brief's checklist base and the merge base with `origin/dev`.
- `b14c0a45` `chore: start the implement-project-setup change`: `.openspec.yaml`, `checklist.json` saved with the brief's invocation `--save implement-project-setup --at a21913f13672d87306b86b8f26cf474ef8264bba --size L` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `fb90b93c` `test: expect projects, members, and defaults in the access store, PostgreSQL, and over HTTP`: the tests alone, the base of the fail-before run.
- `2cf22252` `chore: serve projects, members, and defaults from the control plane`: the module, the adapters, the migration, and the control plane.
- `e87170e7` `docs: record the implement-project-setup proposal, design, and spec deltas`.
- `7506a2b2` `test: expect a project command's own role denial to answer 403`.
- `c5e5295e` `docs: start the implement-project-setup verification record`.
- `22d00101` `docs: route the implement-project-setup change`, at head `c5e5295e`; its `make verify` (`verify-11a-1.log`) passed, then `9e35c606` added handler tests to raise the branch coverage of `project-api.js` from 73.44% to above 75%, which changed the diff, so `21185cb8` deleted that `route.json` and `a3a3b889` routed again, unedited, at head `21185cb8`: "route: elevated (lines, files, capabilities, security, size), rule version 5"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.83), agrees. Recommendation only: the brief routes effort medium.
- `a2696b2f` `docs: record the make verify of the implement project setup change`, the `make record` of the passing `make verify` on the tree of `a3a3b889`; pass 1 reviewed this head.
- Pass 1 fix round: `git fetch origin && git merge origin/dev` was already up to date (`origin/dev` `a21913f1`, no merge commit); `d619a817` `test: expect revocable G2 roles, code-point names, copied defaults, isolated route tests, project races, and declared G2 denials`, the tests alone; `a0a541b1` `chore: keep G2 roles revocable, count name code points, copy stored defaults, and declare the G2 role denials`; `7aa9976c` `docs: record the pass 1 fixes and decisions of the implement project setup change`; `69d7e8c4` `docs: record review pass 1 and its fix round of the implement project setup change`; `58dfe5d2` `chore: name the change that retires the temporary G2 bridge in its comments` (decision (a)); then the record commits of the round with the `make record` of its `make verify` (`9836ca9a`, `02a19325`); pass 2 reviewed `02a19325`.
- Pass 2 fix round: `572f01c6` `chore: name the browser-or-operator schemes, type the assigned project role, and name 11c in the bridge comments` (L4, L5, decision (a)); `e5fe091d` `docs: name 11c as the follow-up that retires the G2 bridge and record the pass 2 coordinator decisions` (decisions (a) and (b)); then the record commits of the round with the `make record` of its `make verify`.

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker 29.5.2 for the services of `make test` and of the targeted PostgreSQL runs below, each taken through `scripts/docker-slot.ts run`.

## Author self-check

- Scope: only 11a. Until the pass 1 fix round no change under `packages/contracts`; since `a0a541b1` `sdlc.openapi.json` 0.4.0 declares the 403 `AccessDenial` on `createRun`, `submitTask`, and `readAdmission` and defines `AccessDenial` as `control-plane.openapi.json` does, and `execution.openapi.json` 0.9.0 declares it on `readTaskResult`, `listQuarantine`, and `redriveQuarantined` (decision (c)); no operation or other schema changed, `control-plane.openapi.json` is unchanged, `make contract-compatibility` reports 0 breaking changes for every document against `a21913f13672` (no `breaking-changes.json` entry), `npm run verify:web-api-types` passes, and the generated types are rebuilt by `npm run build`; no new operation was needed; no dependency changed (`package-lock.json` and every `package.json` unchanged); `ACCESS_REQUIREMENTS` is unchanged, since item 10 already named the rule of every operation.
- Hexagonal boundaries: projects are a store of the existing `AccessStore` port with conformance cases that the in-memory adapter and PostgreSQL both pass; the module imports only the kernel and SDLC; `project-api.ts` maps wire shapes only; `npm run check:boundaries` passes in `make verify`.
- Authorization: the server's check before the body is unchanged, and each command checks its actor again in its transaction; that denial answers 403 (`reasons`), tested with a server whose own check passes everyone.
- Migration: `1792933800000` is the brief's timestamp; `1792933600000` (12f) and `1792933700000` (20e) stay unused. The foreign key is `NOT VALID` (design decision 7).
- Spec deltas: `control-plane-api` adds five requirements (367, 205, 249, 297, and 264 characters), `trust-and-operational-foundation` two (283, and 258 since the pass 1 round) and, since that round, the MODIFIED "Temporary G2 bridge" (309 since the pass 2 round), `postgres-state` one (309); `npm run verify:archive` archives them into strictly valid specs in `make verify`.
- Comments: `npm run verify:comments` passes.
- Coverage of the new and changed files (`verify-11a-2.log`): `project-api.js`, `project-repositories.js`, `project.js`, `project-setup-service.js`, `principal-administration.js`, `in-memory-access-store.js`, and `routes.js`, each at least 75% of lines, branches, and functions; the figures are in "Evidence check".

## Evidence check

- `verify-11a-3.log` (scratchpad, pass 1 fix round): `make verify: passed, profile full, tree f390638d8380e772f6bd4c91543691980c6e5957`, the tree of `9836ca9a`, clean; tests 4311, pass 4302, fail 0, skipped 9; all files 99.41% lines, 92.64% branches, 98.90% functions; no timing flake, no rerun. Per file (lines, branches, functions): `project-api.js` 100, 89.47, 100; `routes.js` 100, 100, 100; `project-repositories.js` 100, 100, 100; `in-memory-access-store.js` 100, 96.88, 100; `principal-administration.js` 100, 87.50, 100; `project-setup-service.js` 100, 88.06, 100; `project.js` 100, 100, 100. It supersedes `verify-11a-2.log` below, whose figures stay as the record of the pass 1 head.
- `verify-11a-2.log` (scratchpad): `make verify: passed, profile full, tree 00e7462a65a2edd309c2baaad308671eee888b73`, the tree of `a3a3b889`, clean; tests 4294, pass 4285, fail 0, skipped 9; all files 99.40% lines, 92.62% branches, 98.91% functions; no timing flake, no rerun. Per file (lines, branches, functions): `project-api.js` 100, 89.47, 100; `routes.js` 100, 100, 100; `project-repositories.js` 100, 100, 100; `in-memory-access-store.js` 100, 96.77, 100; `principal-administration.js` 100, 86.17, 100; `project-setup-service.js` 100, 85.25, 100; `project.js` 100, 100, 100.
- `verify-11a-1.log` (scratchpad): passed on tree `e797418dc48ff661a795d21df0fbda06994bbb41` (head `c5e5295e`), tests 4293, fail 0, but `project-api.js` had 73.44% branches, under the 75% bar per file; `9e35c606` added the handler failure test, so that run is superseded and not recorded.
- The generated block below was written by `make record` from `verify-11a-2.log`, rewritten in the pass 1 fix round from `verify-11a-3.log`, and in the pass 2 fix round from the log named above it; `make record-check` passes.

## Fail-before

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/72320a31-29ec-4dad-bb0b-5d2fa342f935/scratchpad/`).

- Base (`fb-11a-base-unit.log`, `fb-11a-base-postgres.log`): the tests of `fb90b93c` against the sources of `a21913f1` (the implementation files of `2cf22252` removed and the rest checked out from `a21913f1`, then `npx tsc --build`), then restored and rebuilt (`git status` clean). Unit: tests 68, pass 57, fail 11; `project-setup.test.ts` and `project-routes.test.ts` fail to load (`does not provide an export named 'PROJECT_PAGE_SIZE'` and `'ProjectSetupService'`), `access-requirements.test.ts` fails "a served operation of the control-plane document accepts the schemes the document declares", the `NodeSecrets` test fails on `projectId`, and the tests whose fixtures now add projects fail on the missing `tx.projects`, which shows only that the fixtures need the store. PostgreSQL: tests 48, pass 36, fail 12, the two project setup migration tests and every migration test that lists `1792933800000`, which at the base show only the missing file; the mutations below show the migration's own statements.
- Each guard broken on the implementation, one at a time, then restored and rebuilt (the mutation, the diff stat, and the test output are at the top of each log):
  - `fb-11a-service-authorization.log`: the in-transaction `authorizeIn` of `ProjectSetupService` removed: fail 3, "only an installation-owner creates a project, and a refused or invalid creation writes nothing", "a maintainer renames a project and replaces its defaults by compare-and-set; others are refused", and the 403 HTTP test (the uncommitted test of `7506a2b2` was in the tree).
  - `fb-11a-route-role-denial.log`: the routes' `role-required` 403 reason removed: fail 1, "a denial by the command's own role check, after the server passed the caller, answers 403, never 401".
  - `fb-11a-list-membership.log`: `listProjects` without the membership filter: fail 2, the module's and the HTTP list tests.
  - `fb-11a-role-project-check.log`: the project check of the member commands removed: fail 2, the module's member test (removal on an unknown project) and "an installation-owner learns 404 for a missing project".
  - `fb-11a-creator-role.log`: the creator given `project-maintainer` at creation: fail 7, among them "a new project has its defaults and auto-merge on at revision 1, and no member, its creator included" and the HTTP creation test.
  - `fb-11a-memory-compare-and-set.log`: the in-memory rename without its revision check: fail 3, the in-memory conformance case "a rename and a defaults change compare and set their own revisions" and both compare-and-set tests.
  - `fb-11a-remove-unknown-principal.log`: removal of an unknown principal answered as a failure: fail 2, both member tests.
  - `fb-11a-memory-assign-project.log`: the in-memory assignment without its project check: fail 1, the in-memory conformance case "a principal holds at most one role per project, replaced by an assignment" ("no project").
  - `fb-11a-pg-not-valid.log`: the foreign key validated (`NOT VALID` removed): fail 1, "the project setup migration keeps earlier roles, refuses new ones without a project, and checks its values".
  - `fb-11a-pg-down-constraint.log`: the down migration without `DROP CONSTRAINT`: fail 1, "the project setup down migration removes its tables and the foreign key of the project roles".
  - `fb-11a-pg-rename-compare-and-set.log`: the PostgreSQL rename without `AND revision = $2`: fail 1, "PostgreSQL access store: a rename and a defaults change compare and set their own revisions".
- `9e35c606` adds coverage of failure passthroughs; it guards no new behaviour.

### Fail-before of the pass 1 fixes

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/72320a31-29ec-4dad-bb0b-5d2fa342f935/scratchpad/`). `d619a817` holds the tests alone.

- Unit (`fb-11a-p1-unit.log`): the tests of `d619a817` against the sources of `a2696b2f` (the three fixed files of `packages/modules/access/src` stashed, then `scripts/build-workspaces.ts`), `node --experimental-strip-types --test packages/modules/access/test/*.test.ts apps/control-plane/test/project-routes.test.ts`: tests 82, pass 78, fail 4: "the administrative removal accepts an identifier that names no project, so a G2 role stays revocable" (finding 1, `not-found`), "a project name of 1024 supplementary characters is created and renamed, and one more is refused" and its HTTP twin (finding 2, the 1024-character name refused), and "in-memory access store: stored defaults keep their values when the caller changes its input afterwards" (finding 3, the pushed implementer stored).
- PostgreSQL (`fb-11a-p1-postgres.log`): the same base through `scripts/docker-slot.ts run -- bash scripts/services.sh run fix11a` around `access-conformance.integration.test.ts` and `migrations.integration.test.ts`: tests 60, pass 59, fail 1, "a role kept on a G2 project identifier is revoked by the administrative removal, which audits it" (finding 1). With the fixes (`fix-11a-p1-postgres.log`): tests 60, pass 60, fail 0.
- Isolation (`fb-11a-p1-list-alone.log`, finding 4): the list test of `a2696b2f` selected alone with `--test-name-pattern='^listProjects returns'`: fail 1 (`ids.length >= 2` false); the test of `d619a817` selected alone: pass 1.
- Races (finding 5), each a mutation of the fixed sources, then restored and rebuilt, run against the same services (the diff and the output at the top of each log):
  - `fb-11a-p1-pg-defaults-compare-and-set.log`: the PostgreSQL defaults update without `AND revision = $2`: fail 3, "PostgreSQL access store: of two concurrent defaults replacements at one revision exactly one wins", "of two overlapping defaults changes on PostgreSQL one wins, the other is a conflict after its retry, with one audit event", and the earlier compare-and-set case.
  - `fb-11a-p1-pg-no-serialization-retry.log`: `SERIALIZATION_ATTEMPTS` 1 instead of 5: fail 7, among them both overlapping defaults and assignment tests, "an assignment overlapping a removal of one member on PostgreSQL ends as the last audit event says", and the conformance case "concurrent assignments and a removal of one member leave one consistent role", so the racers' transactions overlap and serialize.
  - `fb-11a-p1-memory-defaults-compare-and-set.log`: the in-memory defaults update without its revision check: fail 4, among them "in-memory access store: of two concurrent defaults replacements at one revision exactly one wins" and "of two concurrent defaults changes one wins with one audit event, and member races end as the trail's last event says".
- Declared statuses (`fb-11a-p1-g2-403.log`, decision (c)): the tests of `d619a817` against the documents of `a2696b2f`: fail 3, "every status a route answers is declared by the operation in its document" (`listQuarantine` answers an undeclared 403), and the two version and declaration tests of `execution-http-contracts.test.ts`.
- Plugin identifiers as stored (decision (b)): "defaults may name plugins that no registry knows; they are stored and read as given" and its HTTP twin pass at the base too; they protect the decided behaviour and guard no change.

## Limitations

- The temporary G2 bridge stays until the follow-up sub-change 11c (design, "Follow-ups"); the living requirement now names it. Until then the 403 that four bridged operations declare is never sent (design, "Pass 2 coordinator decisions" (b)).
- Plugin identifiers in the defaults are stored and read as given, without a registration check, which the task creation of items 15 and 25 makes (decision (b)).
- The G2 documents declare a 403 that no caller receives while the operator credential authenticates only the `installation-owner` and the bridge stands (decision (c)).
- The `NOT VALID` foreign key leaves roles assigned before the migration on G2 project identifiers unchecked.
- Passes 1 and 2 have run (see "Independent review"); pass 3 does not run; no deployment or browser check was made (backend only).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `f390638d8380e772f6bd4c91543691980c6e5957`; tests 4311, pass 4302, fail 0, skipped 9; all files 99.41% lines, 92.64% branches, 98.90% functions.
- `npm run openspec -- validate implement-project-setup --strict`: passed, `Change 'implement-project-setup' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 103 file(s); every pass summary file is valid: 83 file(s); every route file is valid: 36 file(s).`.
- Spec diff against the merge base `a21913f13672` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a19fb5-18fc-7851-8d55-c567407d8851` | 0 | 1 | 4 | 2 |
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer A: `codex gpt-6-astra#medium` (Codex CLI, model `gpt-6-astra`, effort medium, sandbox read-only, as the session reported), session `01a19fb5-18fc-7851-8d55-c567407d8851`, started 2026-11-03T04:40:07.989Z, invocation `env -u JEV_MAF_LAB make review CHANGE=implement-project-setup PASS=1 REVIEWER='codex gpt-6-astra#medium' PROMPT=$S/review-11a-p1.md LOG=$S/review-11a-p1.log`; the worktree snapshot before and after the pass was the same, `90aa042120155d7eb0148ffb23796aec7b8f32d9db0a1c32cfc5397e46039257`, so the reviewer changed no file. `route.json` recommends effort high; the brief's authorized medium applies.
- Counts: Critical 0, High 1, Medium 4, Low 2, reviewed at head `a2696b2f` (`a21913f1..a2696b2f`); report `review-11a-p1-report.md` in the scratchpad.
- Resolutions, all fixed (`findings.jsonl`):
  1. High, revocation of roles kept on G2 project identifiers: `remove-project-role` accepts any project identifier (`a0a541b1`), with a PostgreSQL upgrade test.
  2. Medium, names counted in UTF-16 code units: counted in code points (`a0a541b1`).
  3. Medium, caller-owned defaults kept by the in-memory store: frozen copies on both writes (`a0a541b1`), with a shared conformance case.
  4. Medium, HTTP tests sharing state: a fixture per test (`d619a817`).
  5. Medium, missing race coverage: conformance, module, and overlapping PostgreSQL tests (`d619a817`).
  6. Low, disclosure scenario that included owners: rescoped (`7aa9976c`).
  7. Low, retired governance citation: task 6.4 cites "Review sequence" (`7aa9976c`).

### Coordinator decisions of the pass 1 fix round

Niki (architect), 2026-11-03, binding (design, "Pass 1 coordinator decisions"):

- (a) The living requirement "Temporary G2 bridge" no longer says that item 11 removes it: a MODIFIED delta keeps its text and defers the removal to the follow-up, named sub-change 11c since the pass 2 fix round, in which `createRun` requires an existing project.
- (b) Plugin identifiers of the defaults are checked at task creation, later; until then the defaults may name an unregistered plugin, and `readProjectDefaults` returns them as stored, which module and HTTP tests check.
- (c) Every operation that 11a answers with 403 declares it in `control-plane.openapi.json`; the G2 documents declare the 403 of their role-checked operator operations, approved as a contract fix, with the drift checks above and the minor versions `sdlc.openapi.json` 0.4.0 and `execution.openapi.json` 0.9.0; no served status stays undeclared, which `api-server.test.ts` checks for every route.

### Pass 2

- Reviewer B: `claude claude-fable-5-1#medium` (Claude Code, model `claude-fable-5-1`, variant medium, as the session reported), session `a0aab142-56b2-4e9b-beaa-0bf193a889fd`, started 2026-11-03T05:14:09.043Z, invocation `env -u JEV_MAF_LAB make review CHANGE=implement-project-setup PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium' PROMPT=$S/review-11a-p2.md LOG=$S/review-11a-p2.log`; the worktree snapshot before and after the pass was the same, `06d3dad1009102caabf2e42a94729c9c37ccc5cb09c8e1ff3686414c4d17641b`, so the reviewer changed no file. `route.json` recommends effort high; the brief's authorized medium applies.
- Counts: Critical 0, High 0, Medium 0, Low 5, reviewed at head `02a19325` (`a21913f1..02a19325`); report `review-11a-p2-report.md` in the scratchpad. It confirmed the five fixes of pass 1 above High and Medium and the decisions (a) to (c) as correct and complete. Under governance "Review sequence" a Low-only pass 2 ends the review: the Lows are fixed without another pass.

| Finding | Resolution | Commit |
| --- | --- | --- |
| L1 (Low, `evidence-mismatch`), "No independent review has run yet" | The limitation says passes 1 and 2 have run and pass 3 does not | this round's record commit |
| L2 (Low, `evidence-mismatch`), the generated block's log | "Evidence check" names `verify-11a-3.log` and this round's log as the sources of the rewritten block | this round's record commit |
| L3 (Low, `docs`), row 11 of `docs/g3-plan.md` without the split | Deferred: the coordinator keeps `docs/g3-plan.md` unchanged in this change (pass 2 decision (a)); the scope note lands with the edit by 20f ("Follow-ups") | none |
| L4 (Low, `naming`), `BOTH` | `BROWSER_OR_OPERATOR` in `routes.ts`; the agent session routes are not touched | `572f01c6` |
| L5 (Low, `clean-code`), `assigned.value.role ?? role` | `ProjectRoleAssignment`, `ProjectRoleChange` with a required `role`, is what both assignment commands return; the handler drops the fallback | `572f01c6` |

No fail-before applies: L4 is a rename and L5 a type change with no behaviour change; L1 to L3 change records only. With the fixes, the access module and the control-plane project, route, and server tests pass (`fix-11a-p2-unit.log` in the scratchpad: tests 113, pass 113, fail 0), and `make verify` below.

### Coordinator decisions of the pass 2 fix round

Niki (architect), 2026-11-03, binding (design, "Pass 2 coordinator decisions"):

- (a) The follow-up that retires the temporary G2 bridge is sub-change 11c, renamed from `require-existing-project-for-runs` in the MODIFIED "Temporary G2 bridge" delta (309 characters), the design, the proposal, the wire contracts, and the code comments; it follows 11b, and its plan row lands with 20f's edit of `docs/g3-plan.md`, which this change leaves unchanged.
- (b) The 403 that `createRun`, `submitTask`, `readAdmission`, and `readTaskResult` declare is a superset until 11c switches the bridge denial from 401 to 403: a declared response never sent is safe, an undeclared one sent is not.

### Architect check of unreviewed fixes

No later pass reviews the fixes of the pass 2 round. Each awaits the coordinator's check as solution architect (governance "Architect check of unreviewed fixes"):

- L4 and L5, `572f01c6` (`apps/control-plane/src/api/routes.ts`, `apps/control-plane/src/api/project-api.ts`, `packages/modules/access/src/application/principal-administration.ts`, `packages/modules/access/src/index.ts`): architect check pending.
- L1 and L2, this round's record commit (`verification.md`); L3 deferred: architect check pending.
- Decision (a), `572f01c6` (the comments of `packages/modules/access/src/domain/requirement.ts` and `apps/control-plane/src/api/control-plane-api.ts`) and `e5fe091d` (`specs/trust-and-operational-foundation/spec.md`, `design.md`, `proposal.md`, `docs/contracts/control-plane-wire-contracts.md`, `docs/contracts/execution-wire-contracts.md`): architect check pending.
- Decision (b), `e5fe091d` (`design.md`): architect check pending.

## Follow-ups

- 11c: `createRun` requires an existing project, the temporary G2 bridge is removed, and the G2 role denials answer the declared 403 (pass 1 decision (a)). It follows 11b, which waits for 20f `manage-scm-integrations` (owner decision, 2026-11-03); its row of the G3 work plan lands with the edit of `docs/g3-plan.md` by 20f (pass 2 decision (a)).
- Row 11 of `docs/g3-plan.md` gets a scope note of the 2026-11-03 split into 11a, 11b, and 11c with that same edit (pass 2 finding L3, deferred).

## Remaining gates

- Architect check of the unreviewed pass 2 fixes by the coordinator.
- Integration into dev by the coordinator (single pull request).
