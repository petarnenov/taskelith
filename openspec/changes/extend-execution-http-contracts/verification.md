# Verification: extend-execution-http-contracts

Status: developed and verified by the author; review pass 1 done and its findings fixed; pass 2 pending, and pass 3 if governance "Conditional third pass" requires it; not archived.

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

## Environment

Native Ubuntu Linux host (the worker's), x86_64; Node.js and npm from `.nvmrc`; Docker for `make test` and `make contract-compatibility`.

## Author self-check

- **Scope.** `execution.openapi.json` from 0.5.0 to 0.6.0. Changed: `readEvidence` and `downloadEvidence` (browser session or operator bearer, `AuthenticationFailure` on 401, 404 for a principal without a role on the record's project). Added: `retireEvidence`, `readDelegationResult`, `listUnknownExecutions`, `listUnrecordedProcesses`, `readmitTask`, `fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential`; the schemes `browserSession` and `csrfToken`; and the schemas `AuthenticationFailure`, `AccessDenial`, `CsrfRejection`, `ExternalId`, `RemoteUrl` (copied unchanged from the control-plane document), `RetentionRefusal`, `DelegationResultOutcome`, `DelegationSummary`, `DelegationResult`, `ExecutionEvidenceKind`, `UnknownExecution`, `UnknownExecutionPage`, `UnrecordedProcess`, `UnrecordedProcessPage`, `Readmission`, `ReadmissionRefusal`, `RevealedSlotCredential`, `SlotCredentialDelivery`, `SlotCredentialRefusal`, `ScmPermission`, `ScmCredentialRequest`, `RevealedScmSecret`, `ScmAuthorization`, `ScmCredentialDelivery`, and `ScmCredentialRefusal`. No other document changed.
- **Architect decisions before pass 1.** `fetchSlotCredential` is the first slot credential delivery and every re-delivery, scoped to the reservation of the execution's attempt and the slot, with no credential in `LaunchGrant`; the requirement "Slot credential delivery" gained the scenarios "First fetch after the launch authorization", "Later fetch re-delivers the version", and "Slot outside the reservation", and "Per-project evidence reads" the scenario "Reader without a role"; a test checks that only `fetchSlotCredential` delivers a slot credential and that `LaunchGrant` reaches none.
- **Version.** The brief named 0.4.0 to 0.5.0; `dev` already carries 0.5.0 from `bf25c6d5` (G3 sub-change 26b), so the change takes 0.6.0 (design decision 2).
- **Breaking change.** With the document left at 0.5.0, `make contract-compatibility` reported `packages/contracts/documents/execution.openapi.json: 0 breaking change(s) against ff7ab7a0622d.`: oasdiff compares schemas, not authorization. The narrowing of the evidence reads is still declared by the minor version and stated in the contract page section 8.2. At `ff7ab7a0` there is no `packages/contracts/breaking-changes.json`; when the coming `declare-contract-breaking-changes` change lands in `dev` before the handoff, the branch merges `dev` and adds the entry with `make contract-breaking-changes`.
- **Shared vocabulary.** A test compares the reused schemes and schemas with the control-plane document; the generator, which refuses one name with two definitions, generated the bundle (`node --experimental-strip-types scripts/generate-contracts.ts`).
- **Domain vocabularies.** `DelegationResultOutcome`, `ExecutionEvidenceKind`, and `ScmPermission` equal `DELEGATION_OUTCOMES`, `EXECUTION_EVIDENCE_KINDS`, and `SCM_PERMISSIONS`; the ownership reasons of both credential refusals are `quarantined` or members of `LAUNCH_REJECTION_REASONS`; the remote reasons of `ScmCredentialRefusal` equal those of `BindingRefusal` without `merge-method-undeclared`, in its order.
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
| `041ef537`, clean tree | `make verify`, fourth run (log `eehc-verify-4.log` in the session scratchpad) | Passed at the first attempt, stamp written; 3119 tests, 3057 passed, 0 failed, 62 skipped; generated part below |
| This record | `make record CHANGE=extend-execution-http-contracts LOG=<log>`; `make record-check CHANGE=extend-execution-http-contracts` | Generated part rewritten for the fourth run; `the generated part matches the tree` |

## Limitations

- Contract only: no handler enforces the roles, the 404 for a principal of another project, the credential checks and their order, the remote re-check, or the refusal records; items 10, 12, 21, 38, and 44 must, and their tests must check them.
- The breaking narrowing of the evidence reads is invisible to `make contract-compatibility` (design decision 2); only the minor version and the contract page declare it.
- The first slot credential delivery is `fetchSlotCredential` after the launch authorization (design decision 9); item 12 implements it and defines no other wire form.
- The shadow answer of `route.json` is missing, failure code `missing-credential`, because the session environment that routed the change predated the shadow router's key; `route.json` stays as it is and the change is not routed again (architect decision, 2026-10-28).
- The route record recommends reviewer A at `high` and reviewer B at `xhigh`. Under governance "Routed effort" these elevated efforts apply only after a later governance change that the owner approves; the coordinator assigns the reviewers and efforts.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `7271de8c6850fec5dda85a46834ef031433ee7a9`; tests 3122, pass 3060, fail 0, skipped 62; all files 99.38% lines, 92.80% branches, 98.99% functions.
- `npm run openspec -- validate extend-execution-http-contracts --strict`: passed, `Change 'extend-execution-http-contracts' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 68 file(s); every pass summary file is valid: 48 file(s); every route file is valid: 4 file(s).`.
- Spec diff against the merge base `ff7ab7a0622d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a18262-f3c8-7d62-8ea3-5f9432d7c185` | 0 | 1 | 6 | 1 |
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, variant `medium`, session `01a18262-f3c8-7d62-8ea3-5f9432d7c185`, read-only, on `12e41374` (diff `ff7ab7a0...12e41374`); the snapshot was unchanged by the review.
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

## Remaining gates

- Review pass 2 by reviewer B, and pass 3 by reviewer A if required, with their fixes and records.
- Archive on the branch under worker step 7.
- Integration into dev by the coordinator (single pull request).

## Follow-ups

- G3 item 12: `fetchSlotCredential` for the first delivery and every re-delivery (design decision 9), with no credential in `LaunchGrant`.
- G3 sub-change 9d: the refresh notice carries `runId`, `credentialId`, and `version`, which `fetchRunScmCredential` takes, with no SCM credential operation of its own, and the response command reuses `DelegationResult`, `DelegationResultOutcome`, and `DelegationSummary` unchanged (contract page section 9).
- The control-plane wire contracts section 9 lists what other sub-changes own; 9b updated it in parallel, and this change leaves that page to 9b and points to the execution page from the G3 plan row 9.
