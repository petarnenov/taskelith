# Verification: extend-execution-http-contracts

Status: developed and verified by the author; review passes 1 and 2 done and their findings fixed; pass 3 by reviewer A done without findings; archived on the branch under worker step 7.

## Scope and source

- G3 item 9 ([G3 work plan](/docs/g3-plan.md), row 9), sub-change 9c, size M, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent from `dev` `ff7ab7a0`, in parallel with 9b. Contract-first only: the extensions of `execution.openapi.json`, its contract tests, the contract page, and the spec delta. No adapter, handler, or port change (items 10, 12, 21, 38, and 44).
- The architect's decisions of 2026-10-28 as the brief gives them: worker-facing and shared-path operations stay in `execution.openapi.json`; the browser session and CSRF schemes of 9a; a refreshed SCM credential travels as a notice and is fetched over HTTPS, scoped to the run, written once, read by its owner, and logged without its value; slot credential re-delivery in 9c with the same pattern, and (architect, 2026-10-28, before review pass 1) the first slot credential delivery through the same `fetchSlotCredential` with no new operation, the authorization-only narrowing of the evidence reads kept as declared, and the SCM credential operations kept in 9c; a delegation result read here and the response command in 9d; item 44 defined from [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 and [product ports](/docs/contracts/product-ports.md) section 4.1; and 9a's obligation that every issue or re-delivery of a per-run SCM credential re-checks the bound remote URL ([control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 4.1).
- Where the sources are silent, [design](design.md) decisions 1 to 11 record the minimal shape chosen and the source it relies on.
- Excluded: the 9b and 9d operations and messages; any change to `control-plane.openapi.json` and the other documents; the wording of the refreshed credential in the G3 plan row 9 and source control section 3, which the architect left to 9d.

## Revision

- Base: `dev` `ff7ab7a0`.
- `764de1d8` `chore(contracts): extend the execution HTTP contracts for G3` (document, contract tests, contract page section 8, G3 plan row 9, account pool section 7, change record, spec delta).
- `00598c7b` `docs: route the extend execution HTTP contracts change` (`route.json`, unedited). The `make verify` run below checked this commit's tree.
- `cec67667` `docs: record the verification of the extend execution HTTP contracts change` (this record and `tasks.md`).
- `2f97c01e` `chore: align two shared schema descriptions with the control-plane document` (the descriptions of `DelegationResultOutcome` and `ExecutionEvidenceKind`, byte-identical to 9b's control-plane document).
- `f50c7010` `chore: define the first slot credential delivery and the evidence role scenario` (the architect's decisions of 2026-10-28: `fetchSlotCredential` descriptions, design decisions 9 and 10, the spec delta, contract page sections 8.1, 8.6, and 9, the account pool section 7 sentence, and a contract test).
- `041ef537` `docs: record the first slot credential delivery in the verification record` and `12e41374` `docs: record the verification of the first slot credential delivery` change only this record; `12e41374` is the head that review pass 1 reviewed.
- `9bd16222` `chore: fix review pass 1 findings of the execution HTTP contracts` (document, contract page sections 8.2, 8.4, 8.6, and 8.7, design decisions 5, 7, and 10, the spec delta, and five tests).
- The commit `docs: record review pass 1 of the execution HTTP contracts` adds `passes.jsonl`, `findings.jsonl`, and the pass 1 section; the `make verify` run of pass 1's fixes checks its tree, and the commit after it records that run. The earlier `make verify` runs below checked older trees and stay as history.
- `a872b982` `chore: fix review pass 2 findings of the execution HTTP contracts` (document, contract page sections 8.1, 8.2, 8.5, 8.6, 8.7, and 9, account pool sections 7, 7.3, 8, and 8.1, design decisions 4, 5, 7, 8, 9, and 10, the proposal, the `execution-wire-contracts` delta, the new `evidence-store` delta, and the tests).
- The commit `docs: record review pass 2 of the execution HTTP contracts` adds the pass 2 lines of `passes.jsonl` and `findings.jsonl`, the pass 2 section, and the record fixes of findings 17 to 20; `make verify` on `98859f2b` (log `eehc-verify-6.log`) checked its tree, and `9040fd6e` `docs: record the verification of review pass 2 fixes of the execution HTTP contracts` records that run.
- `617926ca` merges `origin/dev` at `a3a0ac4c` (`declare-contract-breaking-changes`, #393, and the other changes since `ff7ab7a0`), without conflicts.
- `fa36b9e1` `chore: record that the evidence read narrowing has no computed breaking change` (design decision 2, contract page section 8.2).
- The commit `docs: record the merge of dev and the breaking-change check of the execution HTTP contracts` (`bfc8f9cd`) updates this record; the `make verify` run below (log `eehc-verify-8.log`) checks its tree, and `a50bd344` records that run; `a50bd344` is the head that review pass 3 reviewed.
- The commit `docs: record review pass 3 and the architect follow-ups of the execution HTTP contracts` adds the pass 3 line of `passes.jsonl` and the pass 3 section, and, as the architect accepted on 2026-10-28 after pass 3, names the evidence exception in the contract page section 8.2 and the semantic breaking-change gap under "Remaining gates"; the `make verify` run of pass 3 (log `eehc-verify-9.log`) checks its tree, and the commit after it records that run.

## Environment

Native Ubuntu Linux host (the worker's), x86_64; Node.js and npm from `.nvmrc`; Docker for `make test` and `make contract-compatibility`.

## Author self-check

- **Scope.** `execution.openapi.json` from 0.5.0 to 0.6.0. Changed: `readEvidence` and `downloadEvidence` (browser session or operator bearer, `AuthenticationFailure` on 401, 404 for a principal without a role on the record's project). Added: `retireEvidence`, `readDelegationResult`, `listUnknownExecutions`, `listUnrecordedProcesses`, `readmitTask`, `fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential`; the schemes `browserSession` and `csrfToken`; and the schemas `AuthenticationFailure`, `AccessDenial`, `CsrfRejection`, `ExternalId`, `RemoteUrl` (copied unchanged from the control-plane document), `RetentionRefusal`, `DelegationResultOutcome`, `DelegationSummary`, `DelegationResult`, `ExecutionEvidenceKind`, `UnknownExecution`, `UnknownExecutionPage`, `UnknownExecutionCursor`, `UnrecordedProcess`, `UnrecordedProcessPage`, `UnrecordedProcessCursor`, `Readmission`, `ReadmissionRefusal`, `RevealedSlotCredential`, `SlotCredentialDelivery`, `SlotCredentialRefusal`, `ScmPermission`, `ScmCredentialRequest`, `RevealedScmSecret`, `ScmAuthorization`, `ScmCredentialDelivery`, and `ScmCredentialRefusal`. No other document changed.
- **Architect decisions before pass 1.** `fetchSlotCredential` is the first slot credential delivery and every re-delivery, scoped to the reservation of the execution's attempt and the slot, with no credential in `LaunchGrant`; the requirement "Slot credential delivery" gained the scenarios "First fetch after the launch authorization", "Later fetch re-delivers the version", and "Slot outside the reservation", and "Per-project evidence reads" the scenario "Reader without a role"; a test checks that only `fetchSlotCredential` delivers a slot credential and that `LaunchGrant` reaches none.
- **Version.** The brief named 0.4.0 to 0.5.0; `dev` already carries 0.5.0 from `bf25c6d5` (G3 sub-change 26b), so the change takes 0.6.0 (design decision 2).
- **Breaking change.** With the document left at 0.5.0, `make contract-compatibility` reported `packages/contracts/documents/execution.openapi.json: 0 breaking change(s) against ff7ab7a0622d.`: oasdiff compares schemas, not authorization. The narrowing of the evidence reads is still declared by the minor version and stated in the contract page section 8.2. At `ff7ab7a0` there was no `packages/contracts/breaking-changes.json`. After the merge of `dev` at `a3a0ac4c`, which carries `declare-contract-breaking-changes`, `make contract-breaking-changes` printed `0 breaking change(s) against a3a0ac4cea7c.` for every document and `{"declarations": []}`, so the file gets no entry; a probe entry for `execution.openapi.json` 0.6.0 naming the narrowing made `make contract-compatibility` fail with `lists for 0.6.0 a change not found over 0.5.0`, and was removed (design decision 2).
- **Shared vocabulary.** A test compares the reused schemes and schemas with the control-plane document; the generator, which refuses one name with two definitions, generated the bundle (`node --experimental-strip-types scripts/generate-contracts.ts`).
- **Domain vocabularies.** `DelegationResultOutcome`, `ExecutionEvidenceKind`, and `ScmPermission` equal `DELEGATION_OUTCOMES`, `EXECUTION_EVIDENCE_KINDS`, and `SCM_PERMISSIONS`; the first six reasons of both credential refusals, `quarantined` to `attempt-not-launchable`, are the first six of `LAUNCH_REJECTION_REASONS` in their order (a deep equality since pass 2); the remote reasons of `ScmCredentialRefusal` equal those of `BindingRefusal` without `merge-method-undeclared`, in its order.
- **Fail-before.** With the `ff7ab7a0` document and the new tests, `the execution document is OpenAPI 3.1.0 at version 0.6.0 with the 9c operations` fails with `actual: '0.5.0'`.
- **Citations.** `bf25c6d5` is the 0.5.0 bump; the other citations name sections or symbols, checked against the files at `ff7ab7a0`.
- **Evidence check.** Every result below was copied from the output of the command named beside it, on the state named beside it.

## Checks

| State | Command | Result |
| --- | --- | --- |
| Working tree before `764de1d8` | `npm run openspec -- validate extend-execution-http-contracts --strict` | `Change 'extend-execution-http-contracts' is valid` |
| Same | `npm run verify:links`; `npm run verify:comments`; `npm run verify:findings`; `npm run verify:archive`; `npx tsc -p tsconfig.check.json` | Every checked link conforms; every comment is within the rule; every findings file is valid: 68 file(s), 48 pass summary files, 3 route files; every active OpenSpec change archives into strictly valid specs; `tsc` exit 0 |
| Same, after `npm run build` | `node --experimental-strip-types --test packages/contracts/test/*.test.ts` | 71 tests, all passed |
| Same, document at version 0.5.0 | `make contract-compatibility` | `0 breaking change(s)` for every document; `Contract documents have no undeclared breaking change.` |
| Same | Spec delta requirement body lengths, in characters | Execution HTTP operations 496, G3 execution operations 448, Per-project evidence reads 328, Evidence retirement 321, Delegation result read 369, Reconciliation queue reads 318, Task re-admission 326, Slot credential re-delivery 350, Per-run SCM credential delivery 384, Remote re-check at SCM credential delivery 388, Credential deliveries never kept 255 |
| `764de1d8` | `make findings ARGS="route --change extend-execution-http-contracts"` | Committed unedited as `00598c7b`: tier `elevated` (triggers `lines`, `contracts`), rule version 1; recommended pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow router failed with `missing-credential`, so the rule decided alone |
| `00598c7b` | `make verify`, first run (log `eehc-verify-1.log` in the session scratchpad) | Failed in `make test`: 3118 tests, 3055 passed, 1 failed, 62 skipped; the failure is `a partition while the process runs keeps its observations, published once after the heal` (`test/g2-partition.test.ts`), `the start is recorded not met within 20000 ms`, a Docker scenario that this change does not touch, run while the sibling 9b ran its checks on the same host. Rerun once, as the brief allows |
| `00598c7b`, clean tree | `make verify`, second run (log `eehc-verify-2.log` in the session scratchpad) | Passed, stamp written; generated part below |
| This record | `make record CHANGE=extend-execution-http-contracts LOG=<log>`; `make record-check CHANGE=extend-execution-http-contracts` | Generated part written; `the generated part matches the tree` |
| Working tree before `f50c7010` | `npm run openspec -- validate extend-execution-http-contracts --strict` | `Change 'extend-execution-http-contracts' is valid` |
| Same | `npm run verify:links`; `npm run verify:comments`; `npm run verify:archive`; `npx tsc -p tsconfig.check.json` | Every checked link conforms; every comment is within the rule; every active OpenSpec change archives into strictly valid specs; `tsc` exit 0 |
| Same, after `npm run build` | `node --experimental-strip-types --test packages/contracts/test/*.test.ts` | 72 tests, all passed |
| Same | Spec delta requirement body lengths, in characters | Execution HTTP operations 496, G3 execution operations 448, Per-project evidence reads 328, Evidence retirement 321, Delegation result read 369, Reconciliation queue reads 318, Task re-admission 326, Slot credential delivery 461, Per-run SCM credential delivery 384, Remote re-check at SCM credential delivery 388, Credential deliveries never kept 255 |
| After `2f97c01e` | `make verify`, third run (log `eehc-verify-3.log` in the session scratchpad) | No result: stopped during `make test` (`make: *** [Makefile:42: verify] Terminated`) when the architect's decisions of 2026-10-28 changed the tree for `f50c7010`; not a failure of a check |
| `041ef537`, clean tree | `make verify`, fourth run (log `eehc-verify-4.log` in the session scratchpad) | Passed at the first attempt, stamp written; 3119 tests, 3057 passed, 0 failed, 62 skipped; generated part below |
| This record | `make record CHANGE=extend-execution-http-contracts LOG=<log>`; `make record-check CHANGE=extend-execution-http-contracts` | Generated part rewritten for the fourth run; `the generated part matches the tree` |

## Limitations

- Contract only: no handler enforces the roles, the 404 for a principal of another project, the credential checks and their order, the remote re-check, or the refusal records; items 10, 12, 21, 38, and 44 must, and their tests must check them.
- The breaking narrowing of the evidence reads is invisible to `make contract-compatibility` and `make contract-breaking-changes` (design decision 2); only the minor version and the contract page declare it, and `packages/contracts/breaking-changes.json` cannot list it.
- The first slot credential delivery is `fetchSlotCredential` after the launch authorization (design decision 9); item 12 implements it and defines no other wire form.
- The shadow answer of `route.json` is missing, failure code `missing-credential`, because the session environment that routed the change predated the shadow router's key; `route.json` stays as it is and the change is not routed again (architect decision, 2026-10-28).
- The route record recommends reviewer A at `high` and reviewer B at `xhigh`. Under governance "Routed effort" these elevated efforts apply only after a later governance change that the owner approves; the coordinator assigns the reviewers and efforts.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `440cf1103f24fec22f70d9077f16fa774d8fceb6`; tests 3172, pass 3119, fail 0, skipped 53; all files 99.37% lines, 92.78% branches, 99.03% functions.
- `npm run openspec -- validate extend-execution-http-contracts --strict`: passed, `Change 'extend-execution-http-contracts' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 70 file(s); every pass summary file is valid: 50 file(s); every route file is valid: 6 file(s).`.
- Spec diff against the merge base `a3a0ac4cea7c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a18262-f3c8-7d62-8ea3-5f9432d7c185` | 0 | 1 | 6 | 1 |
| 2 | B | `claude claude-opus-5-5#high` | `e3dce30b-4b91-4e67-9d93-938b72c7ae27` | 0 | 0 | 10 | 10 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a18299-898a-7f02-9758-9ddb732a97f7` | 0 | 0 | 0 | 0 |
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, variant `medium`, session `01a18262-f3c8-7d62-8ea3-5f9432d7c185`, read-only, on `12e41374` (diff `ff7ab7a0...12e41374`); the snapshot was unchanged by the review.
- Invocation: `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, the Codex CLI (gpt-6.1-sol) row of the [agent task protocol](/docs/agent-task-protocol.md). Model confirmation: the output header of Codex v0.163.0 showed `model: gpt-6.1-sol`, `reasoning effort: medium`, `sandbox: read-only`, and the session ID above (recorded in pass 2, finding 19).
- Result: Critical 0, High 1, Medium 6, Low 1, each claim checked against its source before the fix, all fixed in `9bd16222` and recorded in `findings.jsonl`.
  1. High, retention counted from the capture: it counts from `publishedAt`, as `retentionEndsAt` and the evidence-store specification do (contract page section 8.2, design decision 5, scenario "Old capture published recently").
  2. Medium, `details.retainedUntil` untyped and optional: `RetentionRefusal` requires it as an `Instant`.
  3. Medium, the evidence bound of 64 could not represent a valid domain object: `withEvidence` keeps every entry and no source sets a bound, so the bound is removed (design decision 7).
  4. Medium, evidence of only `cancellation-not-applied` validated: `contains` requires an entry of another kind, as `isUnknownExecution` does.
  5. Medium, page cursors by a non-unique identifier: the order and cursors are by task then execution identifier and by worker then observation identifier, the `unrecorded_processes` key, with `UnknownExecutionCursor`, `UnrecordedProcessCursor`, and paired `after` parameters (contract page section 8.4).
  6. Medium, `credential-ended` only for a fetch: an issue whose current version a revocation ended answers it too, after the remote checks; the refusal order is unchanged (contract page section 8.7, design decision 10).
  7. Medium, scenario "Revoked slot" expected `revoked`: a revocation cancels the attempt (account pool section 8.1), so the scenario expects the earlier `attempt-not-launchable` of section 7.3.
  8. Low, "Repeated issue" ignored a refresh between the calls: the same version only without a refresh between, and scenario "Refresh between two issues".
- Fix checks, on the working tree of `9bd16222`:

| Command | Result |
| --- | --- |
| `npm run openspec -- validate extend-execution-http-contracts --strict` | `Change 'extend-execution-http-contracts' is valid` |
| `npm run verify:links`; `npm run verify:archive`; `npm run verify:comments`; `npx tsc -p tsconfig.check.json` | Every checked link conforms; every active OpenSpec change archives into strictly valid specs; every comment is within the comment length rule; `tsc` exit 0 |
| `node --experimental-strip-types --test packages/contracts/test/*.test.ts`, after `npm run build` | 75 tests, all passed |
| Fail-before: `execution-http-contracts.test.ts` with the document of `12e41374`, after `npm run build` | tests 18, pass 13, fail 5: `evidence retirement refuses a record within its retention with a typed 422`, `the retention counts from the publication, not the capture`, `the reconciliation queue pages by a composite position with at most 100 items`, `a page boundary between equal identifiers keeps its position`, `an unknown execution keeps all its evidence, not only an unapplied cancellation`; restored, 18 of 18 pass |
| Spec delta requirement body lengths, in characters | Execution HTTP operations 496, G3 execution operations 448, Per-project evidence reads 328, Evidence retirement 412, Delegation result read 369, Reconciliation queue reads 402, Task re-admission 326, Slot credential delivery 461, Per-run SCM credential delivery 448, Remote re-check at SCM credential delivery 413, Credential deliveries never kept 255 |
| `make findings ARGS="validate"` | `Every findings file is valid: 68 file(s); every pass summary file is valid: 48 file(s); every route file is valid: 4 file(s).` |
| `make verify` on `ece9f904`, clean tree (log `eehc-verify-5.log` in the session scratchpad), one run, no rerun | Passed, profile full, tree `7271de8c`, stamp written; generated part below |

The fixes change contracts, not only records, and pass 1 found a High finding, so pass 2 by reviewer B is required, and pass 3 by reviewer A if governance "Conditional third pass" requires it after pass 2.

### Pass 2

- Reviewer B: Claude Code, model `claude-opus-5-5`, effort `high`, permission mode `plan`, session `e3dce30b-4b91-4e67-9d93-938b72c7ae27`, on `e31e6481` over the diff `ff7ab7a0...e31e6481`; the snapshot before and after the review was `8678f2b8b4fd81af5cfb2a170e76419d7965c057ecc0ae748b6ed432e4c3e3a1`, unchanged. It confirmed that the eight pass 1 fixes resolve their findings.
- Invocation: `env -u JEV_MAF_LAB claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`, the Claude Code (claude-opus-5-5) row of the [agent task protocol](/docs/agent-task-protocol.md). Model confirmation: the last `"type":"result"` line of the log has `claude-opus-5-5` as the only model in `modelUsage`, subtype `success`, and the session ID above.
- Result: Critical 0, High 0, Medium 10, Low 10, each verified against the sources before the fix, none declined, all fixed and recorded in `findings.jsonl` with `missedBy` pass 1, role A; the reviewer reports that pass 1 missed all 20. Findings 1 to 16 are fixed in `a872b982`, 17 to 20 in the commit that records this pass.
  1. Medium, contract-drift: an `evidence-store` delta modifies "Evidence reads" and "Evidence retention" (session, project roles, 404, `retireEvidence`, 422, `details.retainedUntil`); the proposal names the capability.
  2. Medium, contract-drift: the coordinator's choice, 404 for a principal without a role on the task's project, was conditioned by the architect on 9a and 9b using the same rule. They do not: 9a checks the role on the project named in the path first and answers 403 `role-required` (control-plane section 2), and 9b decision 7 reads an item only after the role. So `readmitTask` follows 9a: a required `projectId` query parameter, the role checked before the task is read, and 403 whether the task exists or not; the read-before-role rule stays only on the evidence path (design decisions 4 and 8, contract page sections 8.1, 8.2, and 8.5, scenario "Principal without a role on the project").
  3. Medium, spec-wording: the remote re-check runs after the ownership checks in the requirement and both descriptions; scenario "Ownership before the binding".
  4. Medium, contract-drift: account pool section 7's condition stays: an `authorized` execution with no earlier delivery needs its grant unexpired and not `revoked`, found from the execution with no new parameter, or gets `execution-conflict`; for an execution that had a delivery, section 7.3's ownership checks stand in (account pool section 7, design decision 9, requirement "Slot credential delivery checks").
  5. Medium, concurrency-race: a download whose record was retired between its reads answers 404; scenario "Download during retirement".
  6. Medium, error-handling: a removed record answers 204 even when its content's removal fails, left to a sweep of unreferenced digests, an obligation on item 10; scenario "Content removal fails".
  7. Medium, concurrency-race: the first SCM credential issue is serialized per run, the loser returning the winner's version; scenario "Concurrent first issues".
  8. Medium, contract-drift: `Readmission` requires `readmissionId` (product ports section 2, rule 7); scenarios "Concurrent re-admissions" (different keys) and "Repeated re-admission".
  9. Medium, contract-drift: the automatic re-admission includes the task whose launch grant a product writer revoked (G3 plan row 44); the example left `readmitTask`'s description; design decision 8 corrected.
  10. Medium, error-handling: an unknown attempt, execution, or run is 422 `assignment-not-active` after the installation and worker checks, as `rejectUnknownAssignment`; `fetchSlotCredential` and `issueRunScmCredential` have no 404.
  11. Low: the execution is found by `attemptId` and `executionId` together.
  12. Low: account pool section 7.3 names the wire reason `delivery-not-admitted`.
  13. Low, redaction: a refusal names only the reason and identifiers, never the remote URL or a secret.
  14. Low: obligation on item 44 to bound or condense an unknown execution's evidence; no schema bound.
  15. Low: an expired version answers `credential-ended` for an issue and a fetch.
  16. Low: the cursor test is named for what it checks, and the ownership reasons equal the first six `LAUNCH_REJECTION_REASONS` in order.
  17. Low, evidence-mismatch: the third `make verify` run is recorded.
  18. Low: the self-check scope names both cursor schemas.
  19. Low, process: pass 1 records its invocation and model confirmation.
  20. Low, process: "Remaining gates" names the breaking-change entry.
- Outside the findings, as the reviewer noted: account pool sections 8 and 8.1 now name the refusals that section 7.3's order gives, `removed` for a drained attempt, whose removal cancels nothing, and `attempt-not-launchable` after a revocation, which cancels the attempt.
- Fix checks, on the working tree of `a872b982`:

| Command | Result |
| --- | --- |
| `npm run openspec -- validate extend-execution-http-contracts --strict` | `Change 'extend-execution-http-contracts' is valid` |
| `npm run verify:links`; `npm run verify:archive`; `npm run verify:comments`; `npx tsc -p tsconfig.check.json` | Every checked link conforms; every active OpenSpec change archives into strictly valid specs; every comment is within the comment length rule; `tsc` exit 0 |
| `node --experimental-strip-types --test packages/contracts/test/*.test.ts`, after `npm run build` | 76 tests, all passed |
| Fail-before: `execution-http-contracts.test.ts` with the document of `e31e6481`, after `npm run build` | tests 19, pass 17, fail 2: `a re-admission names its project, key, and generation and is refused with a typed reason`, `an unknown execution or run of a worker is a typed refusal, not a 404`; restored, 19 of 19 pass |
| Spec delta requirement body lengths, in characters | `execution-wire-contracts`: Execution HTTP operations 496 (unchanged since `764de1d8`), G3 execution operations 448, Per-project evidence reads 425, Evidence retirement 469, Delegation result read 369, Reconciliation queue reads 402, Task re-admission 449, Slot credential delivery 340, Slot credential delivery checks 474, Per-run SCM credential delivery 476, Remote re-check at SCM credential delivery 480, Credential deliveries never kept 255; `evidence-store`: Evidence reads 357, Evidence retention 375 |
| `make findings ARGS="validate"` | `Every findings file is valid: 68 file(s); every pass summary file is valid: 48 file(s); every route file is valid: 4 file(s).` |
| `make verify` on `98859f2b`, clean tree (log `eehc-verify-6.log` in the session scratchpad), one run, no rerun | Passed, profile full, tree `7fe69d18`, stamp written: tests 3123, pass 3061, fail 0, skipped 62; generated part below |

The pass 2 fixes change the document, contracts, and tests, not only records and documentation, so governance "Conditional third pass" requires pass 3 by reviewer A.

### Pass 3

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, variant `medium`, sandbox `read-only`, session `01a18299-898a-7f02-9758-9ddb732a97f7`, on `a50bd344`. Scope: the pass 2 fixes `git diff e31e6481..a872b982`, plus `fa36b9e1`, `bfc8f9cd`, and `a50bd344` and the records `98859f2b` and `9040fd6e`, with the whole change `a3a0ac4c...HEAD` as context. The snapshot (`git ls-files -co --exclude-standard | xargs sha256sum | sha256sum`) before and after the review was `993750b3ddeff9fb4fcd314864f6350ecaaeb24dd059b96feb0c0321bb78322b`, unchanged.
- Invocation: `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> -o <report> - < <prompt-file>`, the Codex CLI (gpt-6.1-sol) row of the [agent task protocol](/docs/agent-task-protocol.md). Model confirmation: the Codex log header showed `model: gpt-6.1-sol`, `reasoning effort: medium`, `sandbox: read-only`, and the session ID above.
- Result: Critical 0, High 0, Medium 0, Low 0; no lines in `findings.jsonl`. The reviewer confirmed that all 20 pass 2 findings are resolved and that the fixes introduce no new problem, and accepted both deviations: `readmitTask` requires `projectId` and checks the role before the read with 403 `role-required`, as 9a does; and `packages/contracts/breaking-changes.json` has no entry, because it lists only computed changes, while the version 0.6.0 and the contract page declare the authorization narrowing. Its own checks: 76 of 76 contract tests passed, links and the comment rule conform, all 14 requirement bodies are under 500 characters, no shared schema differs and no path is duplicated, and `git diff --check` is clean. It did not rerun `make verify` or the Docker compatibility checks; it checked their recorded results and the code.
- After pass 3, as the architect (coordinator Niki) accepted on 2026-10-28: the contract page section 8.2 names the evidence paths as the one exception to the control-plane rule and `readmitTask` as checking the role first with 403, and "Remaining gates" names the semantic breaking-change gap. Both are documentation and record edits, unreviewed under governance "Conditional third pass", which allows no fourth pass.

## Merge of dev and the breaking-change check

As the architect asked on 2026-10-28, after pass 2 the branch merged `origin/dev` at `a3a0ac4c` (no rebase) in `617926ca`, with no conflict, and checked the breaking-change declaration that `declare-contract-breaking-changes` added. The gate of design decision 2 is met: the check computes no breaking change for the narrowing, so the file has no entry.

| State | Command | Result |
| --- | --- | --- |
| `617926ca` | `make contract-breaking-changes` | `0 breaking change(s) against a3a0ac4cea7c.` for each of the five documents; printed `{"declarations": []}` |
| `617926ca` | `make contract-compatibility` | `0 breaking change(s)` for every document; `Contract documents have no undeclared breaking change.` |
| `617926ca` with a probe entry for `execution.openapi.json` 0.6.0, removed afterwards | `make contract-compatibility` | Failed: `packages/contracts/breaking-changes.json lists for 0.6.0 a change not found over 0.5.0` |
| `bfc8f9cd`, clean tree | `make verify` (log `eehc-verify-8.log` in the session scratchpad), one run, no rerun | Passed, profile full, tree `8861e309`, stamp written: tests 3172, pass 3119, fail 0, skipped 53; generated part below |

## Archive

Worker step 7, after `ae8fcd27` `docs: record the verification of review pass 3 of the execution HTTP contracts`: every task of `tasks.md` ticked, then `npm run openspec -- archive extend-execution-http-contracts --yes` (`+ 11, ~ 3, - 0`), which moved the change to `openspec/changes/archive/2026-10-28-extend-execution-http-contracts/`. A rehearsal in a scratch copy of `58db9a2a`, removed afterwards, archived the same totals and passed `validate --all --strict` first. The checked state is the tree of the archive commit, the working tree the checks below ran on; only this section and the status line were written after them.

| Command | Result |
| --- | --- |
| `npm run openspec -- validate --all --strict` | `Totals: 71 passed, 0 failed (71 items)` |
| `npm run openspec -- validate --archived --no-interactive`, this change's line | `✓ change/2026-10-28-extend-execution-http-contracts` |
| `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`, merge base `a3a0ac4c` | Only this change's edits: `evidence-store` "Evidence reads" and "Evidence retention" modified with scenarios "Reader of another project" and "Retention end in the refusal"; `execution-wire-contracts` "Execution HTTP operations" modified and 11 requirements added; 2 files, 216 insertions, 3 deletions |
| Moved change files | `findings.jsonl` (28 findings: 8 of pass 1, 20 of pass 2) and `passes.jsonl` (passes 1 to 3) present |
| `make findings ARGS="validate"` | `Every findings file is valid: 70 file(s); every pass summary file is valid: 50 file(s); every route file is valid: 6 file(s).` |
| `make verify` (log `eehc-verify-10.log` in the session scratchpad), one run, no rerun | Passed, profile full, uncommitted working tree, no stamp written: tests 3172, pass 3119, fail 0, skipped 53; all files 99.37% lines, 92.79% branches, 99.03% functions |

## Remaining gates

- An authorization (semantic) narrowing such as that of the evidence reads cannot be declared in `packages/contracts/breaking-changes.json`, because the compatibility check of #393 sees only schema changes; the architect takes a follow-up to let semantic breaking changes be declared.
- Integration into dev by the coordinator (single pull request).

## Follow-ups

- G3 item 12: `fetchSlotCredential` for the first delivery and every re-delivery (design decision 9), with no credential in `LaunchGrant`, the grant check of an `authorized` execution's first delivery, and a record of the executions that had a delivery.
- G3 item 10: the sweep of evidence content that no record refers to, and the 404 of a download whose record was retired meanwhile.
- G3 item 44: `readmitTask` with `projectId` and `readmissionId`, the automatic re-admission of a revoked launch grant, and a domain bound on an unknown execution's evidence.
- G3 sub-change 9d: the refresh notice carries `runId`, `credentialId`, and `version`, which `fetchRunScmCredential` takes, with no SCM credential operation of its own, and the response command reuses `DelegationResult`, `DelegationResultOutcome`, and `DelegationSummary` unchanged (contract page section 9).
- The control-plane wire contracts section 9 lists what other sub-changes own; 9b updated it in parallel, and this change leaves that page to 9b and points to the execution page from the G3 plan row 9.
