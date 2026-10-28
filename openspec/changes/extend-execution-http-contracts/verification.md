# Verification: extend-execution-http-contracts

Status: developed and verified by the author; review pending (passes 1 to 3 below are not yet run).

## Scope and source

- G3 item 9 ([G3 work plan](/docs/g3-plan.md), row 9), sub-change 9c, size M, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent from `dev` `ff7ab7a0`, in parallel with 9b. Contract-first only: the extensions of `execution.openapi.json`, its contract tests, the contract page, and the spec delta. No adapter, handler, or port change (items 10, 12, 21, 38, and 44).
- The architect's decisions of 2026-10-28 as the brief gives them: worker-facing and shared-path operations stay in `execution.openapi.json`; the browser session and CSRF schemes of 9a; a refreshed SCM credential travels as a notice and is fetched over HTTPS, scoped to the run, written once, read by its owner, and logged without its value; slot credential re-delivery in 9c with the same pattern; a delegation result read here and the response command in 9d; item 44 defined from [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 and [product ports](/docs/contracts/product-ports.md) section 4.1; and 9a's obligation that every issue or re-delivery of a per-run SCM credential re-checks the bound remote URL ([control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 4.1).
- Where the sources are silent, [design](design.md) decisions 1 to 11 record the minimal shape chosen and the source it relies on.
- Excluded: the 9b and 9d operations and messages; any change to `control-plane.openapi.json` and the other documents; the first slot credential delivery (design decision 9); the wording of the refreshed credential in the G3 plan row 9 and source control section 3, which the architect left to 9d.

## Revision

- Base: `dev` `ff7ab7a0`.
- `764de1d8` `chore(contracts): extend the execution HTTP contracts for G3` (document, contract tests, contract page section 8, G3 plan row 9, account pool section 7, change record, spec delta).
- `00598c7b` `docs: route the extend execution HTTP contracts change` (`route.json`, unedited). The `make verify` run below checked this commit's tree.
- The commit that adds this record, `docs: record the verification of the extend execution HTTP contracts change`, changes only this record and `tasks.md`; it is the head that review pass 1 reviews.

## Environment

Native Ubuntu Linux host (the worker's), x86_64; Node.js and npm from `.nvmrc`; Docker for `make test` and `make contract-compatibility`.

## Author self-check

- **Scope.** `execution.openapi.json` from 0.5.0 to 0.6.0. Changed: `readEvidence` and `downloadEvidence` (browser session or operator bearer, `AuthenticationFailure` on 401, 404 for a principal without a role on the record's project). Added: `retireEvidence`, `readDelegationResult`, `listUnknownExecutions`, `listUnrecordedProcesses`, `readmitTask`, `fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential`; the schemes `browserSession` and `csrfToken`; and the schemas `AuthenticationFailure`, `AccessDenial`, `CsrfRejection`, `ExternalId`, `RemoteUrl` (copied unchanged from the control-plane document), `RetentionRefusal`, `DelegationResultOutcome`, `DelegationSummary`, `DelegationResult`, `ExecutionEvidenceKind`, `UnknownExecution`, `UnknownExecutionPage`, `UnrecordedProcess`, `UnrecordedProcessPage`, `Readmission`, `ReadmissionRefusal`, `RevealedSlotCredential`, `SlotCredentialDelivery`, `SlotCredentialRefusal`, `ScmPermission`, `ScmCredentialRequest`, `RevealedScmSecret`, `ScmAuthorization`, `ScmCredentialDelivery`, and `ScmCredentialRefusal`. No other document changed.
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

## Limitations

- Contract only: no handler enforces the roles, the 404 for a principal of another project, the credential checks and their order, the remote re-check, or the refusal records; items 10, 12, 21, 38, and 44 must, and their tests must check them.
- The breaking narrowing of the evidence reads is invisible to `make contract-compatibility` (design decision 2); only the minor version and the contract page declare it.
- The first slot credential delivery has no wire form (design decision 9); item 12 owes it.
- The route record recommends reviewer A at `high` and reviewer B at `xhigh`. Under governance "Routed effort" these elevated efforts apply only after a later governance change that the owner approves; the coordinator assigns the reviewers and efforts.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `0f3f6c0f5db45bdde3cab100fcfe57a359c4f459`; tests 3118, pass 3056, fail 0, skipped 62; all files 99.38% lines, 92.78% branches, 99.02% functions.
- `npm run openspec -- validate extend-execution-http-contracts --strict`: passed, `Change 'extend-execution-http-contracts' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 68 file(s); every pass summary file is valid: 48 file(s); every route file is valid: 4 file(s).`.
- Spec diff against the merge base `ff7ab7a0622d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pending: passes 1 to 3 under governance "Independent review process", run by the session that briefed this change.

## Remaining gates

- Review passes 1 and 2, and pass 3 if governance "Conditional third pass" requires it.
- Archive on the branch under worker step 7.
- Integration into dev by the coordinator (single pull request).

## Follow-ups

- G3 item 12: the wire form of the first slot credential delivery (design decision 9).
- G3 sub-change 9d: the refresh notice names the run, the credential, and the version that `fetchRunScmCredential` takes, and the response command reuses `DelegationResult`, `DelegationResultOutcome`, and `DelegationSummary` unchanged (contract page section 9).
- The control-plane wire contracts section 9 still says that evidence retirement and item 44 belong to "9b to 9d"; this change leaves that page to 9b, which edits it in parallel, and points to the execution page from the G3 plan row 9.
