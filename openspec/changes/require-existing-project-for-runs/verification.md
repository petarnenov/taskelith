# Verification: require-existing-project-for-runs

## Scope and source

G3 plan item 11 (`docs/g3-plan.md`, row 11), sub-change 11c, developed by a briefed subagent from `dev` `aca63889` (#438) under the coordinator (Niki) decisions Q1 to Q10 of 2026-11-04: `createRun` refuses a project that does not exist with 404 after the role check (Q1, Q7, Q8); the temporary G2 bridge is removed (Q6); `createRun` and `submitTask` need `project-operator` without an owner pass, and `readAdmission` and `readTaskResult` are section 3 reads (Q2); the four routes answer a role refusal with 403 (Q5); an unbound project may get a run (Q3); existing runs keep their identifiers and no foreign key is added (Q4); `sdlc.openapi.json` 0.5.0 and `execution.openapi.json` 0.10.0 with a declared behavior break of `sdlc.openapi.json` 0.5.0 only (Q9); and the operator flows on a project the owner operates (Q10). Only `sdlc.openapi.json` 0.5.0 has a `breaking-changes.json` entry: `execution.openapi.json` 0.10.0 changes only the `readTaskResult` 403 description, and no caller's answer of `readTaskResult` changes, because the owner keeps its read pass (`design.md` decision 9). Excluded: a foreign key or migration of runs, a narrower `projectId`, a run's link to the repository binding (item 21), and any UI.

## Revision

- Base: `dev` `aca63889`; the brief's checklist was saved with `--at aca6388907482197ea80cfd740926ed8a8779c71 --size M`.
- `5b406b14` `docs: create the require existing project for runs change`.
- Declarations: `344909bd` (test), `c34cd341` `chore: let a breaking-change declaration list behavior changes`, `aa2a1bc8` (the MODIFIED `sdlc-wire-contracts` requirement).
- Contract: `e47aabae` (test), `c1aae7f7` `chore: declare the run project 404 and retire the g2 bridge in sdlc 0.5.0 and execution 0.10.0`.
- Bridge and roles: `f59e8b31` and `6077139f` (tests), `8f347a3d` `chore: retire the g2 bridge and answer the run operations' role denials with 403`.
- Project directory: `6aca8c2b` (tests and the one-line fixture changes), `3fb65dc8` `chore: refuse runs of projects that do not exist through a project directory`.
- Scripts: `0900d2f7` (tests), `73eaf978` `chore: run the installation smoke and scenarios in a project the owner operates`.
- Harnesses: `2b0659c4` and `bfdcedb3` (integration and scenario harnesses; tests only).
- `15c3c7ab` documents, `90ddd310` tasks, `9b380f56` `route.json` (unedited), `e22650ce` the `make record` output.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Docker 29.5.2, Node.js v24.22.1 (the `.nvmrc` pin). The focused PostgreSQL run used `scripts/docker-slot.ts run -- bash scripts/services.sh run taskelith-11c-focus ...`.

## Author self-check

- Scope: only the brief's items. `git diff --shortstat aca63889 9b380f56 -- '*.ts' '*.sql'`: 36 files, 436 insertions, 135 deletions, within the guard of about 40 code files and 5000 lines; all files: 57 files, 866 insertions, 148 deletions, `route.json` (111 lines) included, which `9b380f56` added; at `90ddd310`, before it, 56 files, 755 insertions, 148 deletions. After the pass 2 fixes, `aca63889..b33acd3d`: code 37 files, 480 insertions, 138 deletions; all files 58 files, 1087 insertions, 154 deletions.
- Coordinator decisions, each with its test:
  - Q1, Q7: `RunService` takes the port `ProjectDirectory` (`apps/control-plane/src/application/project-directory.ts`); the composition adapts it onto `ProjectSetupService.readProject` (`composition/project-directory.ts`), which `bindableProjects` now reuses. `run-service.test.ts` covers an unknown project (`not-found`, nothing stored, checked before the workflow), a failed lookup, and the adapter; `api-server.test.ts` maps `not-found` of `createRun` to 404. The direct fixtures use the one shared `EVERY_PROJECT_EXISTS` (`project-fixtures.ts`).
  - Q2, Q5: `browser-session.test.ts` (owner bearer refused `createRun` and `submitTask` with 403 for an existing, a missing, a foreign, and an unknown resource; 401 for a wrong bearer; the owner passes the reads of foreign and unknown runs), `api-server.test.ts` (403 `AccessDenial` on all four routes), `access-requirements.test.ts` (the rule rows), and `control-plane-api.integration.test.ts` (over PostgreSQL: after its role is removed the owner gets 403 on both commands, for an existing and a missing project, and 200 on both reads; no run is stored).
  - Q3: the integration test creates `run-1` in a project without a repository binding (201).
  - Q4: no migration; `design.md` decision 4.
  - Q6: `g2BridgeRequirement`, `OwnerPass` `g2-bridge`, the export, and the owner pass are gone; `access-authorization.test.ts` checks the export and that an owner fails every non-read project requirement. The production bridge symbols and the bypass are removed; `git grep -n -i "g2.bridge\|g2Bridge\|G2 bridge"` outside `openspec/changes/archive` still finds historical references: `docs/contracts/control-plane-wire-contracts.md` section 2 and `docs/contracts/execution-wire-contracts.md` section 7, which say that 11c retired the bridge and stay accurate; `docs/g3-plan.md` row 11, a historical plan; the reason of the `sdlc.openapi.json` 0.5.0 entry in `packages/contracts/breaking-changes.json`; the tests that check the removal (`execution-http-contracts.test.ts`, `access-authorization.test.ts`); this change's records and deltas; and the living requirement "Temporary G2 bridge" of `openspec/specs/trust-and-operational-foundation/spec.md`, which the REMOVED delta deletes when the change is archived.
  - Q8: the `Identifier` pattern is unchanged.
  - Q9: `make contract-compatibility`: `Contract documents have no undeclared breaking change.` The check lists no breaking change for the added 404 and the descriptions, and the declarations schema required at least one listed change, so a declaration may now carry `behaviorChanges` (deviation 1). The detector equality and the stale-change check compare only `breakingChanges` (`declarationProblems` in `scripts/check-contract-compatibility.ts`), which the tests "a behavior change that the check cannot find is declared in its own list" and "only the listed breaking changes of an entry with behavior changes count as stale" check.
  - Q10: `installation-smoke.test.ts` and `installation-scenario.test.ts`; `installation.sh` keeps `ownerPrincipalId` from `init` as `TASKELITH_OWNER_PRINCIPAL_ID`.
- Requirement texts, in characters: `control-plane-api` "Runs of existing projects" 362, "Roles of the run operations" 378; `sdlc-wire-contracts` "Run project refusals on the wire" 391, "Breaking-change declarations" (MODIFIED, scenarios kept, one added) 492; "Declared breaking changes listed" (MODIFIED after pass 1, scenarios kept, "Bump without found changes" narrowed to breaking changes, one added) 493; `execution-wire-contracts` "Task result role denial" 232; `local-installation` "Opt-in end-to-end smoke" (MODIFIED, scenarios kept) 472; `trust-and-operational-foundation` REMOVED "Temporary G2 bridge" with its reason and migration. An archive probe in a scratch copy of `openspec/` passed `validate --all --strict` (71 of 71). After the pass 1 fixes, a second probe (`archive-11c-p1.log`, `archive-11c-p1-validate.log`) archived with `+ 4, ~ 3, - 1` and passed `validate --all --strict` (71 of 71).
- Commit types: no published `taskelith` code changes; `chore`, `test`, and `docs`, without AI attribution. `npm run verify:comments`: `Every comment is within the comment length rule.`

## Fail-before

Each behavior's tests were committed before its implementation and run with `node --experimental-strip-types --test` against the base code; logs in the session scratchpad.

- `fb-11c-1.log`, contract tests: tests 21, pass 18, fail 3 (both versions, the 404).
- `fb-11c-2.log`, declarations: tests 27, pass 25, fail 2.
- `fb-11c-3.log`, access bridge export: tests 25, pass 24, fail 1.
- `fb-11c-4.log`, roles and routes: tests 50, pass 45, fail 5.
- `fb-11c-5.log`, project directory: `run-service.test.ts` failed to load (`projectDirectory` not exported); tests 44, pass 43, fail 1. Mutation control below.
- `fb-11c-6.log`, smoke and scenario tool: tests 18, pass 12, fail 6.

### Mutation controls

| Control | Mutation | Result |
| --- | --- | --- |
| Bridge text (`mut-11c-1.log`) | the `readTaskResult` 403 description names the bridge again | tests 21, fail 1 |
| Owner reads (`mut-11c-2.log`) | `ControlPlaneApi` ignores `ownerReads` | tests 17, fail 1: "a foreign run and an unknown one are denied alike, and an owner reads every run" |
| Project check (`mut-11c-3.log`) | `RunService` treats every project as existing | tests 4, fail 1: "a run of a project that does not exist is not-found and stores nothing, before the workflow check" |

Each mutation was restored; `git status` showed no change.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` run 1 (`verify-11c-1.log`) | `9b380f56`, clean | Failed only `test/installation-script.test.ts:570` "a bound with a leading zero is read in base 10" (ended after 9.149 s, before 10), the known flake the brief allows to rerun once: tests 4779, pass 4769, fail 1, skipped 9 |
| `make verify` run 2 (`verify-11c-2.log`) | `9b380f56`, tree `d97b44d7`, clean | Passed, profile full, stamp written; recorded below. New files 100 % lines; `run-service.js` 73.53 % branches, `requirement.js` 71.43 % branches, above the 75 % gate overall (92.85 %) |
| Focused `control-plane-api.integration.test.ts` (`int-11c-2.log`) | after `2b0659c4` with the `bfdcedb3` fix | tests 32, pass 32 |
| `make contract-compatibility` | `c1aae7f7` | `Contract documents have no undeclared breaking change.` |
| `make installation-smoke` (`installation-11c-1.log`) | `e22650ce` | Passed: the task result is `ended`, exited with code 0 and a proven start, after the smoke created a project and assigned the owner `project-operator`; `installation.sh: submitted, assigned, executed, stored the result, removed` |
| `make verify-macos-g2-scenarios` (`scenario-11c-verify-macos-g2-scenarios.log`) | `143aa6fd`; the working tree differed only by pass 1 test and record edits that no scenario reads | Passed: the cancellation races, stale generations, and partitions of `g2-cancellation-races.test.ts`, `g2-stale-generations.test.ts`, and `g2-partition.test.ts` through `ScenarioInstallation.create`, which now creates a project and assigns the owner `project-operator`: tests 18, pass 18, fail 0, skipped 0 (2026-11-04 03:28 to 03:30 UTC) |
| `make scenario-worker-kill` (`scenario-11c-scenario-worker-kill.log`) | `143aa6fd`; the working tree differed only by pass 1 test and record edits that no scenario reads | Passed: `installation-scenario.ts submit` created the scenario's project, assigned the owner, and submitted; the worker was killed after 10866 ms, restarted, and reconciled; `installation.sh: killed and restarted the worker, reconciled, removed`, exit 0 |
| Crash windows and duplicate delivery of `crash-windows.integration.test.ts` through `HarnessInstallation.submitTask` | `9b380f56`, in `make verify` run 2 (`verify-11c-2.log`) | Passed natively on macOS, where `make verify` runs them: "a redelivered offer and assignment give one execution and one result" and "a crash at each launch and supervisor window recovers to one durable outcome" |

### Route

`route.json` (rule version 5): elevated (lines, files, capabilities, security, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees (P(third) 0.73). Reviews run at effort medium (owner decision 2026-11-02); the coordinator assigns the reviewers.

The pass 1 fixes changed the diff, so `route.json` was deleted and routed again (`18dcb7b1`, unedited): again elevated (lines, files, capabilities, security, contracts), rule version 5, the same reviewers, and the shadow router `jev-1.14.0` agrees (P(third) 0.73).

That route named `headCommit` `6ffbb1df`, which is not in the branch (pass 2, L1). The reflog shows how: `6ffbb1df` was a local commit that deleted `route.json`; the route was generated at it, and the new `route.json` was then committed with `git commit --amend`, which replaced `6ffbb1df` by `18dcb7b1` with the same parent `d351c5fb`. The same happened earlier to a docs commit of `design.md` (`19a3d3c2`, amended to `5655acf9`). Both were the tip commit, both only docs, and neither SHA is named in the records except in this explanation and the L1 finding (`findings.jsonl` line 5); no test or implementation commit was rewritten, so every test commit still precedes its implementation commit. The branch was never pushed before (no `origin/require-existing-project-for-runs`), so no published history changed. The pass 2 round adds only new commits: `376d4e74` deletes the stale route, and the route is generated again at the then head and committed unedited in the next commit, whose `headCommit` is its parent, `23fcfee3`: again elevated, rule version 5, the same reviewers, and the shadow router `jev-1.14.0` agrees (P(third) 0.72).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `fbe20f718ec1ef4a231c86556ef9ac6b2e878596`; tests 4781, pass 4772, fail 0, skipped 9; all files 99.45% lines, 92.86% branches, 98.87% functions.
- `npm run openspec -- validate require-existing-project-for-runs --strict`: passed, `Change 'require-existing-project-for-runs' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 115 file(s); every pass summary file is valid: 95 file(s); every route file is valid: 48 file(s).`.
- Spec diff against the merge base `aca638890748` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a495-42d8-7780-82d5-25d605a0491a` | 0 | 0 | 2 | 1 |
<!-- make record: end -->

## Review

### Pass 1

- Reviewer: Codex CLI, model `gpt-6-astra`, effort `medium`, role A, read-only.
- Invocation: `env -u JEV_MAF_LAB make review CHANGE=require-existing-project-for-runs PASS=1 REVIEWER='codex gpt-6-astra#medium' PROMPT=<scratchpad prompt> LOG=<scratchpad log>`; the reviewer reported model `gpt-6-astra` and session `01a1a495-42d8-7780-82d5-25d605a0491a`.
- Reviewed `aca63889..143aa6fd`; the snapshot was unchanged after the pass.
- Counts: Critical 0, High 0, Medium 2, Low 1, recorded in `passes.jsonl` and `findings.jsonl`. Every finding is fixed; pass 2 checks the fixes.

| # | Severity | Finding | Test | Fix |
| --- | --- | --- | --- | --- |
| M1 | Medium | The delta allowed behavior changes, but the living "Declared breaking changes listed" and its "Bump without found changes" still rejected every listed change the check does not find | `1161b77d`: the new test passes against the code before the fix, because `declarationProblems` already compares only `breakingChanges`; mutation control `mut-11c-p1-1.log` (the comparison also counts `behaviorChanges`): tests 2, fail 2 | `9956afdd`: the `sdlc-wire-contracts` delta MODIFIES "Declared breaking changes listed" (493 characters): the equality and stale checks name `breakingChanges`, `behaviorChanges` is not compared, "Bump without found changes" names breaking changes, and "Declared behavior changes" is added; the other scenarios are kept. Archive probe `archive-11c-p1.log`, then `validate --all --strict` 71 of 71 |
| M2 | Medium | The changed scenario harnesses (`HarnessInstallation.submitTask`, `ScenarioInstallation.create`) had no execution evidence | Record only | `0490de48`: `make verify-macos-g2-scenarios` (18 of 18) and `make scenario-worker-kill` passed on this macOS host, the crash windows passed in `make verify` run 2; the two Linux targets are remaining gates |
| L3 | Low | The bridge-search evidence claimed no tracked reference remains | Record only | `aeeecf8a`: the production symbols and the bypass are removed, the historical references are listed, and the living requirement goes with the archive; the two wire-contract mentions say that 11c retired the bridge and stay |

Coordinator items of the pass 1 round (Niki, 2026-11-04), apart from the findings:

- `ae85c610`: the version table of `docs/contracts/control-plane-wire-contracts.md` names `control-plane.openapi.json` 0.5.0, stale since #436.
- `c5952e53`: coverage of the branches this change touched in `run-service.ts` and `requirement.ts`; see "Coverage" below.
- `5655acf9`: `design.md` decision 10 says why the owner principal comes from the `init` output.
- `bb2037b8`: the follow-up on `behaviorChanges` below.

#### Coverage

Branch coverage of `make verify` on `dist`, before (`verify-11c-2.log`) and after (`verify-11c-p1.log`) the pass 1 round:

| File | Before | After | Note |
| --- | --- | --- | --- |
| `apps/control-plane/dist/application/run-service.js` | 73.53 % (25 of 34) | 73.53 % | The branches this change added, `#knownProject` and its result check in `createRun`, are covered; the 9 uncovered ones predate it (invalid identifiers and store failures) and are outside its scope |
| `packages/modules/access/dist/domain/requirement.js` | 71.43 % (5 of 7) | 100 % | Removing the covered `g2BridgeRequirement` left the two untested `requiredRoleOf` paths; `c5952e53` tests both |

### Pass 2

- Reviewer: Claude Code, model `claude-fable-5-1`, effort `medium`, role B, read-only.
- Invocation: `env -u JEV_MAF_LAB make review CHANGE=require-existing-project-for-runs PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium' PROMPT=<scratchpad prompt> LOG=<scratchpad log>`; the reviewer reported model `claude-fable-5-1` and session `7692c8cf-9d1f-4b62-9212-6a315e2cd32a`.
- Reviewed `aca63889..87184424`; the snapshot was unchanged after the pass.
- Counts: Critical 0, High 0, Medium 1, Low 5, recorded in `passes.jsonl` and `findings.jsonl`. Every finding is fixed; because of the Medium, pass 3 reviews the fixes.

| # | Severity | Finding | Test | Fix |
| --- | --- | --- | --- | --- |
| M1 | Medium | The `submitTask` 404 said "The run or the stage does not exist", but an unknown run is refused 403 for every caller since the owner pass is gone, and the owner's 404 to 403 switch was not declared | `46f75053`, fail-before `fb-11c-p2-1.log`: tests 22, pass 21, fail 1 | `75dfba67`: the 404 reads "The stage does not exist in a run that the caller may command; an unknown run is refused with 403.", the 403 says every caller gets it for an unknown run, `breaking-changes.json` adds the behavior change "submitTask: an unknown run, which answered the owner 404, is refused with 403 role-required", execution wire contracts section 7 says so, and the `sdlc-wire-contracts` delta "Run project refusals on the wire" (482 characters) gains the scenario "Unknown run of a submission"; `make contract-compatibility` passes |
| L1 | Low | `route.json` named `headCommit` `6ffbb1df`, not an ancestor of the branch | Record only | `376d4e74` deletes it, the route is generated again unedited at the current head; the reflog explanation is under "Route" |
| L2 | Low | The all-files shortstat at `9b380f56` was that of `90ddd310` | Record only | This record: 57 files, 866 insertions, 148 deletions, with both revisions named |
| L3 | Low | `installation.sh` `bootstrap_operator` requires `ownerPrincipalId` with no test | `b33acd3d`: a fake `admin init` answer without `ownerPrincipalId` stops the smoke with status 2 before the start and without the secret; mutation control `fb-11c-p2-3.log` (the `require` removed): tests 1, fail 1 | None: the `require` of `73eaf978` is unchanged |
| L4 | Low | The `sdlc.openapi.json` info description named only the owner credential | `c0fba8a2`, fail-before `fb-11c-p2-2.log`: tests 22, pass 21, fail 1 | `ad7fc004`: since 0.5.0, `createRun` and `submitTask` also require `project-operator` or above on the run's project, which the owner must assign itself |
| L5 | Low | "Scope and source" read as if both documents declared a behavior break | Record only | This record: only `sdlc.openapi.json` 0.5.0 has an entry, and why `execution.openapi.json` 0.10.0 has none |

## Deviations

1. Q9 asked for a `breaking-changes.json` entry, but the check reports no change and the schema required at least one. `breaking-changes.schema.json` gains an optional `behaviorChanges` list, with `breakingChanges` empty only beside it; `make contract-compatibility` compares only the tool-reported list. The `sdlc-wire-contracts` requirement "Breaking-change declarations" is MODIFIED for it.
2. `submitTask` of an unknown run now answers the owner 403, not 404, because the owner has no pass on commands; the integration test says so.
3. The owner's principal identifier reaches the smoke and the scenario tool through `TASKELITH_OWNER_PRINCIPAL_ID`, kept by `installation.sh` from the output of `init`, because no HTTP operation names the caller's principal.

## Limitations

- The 404 of `createRun` is reachable only with a role on an identifier without a project (G2 role rows); it is tested through the service and the route mapping, not over PostgreSQL.
- `make verify-linux-crash-windows` and `make verify-linux-g2-scenarios` need a Linux host (privileged image on the host network, which Docker Desktop gives only inside its virtual machine) and were not run on this macOS host; their macOS counterparts above passed.

## Follow-ups

- Coordinator (Niki, 2026-11-04, pass 2 round): the older uncovered branches of `apps/control-plane/dist/application/run-service.js`, invalid identifiers and store errors, 73.53 % branches (25 of 34), predate this change and are outside its scope; a later change could test them.
- Coordinator (Niki, 2026-11-04): `make contract-compatibility` could require `behaviorChanges` on a minor bump of a document for which it detects no breaking change, so that such a bump states what breaks; not part of this change.

## Remaining gates

- Review pass 3 (role A, `agy gemini-4-argon-medium#medium`), because pass 2 reported a Medium finding; it reviews the pass 2 fixes.
- Run `make verify-linux-crash-windows` and `make verify-linux-g2-scenarios` on a Linux host before integration: the coordinator has Zaki run them on hpz600 against the final pushed archive head.
- Integration into dev by the coordinator (single pull request).
