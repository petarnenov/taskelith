# Verification: define-control-plane-access-contracts

Status: developed and verified by the author; review passes 1 and 2 done; every pass 2 finding fixed, H1 under the architect's decision of 2026-10-28; pass 3 by reviewer A required.

## Scope and source

- G3 item 9 ([G3 work plan](/docs/g3-plan.md), row 9), sub-change 9a, size M, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent. The coordinator and architect split item 9 on 2026-10-28 into 9a to 9d; this sub-change is contract-first only: the new OpenAPI document, its generated types, contract tests, the contract page, and the spec deltas. No adapter and no handler (items 10 to 15).
- The architect's decision of 2026-10-28 on the security schemes, as the brief gives it: a session cookie (`HttpOnly`, `Secure`, `SameSite=Strict`) with a CSRF header on every mutation, the existing `operatorToken` bearer for the CLI and the owner, and only the schemes and their 401, 403, and CSRF failure responses here.
- Sources: [ADR 0004](/docs/decisions/0004-first-class-engineering-principles.md) principle 6, [architecture section 11](/docs/architecture.md#11-spa-authentication-and-live-traffic), [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5, G2 items 8 and 16, and the contracts of items 3 to 8 and 27 under `docs/contracts/`. The architect's decision of 2026-10-28 on pass 2 finding H1, option (c): apply option (a), an allowed origin per SCM integration, now, and record option (b) as a follow-up ([design](design.md) decision 21). Where the sources are silent, [design](design.md) decisions 3 to 21 record the minimal shape chosen and the source it relies on.
- Excluded: the 9b to 9d operations and messages, principal administration, worker credential rotation and worker revocation over HTTP (design decision 12), the project policy revision (decision 9), and the slot usage window and cooldown settings (decision 13).

## Revision

- Base: `dev` `9196804b`.
- `38941979` `chore: refuse one security scheme name with two definitions` (generator and its test).
- `7206ddd4` `chore: add the control-plane access contract document` (document and contract tests).
- `b1719e0f` `docs: define the control-plane access contracts` (contract page, G3 plan row 9, execution wire contracts, change record, spec deltas).
- `f369da91` `docs: record the route of the control-plane access contracts` (`route.json`, unedited). The `make verify` run below checked this commit's tree.
- `b0e76d0c` `docs: record the verification of the control-plane access contracts` (this record), the head that review pass 1 reviewed.
- Pass 1 fixes: `d63cc174` `chore: add the remote URL to the repository binding and accept Git branch names` (document and contract tests) and `cfde4f9b` `docs: scope the bearer, order, compare-and-set, and paging rules of the control plane` (spec delta, contract page, design).
- `13b9b2fb` `docs: record review pass 1 of the control-plane access contracts` (this record, `findings.jsonl`, and `passes.jsonl`) and `425a6ca9` `docs: correct the route note of review pass 1` (this record). The `make verify` run of the pass 1 fixes checked the tree of `425a6ca9`, `518dfdf0`.
- `e9daeef1` `docs: record the checks of the pass 1 fixes of the control-plane access contracts` (this record), the head that review pass 2 reviewed.
- Pass 2 fixes: `8bfdcd79` `chore: fix the webhook rejection, path parameter failures, and token revocation answers of the control plane` (document and contract tests) and `977fab30` `docs: ground member reassignment, token revocation, request logs, and the binding check of the control plane` (spec delta, contract page, design).
- `286cef63` `docs: record review pass 2 of the control-plane access contracts` and `8db45e03` `docs: record the checks of the pass 2 fixes of the control-plane access contracts` (this record, `findings.jsonl`, and `passes.jsonl`).
- H1 fix: `83063102` `chore: confine the bound remote URL to the allowed origin of its SCM integration` (document and contract tests) and `1ca30695` `docs: tie the bound remote URL to the allowed origin of its SCM integration` (spec delta, contract page, design).
- The commit that records the H1 fix changes only this record and `findings.jsonl`; the `make verify` run of the H1 fix checked its tree, as the generated part below names it.

## Environment

Native Ubuntu Linux host (the worker's), x86_64; Node.js and npm from `.nvmrc` through `nvm use`; Docker for the `make test` services. `TMPDIR=/home/petar/.cache/taskelith-verify-tmp` for the `make verify` run.

## Author self-check

- **Scope.** 34 operations, all in the new document: `readSession`, `logIn`, `logOut`; `listProjects`, `createProject`, `readProject`, `updateProject`; `listProjectMembers`, `assignProjectMember`, `removeProjectMember`; `readProjectDefaults`, `updateProjectDefaults`; `readAutoMergeSetting`, `updateAutoMergeSetting`; `readRepositoryBinding`, `bindRepository`; `listProjectAccountSlots`; `listWorkers`; `listEnrollmentTokens`, `issueEnrollmentToken`, `revokeEnrollmentToken`, `rotateEnrollmentToken`; `listAccountSlots`, `addAccountSlot`, `updateAccountSlot`, `revokeAccountSlot`, `reinstateAccountSlot`, `rotateSlotCredential`, `removeAccountSlot`; `listScmIntegrations`, `createScmIntegration`, `readScmIntegration`, `updateScmIntegration`; `receiveScmWebhook`. No existing document changed, so `execution.openapi.json` stays 0.4.0, `execution.asyncapi.json` 0.7.0, and the SDLC documents keep their versions.
- **Shared vocabulary.** The ten reused schemas are copied from `execution.openapi.json` and `execution.asyncapi.json`; the shared-vocabulary test of `packages/contracts/test/contracts.test.ts` now includes the document and checks `SelfCheckResult` among the shared names. `operatorToken` equals the other documents' scheme (test `the operator credential is the scheme that the other documents define`).
- **Domain vocabularies.** The enumerations of worker admission state, merge method, slot state, slot health, cooldown source, and spec approver equal `WORKER_ADMISSION_STATES`, `MERGE_METHODS`, `SLOT_STATES`, `SLOT_HEALTH`, `COOLDOWN_SOURCES`, and `SPEC_APPROVERS` (test `the wire enumerations are the domain vocabularies`).
- **Brief's test list.** The document parses and every reference resolves; typed constants of `HttpComponents` and `HttpOperations` compile under `tsc -p tsconfig.check.json`, which `npm test` runs; every non-GET operation except the receiver requires the CSRF header with the cookie or the bearer alone; the cookie scheme's prefix and attributes; no response schema reaches a `writeOnly` schema; the receiver has no security requirement and a raw body; only issuing and rotating a token reveal its secret, with `Cache-Control: no-store`; and the generator check (`test/generate-contracts.test.ts`).
- **Fail-before of the generator check.** On `9196804b`, `mergeOpenapi` of two documents defining `operatorToken` as `bearer` and as `basic` printed `{"operatorToken":{"type":"http","scheme":"basic"}}` and raised nothing (a temporary script over `git show 9196804b:scripts/generate-contracts.ts`, removed afterwards). With the change, the new test sees "The security scheme operatorToken of b.json differs from the one of a.json".
- **Citations.** `scripts/generate-contracts.ts:110` is cited at `9196804b`, where it held the `Object.assign` merge; the line has moved since. The other citations name sections or symbols, checked against the files at `9196804b`; the brief's `installation-and-enrollment.md:51` is the `issue-enrollment-token` line of section 4.
- **Evidence check.** Every result below was copied from the output of the command named beside it, on the commit named in "Revision".

## Checks

| State | Command | Result |
| --- | --- | --- |
| Working tree before the commits | `npm run openspec -- validate define-control-plane-access-contracts --strict` | `Change 'define-control-plane-access-contracts' is valid` |
| Same | `npm run verify:links`; `npm run verify:archive`; `npm run verify:comments`; `make findings ARGS="validate"`; `npx tsc -p tsconfig.check.json` | Every checked link conforms; every active OpenSpec change archives into strictly valid specs; every comment is within the rule; every findings file is valid: 63 file(s), 43 pass summary files, 1 route file; `tsc` exit 0 |
| Same, after `npm run build` | `node --experimental-strip-types --test --test-reporter=dot test/generate-contracts.test.ts packages/contracts/test/*.test.ts` | 55 tests, all passed |
| Same | Spec delta requirement body lengths, in characters | Control-plane document 413, Browser session and CSRF schemes 365, Login session 312, Access failures 372, Operation roles 421, Project setup operations 363, Workers view operation 324, Enrollment token operations 384, Account slot operations 341, SCM integration setup 286, Webhook receiver 348, Secrets in responses 417, Identifiers and pages 341; `sdlc-wire-contracts` Generated types 406 |
| `b1719e0f` | `make findings ARGS="route --change define-control-plane-access-contracts"` | Committed unedited as `f369da91`: tier `elevated` (triggers `lines`, `contracts`), rule version 1; recommended pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow router failed with `missing-credential`, so the rule decided alone |
| `f369da91` | `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`, first run (log `cpac-verify-1.log` in the session scratchpad) | Passed, profile full, tree `9560531d`: tests 2928, pass 2881, fail 0, skipped 47; all files 99.35% lines, 92.73% branches, 99.00% functions; but "the tree changed during the run, no stamp written", because this record was being drafted in the change directory. Superseded by the second run |
| `f369da91`, clean tree | Same, second run (log `cpac-verify-2.log` in the session scratchpad) | Passed, stamp written; generated part below. The wrapper had appended an `exit 0` line to the log, which was removed before `make record`, so that the log ends with the stamped result |
| This record | `make record CHANGE=define-control-plane-access-contracts LOG=<log>`; `make record-check CHANGE=define-control-plane-access-contracts` | Generated part written; `the generated part matches the tree` |
| Pass 1 fixes, working tree | `npm run openspec -- validate define-control-plane-access-contracts --strict`; `npm run verify:links`; `npm run verify:comments`; `npm run verify:archive`; `npx tsc -p tsconfig.check.json` | Valid; every checked link conforms; every comment is within the rule; every active change archives into strictly valid specs; `tsc` exit 0 |
| Same, after `npm run build` | `node --experimental-strip-types --test --test-reporter=dot test/generate-contracts.test.ts packages/contracts/test/*.test.ts` | 59 tests, all passed |
| Same, document of `b0e76d0c` with the new tests | `node --experimental-strip-types --test packages/contracts/test/control-plane-contracts.test.ts` | Fail-before: 3 of 20 failed, the binding test, `a binding branch is any name that git check-ref-format --branch accepts`, and `a binding remote is an HTTPS URL without user information` |
| Same | The `BranchName` pattern against `git check-ref-format --branch` (Git 2.43.0) over 43 names, among them `release/версия`, `@`, `HEAD`, `a..b`, `x.lock`, and `a@{b` | Same verdict for every name |
| Same | Spec delta requirement body lengths, in characters | Browser session and CSRF schemes 470, Access failures 427, Project setup operations 464, Webhook receiver 399, Identifiers and pages 407; the others unchanged |
| Pass 1 records | `make findings ARGS="validate"` | Every findings file is valid |
| `425a6ca9`, clean tree | `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` (log `cpac-verify-3.log` in the session scratchpad) | Passed, profile full, tree `518dfdf0`, stamp written; superseded by the pass 2 run |
| Pass 2 fixes, working tree | `npm run openspec -- validate define-control-plane-access-contracts --strict`; `npm run verify:links`; `npm run verify:archive`; `npm run verify:comments`; `npx tsc -p tsconfig.check.json` | Valid; every checked link conforms; every active change archives into strictly valid specs; every comment is within the rule; `tsc` exit 0 |
| Same, after `npm run build` | `node --experimental-strip-types --test packages/contracts/test/control-plane-contracts.test.ts` | 22 tests, all passed |
| Same, document of `e9daeef1` with the new tests | Same | Fail-before: 3 of 22 failed, `authentication, authorization, and CSRF failures are distinct responses`, `every operation with a path parameter but the receiver answers 400 to an invalid one`, and the webhook receiver test; the `no-store` and paging checks of L9 pass on both, because they add coverage of rules the document already met |
| Same | Spec delta requirement body lengths, in characters | Access failures 472, Operation roles 444, Account slot operations 385, SCM integration setup 345, Secrets in responses 463; the others unchanged |
| Pass 2 records | `make findings ARGS="validate"` | Every findings file is valid |
| Pass 2 record commit, clean tree | `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` (log `cpac-verify-4.log` in the session scratchpad) | Passed, stamp written; superseded by the H1 run |
| H1 fix, working tree | `npm run openspec -- validate define-control-plane-access-contracts --strict`; `npm run verify:links`; `npm run verify:archive`; `npx tsc -p tsconfig.check.json` | Valid; every checked link conforms; every active change archives into strictly valid specs; `tsc` exit 0 |
| Same, after `npm run build` | `node --experimental-strip-types --test packages/contracts/test/control-plane-contracts.test.ts` | 24 tests, all passed |
| Same, document of `8db45e03` with the new tests | Same | Fail-before: 4 of 24 failed, `a bound remote is an HTTPS URL without user information, query, or fragment`, `bindRepository refuses a remote outside the integration origin with a typed 422`, `only an installation owner sets the allowed origin of an SCM integration, returned normalized`, and `an SCM integration returns the names of its secrets, never their values` |
| Same | Spec delta requirement body lengths, in characters | Remote origin of a binding 369, Remote origin at credential issue 305, SCM integration setup 364; the others unchanged. A single requirement for both rules was refused by strict validation at 504 characters, so they are two |
| H1 records | `make findings ARGS="validate"` | Every findings file is valid |
| H1 record commit, clean tree | `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` (log `cpac-verify-5.log` in the session scratchpad) | Passed, stamp written; generated part below |

## Limitations

- Contract only: no handler enforces the schemes, the roles, the CSRF check, or the serialization of token rotation and redemption; items 10 to 12, 15, and 20 must, and their tests must check the real cookie attributes and headers.
- `make contract-compatibility` skips a document that is missing at the merge base, so this first version had no breaking-change check; the next change to the document gets one.
- The document is not validated by a dedicated OpenAPI linter: the repository has none among its dependencies. Its validity rests on the type generator (`openapi-typescript`, which refuses an unresolved reference), the ajv compilation of every schema in strict mode, and the contract tests.
- The route record recommends reviewer A at `high` and reviewer B at `xhigh`. Under governance "Routed effort" these elevated efforts apply only after a later governance change that the owner approves; until then the authorized efforts stay, reviewer A Codex `gpt-6.1-sol` at `medium` and reviewer B Claude Code `claude-opus-5-5` at `high`, as the authorized reviewer list and the brief give them.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `23b071a8f4d3ad8f7d07ac200f42eb7cf772827b`; tests 2936, pass 2889, fail 0, skipped 47; all files 99.36% lines, 92.77% branches, 99.00% functions.
- `npm run openspec -- validate define-control-plane-access-contracts --strict`: passed, `Change 'define-control-plane-access-contracts' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 63 file(s); every pass summary file is valid: 43 file(s); every route file is valid: 2 file(s).`.
- Spec diff against the merge base `9196804b89c6` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a181dd-9282-7cc3-9cac-62361e988c19` | 0 | 0 | 6 | 3 |
| 2 | B | `claude claude-opus-5-5#high` | `cb157568-8906-453c-8fd2-df2e21c2aae4` | 0 | 1 | 5 | 10 |
<!-- make record: end -->

## Independent review

- Pass 1, reviewer A: Codex CLI `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, codex v0.163.0, session `01a181dd-9282-7cc3-9cac-62361e988c19`, invoked on 2026-10-28 on the reviewed head `b0e76d0c` as `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`; the header confirmed `model: gpt-6.1-sol`, `reasoning effort: medium`, and `sandbox: read-only`. The SHA-256 snapshot was `94c29e82b1be067f4d56859861d343c36b1946370f73737ab6b5ae4feff93c8c` before and after the pass, so the reviewer changed nothing. 0 critical, 0 high, 6 medium, 3 low, all fixed ([findings](findings.jsonl), [passes](passes.jsonl)):
  - M1, contract-drift: the binding had no remote URL, which a workspace prepare takes from it (git workspace contract section 3). `RemoteUrl`, HTTPS without user information, is now required in `RepositoryBindingInput` and `RepositoryBinding`; design decision 11 and contract page section 4.
  - M2, contract-drift: `BranchName` refused valid non-ASCII branch names. It now follows `git check-ref-format --branch`, and its 1024-character bound is justified as a request bound.
  - M3, spec-wording: the bearer was offered to `logIn` and `logOut`. The requirement, its scenario, and contract page section 2 exclude them, and a new test pins it.
  - M4, spec-wording: authentication before the body read cannot hold for the receiver. The order is limited to session and bearer operations, and the receiver's order, bounded raw read, signature verification, then the payload, is stated in the spec and contract page section 5.
  - M5, spec-wording: "every update" overstated compare-and-set. The spec names the compare-and-set project operations and the exceptions, with a scenario for concurrent member assignments, and contract page section 4 lists every compare-and-set operation and exception.
  - M6, spec-wording: paging covered `listWorkers`. The requirement, its scenario, and contract page section 6 exclude it, and a new test checks that every other list takes `after`.
  - L1, docs: the cookie scheme description now limits what the `__Host-` prefix enforces, as design decision 4 does.
  - L2, docs: design decision 19 states that a login name starts with a letter or digit.
  - L3, evidence-mismatch: the limitation on the routed effort now cites governance "Routed effort" instead of the coordinator.
- The findings outside this directory name the capability `control-plane-api`, the closest existing one, because `make findings` accepts only directories under `openspec/specs` and this change creates `control-plane-wire-contracts`; the spec delta findings name it too, because they concern the contract rather than this record.
- Route: `route.json` is kept. The fixes change 104 lines (81 added, 23 removed) in five files the change already touched, with no new file, capability, or touched area, so its features keep their triggers (`lines`, `contracts`) and its tier `elevated`.
- Pass 2, reviewer B: Claude Code `claude-opus-5-5`, effort `high`, plan mode with `Edit`, `Write`, and `NotebookEdit` disallowed, session `cb157568-8906-453c-8fd2-df2e21c2aae4`, invoked on 2026-10-28 on the reviewed head `e9daeef1` as `env -u JEV_MAF_LAB claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`; the `modelUsage` of the result line names `claude-opus-5-5`. The SHA-256 snapshot was `beacb1e7a5ac5211f00a74f9cce192a6518bb271985c6d087e1ef550fdf9e38b` before and after the pass, so the reviewer changed nothing. 0 critical, 1 high, 5 medium, 10 low; all 16 fixed, H1 under the architect's decision of 2026-10-28 ([findings](findings.jsonl), [passes](passes.jsonl)):
  - H1, redaction: a `project-maintainer` set `remoteUrl` freely, so a run's SCM credential could reach a host that the integration does not confirm. Fixed by option (a) of the architect's decision (architect, 2026-10-28): an SCM integration holds an allowed origin that only an `installation-owner` sets, stored normalized (`NormalizedOrigin`); `bindRepository` answers 422 `BindingRefusal` with reason `remote-not-https`, `remote-userinfo`, `remote-query`, `remote-fragment`, or `remote-origin-mismatch`; and every per-run SCM credential issue or re-delivery re-checks the bound URL against the current origin and refuses a mismatch with `remote-origin-mismatch`. Requirements "Remote origin of a binding" and "Remote origin at credential issue" with one scenario each, page section 4.1, design decision 21, and three new tests.
  - M1, concurrency-race: "idempotent" member assignment contradicted product ports section 2, rule 7. The word is dropped; design decision 7, contract page section 4, and the document state last-writer-wins as an explicit exception to rule 7 with its reason. No source requires a compare-and-set.
  - M2, contract-drift: the revoked token state had no redemption rule. Redemption treats a revoked token as `token-invalid`, an obligation for item 26, sub-change 26c (26b landed before 9a defined revocation), which owns the enrollment endpoint where redemption happens (architect, 2026-10-28; page sections 4 and 9, decision 12), because the redemption requirement lives in `installation-enrollment`, not `control-plane-api`; revoking a revoked or expired token answers 204.
  - M3, redaction: shape-based redaction missed the session values and write-only bodies. Request logs hold only allowlisted parts, never such a body or the `Cookie`, `X-CSRF-Token`, or `Authorization` header: requirement "Secrets in responses" with scenario "Logged login request", page section 7, decision 20.
  - M4, contract-drift: the `bindRepository` 422 is now an undeclared merge method, from source control section 2, rule 5, and section 4; the ungrounded reachability check is removed (decision 11, page section 4).
  - M5, contract-drift: the receiver's 401 is the fixed `WebhookRejection` (`signature-invalid`); requirement "Access failures" names the exception and the failures test now checks the receiver.
  - L1 to L9: the `logOut` 401 names only the cookie; the `rotateSlotCredential` 200 describes the record after the final revision advance; five update 409s name only the revision; eight operations declare 400, with a test; the roles requirement says assigning and removing members; the slot and SCM requirements name their compare-and-set; revoking a rotated token answers 422 `token-rotated` with the replacement; a verified unparseable payload answers 400; tests check `no-store` on `readSession` and `logIn` and the page bound and `next`.
  - L10, evidence-mismatch: the Revision list names `13b9b2fb`, `425a6ca9`, and `e9daeef1`, and says the run of the pass 1 fixes checked `425a6ca9`.
- Route after pass 2: `route.json` is kept. The fixes change 231 lines (198 added, 33 removed) in five files the change already touched, with no new file, capability, or touched area, so the triggers (`lines`, `contracts`) and the tier `elevated` stay.
- Correction after pass 2: the M2 fix first placed the redemption obligation on G3 plan row 33, the workers and pools screens, which builds no redemption. The architect moved it to item 26, sub-change 26c (26b landed before 9a defined revocation) on 2026-10-28; design decision 12, page section 9, and the M2 line of `findings.jsonl` now name it. The plan row 33 itself never carried it, so `docs/g3-plan.md` is unchanged.
- Route after the H1 fix: `route.json` is kept. The fix changes 173 lines (156 added, 17 removed) in five files the change already touched, with no new file, capability, or touched area, so the triggers (`lines`, `contracts`) and the tier `elevated` stay.
- Pass 3: required by governance "Conditional third pass", because pass 2 reported a High finding and its fixes change the document and its tests. Reviewer A, Codex `gpt-6.1-sol` at `medium`, confirms the pass 2 fixes.

## Remaining gates

- Review pass 3 by reviewer A, Codex `gpt-6.1-sol` at `medium`, required by governance "Conditional third pass".
- The archive (task 5.1).
- Integration into dev by the coordinator (single pull request).

## Follow-ups

- Item 20, option (b) of the H1 decision: item 7's SCM port gains an operation that derives the remote URL from the repository, which item 20 implements; `remoteUrl` then becomes output-only (design decision 21).
- Obligation for items 16c and 16e: the worker sends the per-run SCM credential only to the remote URL that the control plane sent with the run (git workspace contract section 7; design decision 21).
- Obligation for item 26, sub-change 26c (26b landed before 9a defined revocation): a redemption treats a revoked enrollment token as `token-invalid` (design decision 12).
- Open note for the architect: no G3 plan row names the HTTP handlers of the enrollment token operations (`listEnrollmentTokens`, `issueEnrollmentToken`, `rotateEnrollmentToken`, `revokeEnrollmentToken`); row 33 builds only their screen. This change adds no plan row for them.
