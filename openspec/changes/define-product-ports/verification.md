# Verification: define-product-ports

## Scope and source

- G3 work plan item 8 (`docs/g3-plan.md`), assigned by the coordinator on 2026-10-26, under the owner's decision of 2026-10-26 that starts the G3 wave 1 contracts (items 3, 5, 6, 7, and 8) in parallel with G2.
- Sources: ADR 0008 decisions 2, 3, 4, 5, and 6; the product UI and auto-merge authority specifications; ADR 0013 and ADR 0014 forward-compatibility obligations; the trust model section 3; the SDLC framework mapping and the frozen SDLC framework port.
- Module placement decided by the coordinator on 2026-10-26 (design decision 1).
- Delivered: `docs/contracts/product-ports.md`, the `product-ports` spec delta, Execution port types (`BoardReadModel`, `NeedsYouInbox`, `NeedsYouSource`, `StandingApprovalRules`), the new `@taskelith/integrations` module (`IntakeSource`, `WriteBack`, `AutoMergeSettings`, `MergeQueue`), tests that pin the contract constants, the regenerated dependency inventory, and the G3 plan update.
- Not delivered, by scope: adapters, plugins, wire schemas, and plugin SDK freezing.

## Environment

- macOS 26.6.2 (Darwin 25.6.0), arm64; Node.js v24.21.0 from `.nvmrc` through `nvm use`.
- Worktree `../taskelith-worktrees/define-product-ports`, branch `define-product-ports`, created from `origin/dev` at `c89cf6c`.

## Author self-check before review

- The board column rule was checked by hand against the OpenSpec plugin's stage graph (`packages/plugins/sdlc-openspec/src/openspec-framework.ts`) and the SpecKit mapping fixture (`packages/plugins/sdlc-speckit/test/speckit-mapping-cases.ts`).
- No module type, value, or test names a source, SCM, harness, or framework; `@taskelith/integrations` imports only kernel, sdlc, and execution, the last type-only.
- Every comment is within the comment length rule.
- Evidence check: every document, ADR, specification, and source file that the contract cites was read at the base revision, and each relative link in `docs/contracts/product-ports.md` resolves to an existing file.

## Checks

| Revision | Command | Result |
| --- | --- | --- |
| `07f73f6` (contract text edit made during the run, doc only) | `make verify` | Passed: 1390 tests, 0 failed; coverage over all files 99.23% lines, 91.51% branches, 98.69% functions; 62 OpenSpec items valid; archive dry run valid; package verification passed |
| `07f73f6` | `npm run openspec -- validate define-product-ports --strict` | Valid |
| `e4110d2` (fixes after pass 1) | `make verify` | Passed: 1390 tests, 0 failed; coverage 99.23% lines, 91.52% branches, 98.69% functions; archive dry run and package verification passed |
| `8083da3` (fixes after pass 2) | `make verify` | Passed before pass 3: 1390 tests, 0 failed; coverage 99.23% lines, 91.52% branches, 98.69% functions |
| Final commit, the head handed off (unreviewed Low fixes after pass 3) | `make verify`; `npm run openspec -- validate define-product-ports --strict` | Passed: 1390 tests, 0 failed; coverage 99.23% lines, 91.51% branches, 98.69% functions; archive dry run and package verification passed; change valid. The `pre-push` hook ran `make verify` again on push |

## Independent review

### Pass 1

