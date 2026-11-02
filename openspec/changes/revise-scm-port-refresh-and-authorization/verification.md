# Verification: revise-scm-port-refresh-and-authorization

## Scope and source

G3 item 20 (`docs/g3-plan.md`, row 20), sub-change 20a, developed by a briefed subagent for the worker Zaki from `dev` `ecf8cd3c`: the `SourceControlProvider` port of `@taskelith/integrations` from `0.1.0` to `0.2.0`, with run credential versions, `confirmRunCredentialAdoption`, `authorization`, and `resolveRemoteUrl`; `WorkspaceCredential` of `@taskelith/workspace` derived from `RunCredential`; the conformance suite, its fixture, and the in-memory SCM; the source control contract; and the `scm-port` delta. Out of scope by the brief: the plugin SDK re-export and the plugin API version (20c), the secret shape rules (20b), any GitHub code, control-plane handlers, and the OpenAPI and AsyncAPI documents.

## Revision

- Base: `dev` `ecf8cd3c` (#418); the brief's checklist was saved with `--at ecf8cd3c62d293bab7330bc5318a8be4335f8cea --size M`.
- `f94b2141` `docs: open the revise scm port refresh and authorization change` (proposal, design, delta, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `f2619531` `chore: revise the scm port to 0.2.0 with adoption, authorization, and remote url` (port, readers, cases, fixture, in-memory SCM, tests, and `WorkspaceCredential`).
- `9f62a58c` `docs: describe the source control port revision 0.2.0` (the contract).
- `a68207eb` `docs: route the revise scm port refresh and authorization change` (`route.json` unedited).
- `1cae2eb3` `docs: record the verification of the revise scm port refresh and authorization change`, the head that review pass 1 read.
- Pass 1 fix round: `86a5e39a` `chore: probe unknown and revoked adoptions and a hidden repository in the scm conformance suite` (findings 1 and 2), `9b7136e4` `test: drive the refresh expiry test with a frozen service clock` (finding 4), `705ca4e1` `docs: align the scm port records and the wire credential wording with pass 1` (finding 3, the contract, and the execution wire contracts wording), and the commits after it: this record, `passes.jsonl`, `findings.jsonl` (finding 5), and `make record`.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js v24.22.1, the `.nvmrc` pin, for `make verify` and the focused runs.

## Author self-check

- Scope: the four items of the brief only. The plugin SDK, `PLUGIN_API_VERSION`, the GitHub plugin, the redaction rules, handlers, and the wire documents are untouched; `git diff ecf8cd3c --stat` lists files under `packages/modules/integrations/`, `packages/modules/workspace/`, `docs/contracts/source-control.md`, and this change only.
- Vendor names (ADR 0006): no type, value, or test of the module names an SCM; only section 7 of the contract, the mapping table, names GitHub and Forgejo.
- Item 26's pattern (design decisions 2 and 3): the predecessor stays valid until a confirmation of its successor, as `confirmCredentials` drops it; the deadline is each version's own `expiresAt`, because a plugin cannot act at a future time by itself.
- Wire alignment (checklist `contract-drift`): the port's `version` is the version of execution wire contracts section 8.7 and of `ScmCredentialDelivery.version`; the `authorization` check is stricter than `ScmAuthorization` and has its 65536 bound; the remote URL check repeats the pattern and bound of `RemoteUrl` in `execution.openapi.json`. One stale sentence in execution wire contracts section 8.7 is left to the coordinator (design, "Wire contract text that the revision makes stale").
- Secrets (checklist `redaction`): findings name `authorization`, `version`, and the remote URL only by field and problem; the shape tests assert the finding text, which holds no returned value, and the suite compares `authorization` values without printing them.
- `git-workspace-port`: `WorkspaceCredential` keeps its five fields, so its requirements are unchanged; the workspace and Git adapter packages build and their tests pass in `make verify`.
- Requirement texts are 348 to 453 characters; the change validates strictly, and `npm run verify:archive` archives it into strictly valid specs.
- Comments: `npm run verify:comments` passes. No AI attribution in commits.

## Fail-before

The tests of the new guarantees exercise the conformance suite against defective in-memory services, so each was run against a mutant of the suite with the guarantee removed. Each mutant is one exact text replacement in the source of `f2619531`, listed below; for each, the worktree applied it, ran `npx tsc -b packages/modules/integrations` and `node --experimental-strip-types --test packages/modules/integrations/test/*.test.ts` (M21 and M22: `packages/modules/integrations/test/source-control-refresh.test.ts` only) with Node.js 24.22.1, recorded the failing test names, restored the file, and rebuilt. The second table gives the failures. Before the suite existed, the new and updated tests failed against the revised port types with the old suite and fake: 96 of 103 tests failed; that run's output was not kept, so the mutants are the reproducible evidence.

| Mutant | File under `packages/modules/integrations/src/ports/` | Text replaced | Replacement |
| --- | --- | --- | --- |
| M1 | `credential-cases.ts` | `await expectGrantedAccess(run, fixture, original, 'before the adoption of its successor');` | (line removed) |
| M2 | `credential-cases.ts` | `await expectEnded(run, fixture, original, 'after the adoption of its successor');` | (line removed) |
| M3 | `credential-cases.ts` | `await expectGrantedAccess(run, fixture, refreshed, 'after its adoption');` | (line removed) |
| M4 | `credential-cases.ts` | `refreshed.version === previous.version + 1` | `true` |
| M5 | `credential-cases.ts` | `refreshed.credentialId === previous.credentialId` | `true` |
| M6 | `credential-cases.ts` | `refreshed.authorization !== previous.authorization` | `true` |
| M7 | `credential-cases.ts` | `credential.version === 1` | `true` |
| M8 | `credential-cases.ts` | `version: third.version + 1 }` | `version: third.version }` |
| M9 | `credential-cases.ts` | `await expectRefused(run, fixture, readProbe(fixture, second, 'after a stale adoption'));` | (line removed) |
| M10 | `credential-cases.ts` | `await expectReads(run, fixture, third, 'after the adoption of an earlier version');` | (line removed) |
| M11 | `credential-cases.ts` | `await expectEnded(run, fixture, credential, 'after the revocation of its credential');` | (line removed) |
| M12 | `credential-cases.ts` | `reader.authorization !== writer.authorization` | `true` |
| M13 | `source-control-readers.ts` | `authorization: authorizationValue,` | `authorization: nonEmptyText,` |
| M14 | `source-control-readers.ts` | `version: positiveInteger,` | `version: (() => undefined),` |
| M15 | `source-control-readers.ts` | `remoteUrl: httpsRemoteUrl,` | `remoteUrl: text,` |
| M16 | `remote-cases.ts` | `project.remoteUrl === fixture.projectRemoteUrl` | `true` |
| M17 | `remote-cases.ts` | `foreign.remoteUrl !== project.remoteUrl` | `true` |
| M18 | `remote-cases.ts` | `remote.repository === repository` | `true` |
| M19 | `source-control-conformance.ts` | `['adopted credential', checkAdoptedCredential],` | (line removed) |
| M20 | `source-control-conformance.ts` | `['repository remote', checkRepositoryRemote],` | (line removed) |
| M21 | `untrusted-shapes.ts` | `value.length <= MAX_REMOTE_URL_LENGTH && REMOTE_URL.test(value)` | `value.length <= MAX_REMOTE_URL_LENGTH && !/[\s?#]/.test(value) && ((u) => u !== null && u.protocol === 'https:' && u.host !== '' && u.username === '' && u.password === '')(URL.parse(value))` |
| M22 | `untrusted-shapes.ts` | `value.length <= MAX_AUTHORIZATION_LENGTH && AUTHORIZATION.test(value)` | `AUTHORIZATION.test(value)` |

| Mutant | Tests that failed |
| --- | --- |
| M1: the previous version not probed before the adoption | 3, among them "a refresh that ends the previous secret before its adoption is reported" |
| M2: the previous version not probed after the adoption | 3, among them "an adoption that leaves the previous secret working is reported" |
| M3: the refreshed version not probed after its adoption | 3, among them "an adoption that also ends the adopted secret is reported" |
| M4: no next-version check | 1: "a refresh that keeps the version or the credential identifier is reported" |
| M5: no `credentialId` check | 1: the same test |
| M6: no new-`authorization` check | 2, among them "a refresh that keeps the authorization is reported" |
| M7: no version-1 check | 1: "an issue at a version other than 1 is reported" |
| M8: the unissued-version probe names the latest version | 59, every test of a conforming case among them, because a conforming service accepts that confirmation; "an adoption of a version not yet issued that succeeds is reported" included |
| M9: no stale adoption probe | 2, among them "a stale adoption that restores an ended version is reported" |
| M10: no later-version probe | 1: "an adoption that ends a later version is reported" |
| M11: the revocation case probes only the refreshed version | 2, among them "a revocation that leaves an earlier version working is reported" |
| M12: no distinct-`authorization` check | 2, among them "one authorization shared between runs is reported" |
| M13: `authorization` read as any non-empty text | 1: "an authorization that is not a scheme and credentials is a shape finding" |
| M14: `version` read without a check | 1: "a version that is not a positive integer is a shape finding" |
| M15: the remote URL read as any text | 1: "a remote URL with user information, a query, or a fragment is a shape finding" |
| M16 to M18: no fixture, distinct, or echo check of the remote URL | 1 each: "a remote URL of another repository is reported" |
| M19, M20: the adopted credential or repository remote case not run | 94 each: the case count of every run |
| M21: the remote URL checked by the URL parser only, which accepts an IPv6 literal and port 0 | 1: the remote URL shape test |
| M22: `authorization` without the 65536 bound | 1: the authorization shape test |

The compile-time test "a run credential of the SCM port serves as a workspace credential" cannot build against `dev`'s types: with `dev`'s `RunCredential` and `WorkspaceCredential`, `tsc --strict` reports `TS2322: Type 'RunCredential' is not assignable to type 'WorkspaceCredential'` and "Property 'authorization' is missing" (output not kept; the error follows from `dev`'s `RunCredential`, which has no `authorization`).

### Fail-before of the pass 1 fixes

All runs in this worktree with Node.js 24.22.1.

- Findings 1 and 2: with the new tests and the in-memory SCM of the fix round, and `packages/modules/integrations/src/ports/credential-cases.ts` and `remote-cases.ts` checked out from `1cae2eb3` (`git checkout 1cae2eb3 -- <both files>`, `npx tsc -b packages/modules/integrations`, then `node --experimental-strip-types --test packages/modules/integrations/test/*.test.ts`), 105 tests ran, 101 passed and 4 failed: "an adoption of an unknown credential that succeeds is reported", "an adoption of a revoked credential that succeeds is reported", and "a remote URL invented for a repository the plugin cannot see is reported", each with an empty finding list where one finding was expected, and "a remote URL of another repository is reported", whose patched provider now also gets the hidden-repository finding. The files were restored and rebuilt; then 105 of 105 passed, three runs.
- Finding 4: `Date.now` advanced by 200 ms on every call emulates a slow host: `node --experimental-strip-types --import 'data:text/javascript,const n=Date.now;let k=0;Date.now=()=>n()+200*++k;' --test --test-name-pattern='moves the expiry back' packages/modules/integrations/test/source-control-results.test.ts`. On `1cae2eb3` (working tree stashed and the package rebuilt) the test failed with extra `refreshRunCredential returned an expiresAt that is not a canonical future instant` findings; on the fix round it passed (1 of 1).
- Finding 3 changes a scenario, and finding 5 this record; neither is a behavior.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `a68207eb`, tree `6e8ee9f9` | Passed, profile full, stamp written: tests 4126, suites 49, pass 4079, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.66 % branches, 98.84 % functions; `credential-cases.js`, `remote-cases.js`, and `source-control-readers.js` 100 % each; `untrusted-shapes.js` 100 % lines, 95.65 % branches, 96.55 % functions; "Contract documents have no undeclared breaking change." An earlier run on the same commit passed with the same totals but wrote no stamp, because this record was written in the worktree during the run |
| `npm run openspec -- validate revise-scm-port-refresh-and-authorization --strict` | `a68207eb` | `Change 'revise-scm-port-refresh-and-authorization' is valid` |
| `npm run verify:archive` | `9f62a58c` | "Every active OpenSpec change archives into strictly valid specs." |
| Focused runs | `f2619531` | `packages/modules/integrations/test/*.test.ts`: 102 of 102, three runs; `packages/modules/workspace/test/workspace-domain.test.ts`: 27 of 27 |

### Route

Route (`route.json`, rule version 3): elevated (lines, files, security, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `codex gpt-6.1-sol#high` only after a pass 2 with a Medium or worse finding. The shadow router failed with a timeout, so the rule decided alone. The efforts above standard are a recommendation that needs governance authorization; the coordinator runs the reviews.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `6e8ee9f9556d3bbd3ff332d520d2966960623d36`; tests 4126, pass 4079, fail 0, skipped 47; all files 99.36% lines, 92.66% branches, 98.84% functions.
- `npm run openspec -- validate revise-scm-port-refresh-and-authorization --strict`: passed, `Change 'revise-scm-port-refresh-and-authorization' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 95 file(s); every pass summary file is valid: 75 file(s); every route file is valid: 30 file(s).`.
- Spec diff against the merge base `ecf8cd3c62d2` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Every pass runs at effort medium although `route.json` recommends high (owner decision 2026-11-02).

### Pass 1

- Reviewer: role A, Codex CLI, model `gpt-6-astra`, effort medium; session `01a19e52-ff6c-7252-9ddb-1be5470ae760`; run by the coordinator on head `1cae2eb3`, which reported in Bulgarian; recorded here in English.
- Counts: Critical 0, High 0, Medium 4, Low 1, as in `passes.jsonl`.
- Findings and resolutions (outcome `fixed-unreviewed` until pass 2 checks them):
  1. Medium, missing-fail-before-test (`packages/modules/integrations/src/ports/credential-cases.ts:63`): the adopted credential case probed adoption only for a version not yet issued, so a provider that confirmed an unknown or revoked credential passed. Fixed in `86a5e39a`: after the revocation the case confirms the revoked credential and an unknown one and expects `not-found`; defects `adoptsUnknownCredential` and `adoptsRevokedCredential` and their tests.
  2. Medium, contract-drift (`packages/modules/integrations/src/ports/remote-cases.ts:8`): no refusal check for a repository the plugin cannot see. Fixed in `86a5e39a`: the fixture's new `hiddenRepository`, a `not-found` check, the defect `resolvesHiddenRepository` and its test; contract section 8 and 9 and the delta name it (`705ca4e1`).
  3. Medium, spec-wording (`specs/scm-port/spec.md:14`): scenario "Long run" refreshed after the expiry. Fixed in `705ca4e1`: the refresh comes before the expiry, and the previous version works until the adoption, a revocation, or its own expiry, whichever comes first.
  4. Medium, test-flakiness (`packages/modules/integrations/test/source-control-results.test.ts:138`): an expiry one second ahead of the live clock. Fixed in `9b7136e4`: `ScmSetup.now` injects the fake's clock, the test freezes it and sets the expiry half a lifetime ahead, before the original expiry.
  5. Low, evidence-mismatch (`verification.md:33`): fail-before evidence cited files only in a session scratchpad. Fixed in this record: the mutant table gives each exact edit and the commands, and no record names a file outside the repository.
- Fail-before: "Fail-before of the pass 1 fixes" above.

### Scope widening

Execution wire contracts section 8.7, "Version": scope widened by coordinator decision 2026-11-03 (contract drift created by the port change). The sentence now says that a fetch answers `credential-ended` for an ended version, which ends when a confirmed adoption of a higher version ends it, when its own `expiresAt` passes, or on a revocation. Wording only: no wire schema, OpenAPI or AsyncAPI document, reason code, or wire version changed. The living `execution-wire-contracts` spec still has scenario "Ended version", "a version whose secret a refresh ended"; it was reported to the coordinator and not edited.

## Limitations

- The suite ran only against the in-memory SCM. A live service run of the revised cases, including a version that outlives an earlier one's expiry, is item 20's GitHub plugin work (contract section 9).
- The deadline of an unconfirmed version is its own expiry; no test waits for a live expiry.

## Questions for the coordinator

1. Execution wire contracts section 8.7, "Version": resolved by the coordinator's scope widening of 2026-11-03 (see "Scope widening"). Open: scenario "Ended version" of the living `execution-wire-contracts` spec still says "a version whose secret a refresh ended"; this change does not edit it.
2. The port adds `version` to `RunCredential` and the request `RunCredentialAdoption`, which the brief did not name, because a confirmation must say which of several live versions the run adopted (design decision 1). It matches the wire's version numbering.

## Remaining gates

- Independent review passes 1 to 3 as governance assigns them.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
