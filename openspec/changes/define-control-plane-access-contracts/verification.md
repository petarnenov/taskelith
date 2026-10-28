# Verification: define-control-plane-access-contracts

Status: developed and verified by the author; independent review pending.

## Scope and source

- G3 item 9 ([G3 work plan](/docs/g3-plan.md), row 9), sub-change 9a, size M, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent. The coordinator and architect split item 9 on 2026-10-28 into 9a to 9d; this sub-change is contract-first only: the new OpenAPI document, its generated types, contract tests, the contract page, and the spec deltas. No adapter and no handler (items 10 to 15).
- The architect's decision of 2026-10-28 on the security schemes, as the brief gives it: a session cookie (`HttpOnly`, `Secure`, `SameSite=Strict`) with a CSRF header on every mutation, the existing `operatorToken` bearer for the CLI and the owner, and only the schemes and their 401, 403, and CSRF failure responses here.
- Sources: [ADR 0004](/docs/decisions/0004-first-class-engineering-principles.md) principle 6, [architecture section 11](/docs/architecture.md#11-spa-authentication-and-live-traffic), [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5, G2 items 8 and 16, and the contracts of items 3 to 8 and 27 under `docs/contracts/`. Where they are silent, [design](design.md) decisions 3 to 19 record the minimal shape chosen and the source it relies on.
- Excluded: the 9b to 9d operations and messages, principal administration, worker credential rotation and worker revocation over HTTP (design decision 12), the project policy revision (decision 9), and the slot usage window and cooldown settings (decision 13).

## Revision

- Base: `dev` `9196804b`.
- `38941979` `chore: refuse one security scheme name with two definitions` (generator and its test).
- `7206ddd4` `chore: add the control-plane access contract document` (document and contract tests).
- `b1719e0f` `docs: define the control-plane access contracts` (contract page, G3 plan row 9, execution wire contracts, change record, spec deltas).
- `f369da91` `docs: record the route of the control-plane access contracts` (`route.json`, unedited). The `make verify` run below checked this commit's tree.
- The commit that adds this record changes only `verification.md`.

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

## Limitations

- Contract only: no handler enforces the schemes, the roles, the CSRF check, or the serialization of token rotation and redemption; items 10 to 12, 15, and 20 must, and their tests must check the real cookie attributes and headers.
- `make contract-compatibility` skips a document that is missing at the merge base, so this first version had no breaking-change check; the next change to the document gets one.
- The document is not validated by a dedicated OpenAPI linter: the repository has none among its dependencies. Its validity rests on the type generator (`openapi-typescript`, which refuses an unresolved reference), the ajv compilation of every schema in strict mode, and the contract tests.
- The route record recommends reviewer B at `xhigh`; the brief names `claude-opus-5-5` at `high`. An effort above standard needs governance authorization, which is the coordinator's.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `9560531dd7bcaead88e7ea0efdec2430a6be2351`; tests 2928, pass 2881, fail 0, skipped 47; all files 99.35% lines, 92.76% branches, 99.00% functions.
- `npm run openspec -- validate define-control-plane-access-contracts --strict`: passed, `Change 'define-control-plane-access-contracts' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 63 file(s); every pass summary file is valid: 43 file(s); every route file is valid: 2 file(s).`.
- Spec diff against the merge base `9196804b89c6` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not yet run.

## Remaining gates

- Review pass 1 by reviewer A, Codex `gpt-6.1-sol` (the brief), and pass 2 by reviewer B, Claude Code `claude-opus-5-5` at `high` (the brief); pass 3 by reviewer A only as governance "Conditional third pass" requires.
- The archive (task 5.1).
- Integration into dev by the coordinator (single pull request).