- Reviewer: Claude Code, assigned by the coordinator. Invocation from the worktree: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, prompt file kept outside the worktree.
- Model confirmation: `claude-fable-5-1` in `modelUsage` (`claude-opus-5-5` also listed, for the tool's auxiliary calls). Session ID `c8f5bd99-ea38-42f3-962f-a4132a63754c`.
- Reviewed revision: `07f73f6` against `origin/dev`.
- Snapshot before and after: `403356ab38f2f77057535a749e3bc2142f18d3bcc13f04403c4a55b2b07e4412`, unchanged.
- Findings: Critical 0, High 1, Medium 5, Low 9.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | The contract, the delta, and the product UI "Merge" scenario disagreed on when a card moves to Archived | Contract rule 6 and the delta now move the card to `archived` once its merge request is `merged`, even while the Close stage runs; a delta scenario and a required test were added |
| 2 | Medium | "An implementation stage precedes it" was ambiguous for OpenSpec `review`, which depends only on `verify` | Rule 3 now says a transitive dependency in `dependsOn` |
| 3 | Medium | `withdrawn` had no board merge gate value | Section 3.4 maps each withdrawal reason |
| 4 | Medium | Escalation answers had no merge queue transition | Added `manual-merge` and `maintainer-withdrew` reasons and a `queued` transition for `retry`; section 6.3 states each answer's effect |
| 5 | Medium | The idempotency rule did not match the ports, and enqueueing had two definitions | Rule 2.7 names the means per command (key, compare-and-set, or natural key); `MergeEnqueue` lost its key and is idempotent per run and head |
| 6 | Medium | `answeredBy` read as the responder, and the item had no `state` | Renamed `answerableBy`; `NeedsYouItem` carries `state` with the resolution only when resolved |
| 7 | Low | "Names no source" contradicted the parties table | Limited to the ports and their types |
| 8 | Low | "Earliest stage in the graph's order" was undefined for a DAG | Topological order of `dependsOn`, ties by the port's order |
| 9 | Low | A required test for a stage matching no rule had no rule | Rule 7 states the parser rejects such a stage; the test was replaced |
| 10 | Low | Shared identifiers lived in a port file | `PrincipalId`, `IdempotencyKey`, and `NativeRequestId` moved to `domain/identifiers.ts` |
| 11 | Low | `Result<MergeRequest \| undefined>` was a sentinel | `claimNext` returns a named `MergeClaim`; `forRun` fails as `not-found` |
| 12 | Low | `gate` was required for a stage without gates | Optional, and the contract says it is absent then |
| 13 | Low | `writeBack: boolean` was unclear | Renamed `supportsWriteBack` |
| 14 | Low | The setting's change author before the first change was unstated | `lastChange` is absent until the first change, in the contract and the type |
| 15 | Low | `escalationReason` was optional on every kind | `NeedsYouItem` is a union by kind; only `escalation` carries it |

### Pass 2

- Reviewer and invocation as in pass 1, with the prompt naming pass 1's session and asking for each finding's resolution first.
- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID `3a33b886-ca99-4989-b4ed-fb4b3aec4ab6`.
- Reviewed revision: `e4110d2` against `origin/dev`.
- Snapshot before and after: `087bcdbde6b6b3b491e3f9b456a6fcb92d7f52670ca8589de4d633c9f24df9ea`, unchanged.
- All 15 pass 1 findings confirmed resolved.
- New findings: Critical 0, High 0, Medium 4, Low 13.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| M1 | Medium | A manual merge had no path to `integrated` and `archived` | Section 6.3 "Manual merge" and `MergeQueue.recordManualMerge`; detection belongs to items 7 and 23 |
| M2 | Medium | `forRun` was ambiguous with one request per head | Renamed `latestForRun`; the contract says it returns the most recently enqueued request |
| M3 | Medium | "Spec approvals (SDLC)" inverted the dependency | The item 22 adapter over SDLC gate records, outside the SDLC module |
| M4 | Medium | `SPEC_APPROVERS` lived in Integrations | Moved with `WORK_TYPES` to Execution's `domain/task-defaults.ts` (design decision 5) |
| L1 | Low | `ProgressReport.gate` was required | Optional |
| L2 | Low | The SpecKit enumeration was incomplete | Completed |
| L3 | Low | "The `Access` adapter" | "The Access module" |
| L4 | Low | `CurrentStage` was the base of every stage view | Renamed `StageSummary` |
| L5 | Low | `WORK_TYPES` lived in the view port | Moved to `domain/task-defaults.ts` |
| L6 | Low | The budget per request contradicted `retry` | `retry` resets the conflict attempts to zero |
| L7 | Low | Withdrawal was defined only for `queued` | Setting off or cancellation withdraws `queued`, `escalated`, and `returned-to-specify` requests; an in-flight request finishes its step first |
| L8 | Low | An anonymous `{ by, at }` object | Named `SettingChange` |
| L9 | Low | The G3 plan status contradicted itself | "except the wave 1 contracts" |
| L10 | Low | `verification.md` named no revision for the second run and omitted the evidence check | Revision `e4110d2` named; evidence check recorded |
| L11 | Low | `revoke` and `recordUse` had no named idempotency means | Rule 2.7: by rule identifier, and by rule and native request |
| L12 | Low | SDLC's `Generation` versioned Integrations records | Integrations' own `Revision` |
| L13 | Low | "The current stage" was undefined for parallel stages | "The stage whose column the card shows" |

### Pass 3

- Reviewer and invocation as in pass 1, with the prompt naming the pass 1 and pass 2 sessions and asking for each pass 2 finding's resolution first. This was the last allowed pass.
- Model confirmation: `claude-fable-5-1` in `modelUsage`. Session ID `125c58da-cba8-4c03-8997-240c3db65ba7`.
- Reviewed revision: `8083da3` against `origin/dev`.
- Snapshot before and after: `09bc4faa9713213034ba08ac054ab1f7c0601ae60d24171fb2aad617b347bc0c`, unchanged.
- Pass 2 findings: all resolved, L13 partially (Low 2 below).
- New findings: Critical 0, High 0, Medium 0, Low 7. Under the review process, Low-only findings are fixed without another pass; the fixes below are **unreviewed**.

| # | Severity | Finding | Resolution (unreviewed) |
| --- | --- | --- | --- |
| 1 | Low | No check recorded for the fixed revision, and task 3.1 unchecked | `make verify` and strict validation run on the final revision (Checks table); tasks 3.1 to 3.3 checked |
| 2 | Low | "Current stage" was still used without a definition | Section 3.2 defines the current stage once, and every use means it; the delta says the same |
| 3 | Low | `recordManualMerge` had no named idempotency means | Rule 2.7 and section 6.3: by run and head, a repeat returns the merged request |
| 4 | Low | The delta and the required tests narrowed withdrawal to `queued` | Both name queued, escalated, and returned-to-specify requests |
| 5 | Low | Design decision 5 claimed an import that does not exist | Item 25's intake parser imports them |
| 6 | Low | `byTask` was a `ReadonlyMap`, which JSON does not carry | An array of `TaskCount` |
| 7 | Low | `answerableBy` left no room for the council | Section 4.1: the least human role in G3; the council adds its deciding body by a contract change |

## Owner decisions

- 2026-10-26: G3 starts for the wave 1 contracts only; recorded in `docs/g3-plan.md`.

## Limitations and remaining gates

- Types and constants only: the behavior is tested by the implementing items, as the contract's "Required tests" lists.
- `NativeRequestId`, `CodeHead`, and `BranchName` are opaque placeholders until items 3, 4, and 6 define their structure.
- G3 item 7 also adds `@taskelith/integrations`; whichever change merges second resolves the skeleton conflict under protocol step 9.
- Remaining gates: integration into `dev` and archive by the coordinator.
