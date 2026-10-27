# Verification

Date: 2026-10-27. The author's verification and the checks without Docker are recorded below; `make verify`, which needs Docker, passed at `120c6842` (Checks), and the review passes follow.

## Scope and source

Follow-up of G3 item 0, `revalidate-g3-foundations`: item 8 `product-ports`, pass 1 M1, M3, M4 and pass 2 H1, M2 parts b and c, M3, M4, M5, L1, L2 ([its findings](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl); [its verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md), follow-up table). The coordinator assigned the task in a brief; it was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/align-product-ports-with-g2-lifecycle` on branch `align-product-ports-with-g2-lifecycle`.

- **Base revision:** `b87abe75` (`origin/dev`, merge of pull request #365); the worktree was created at `9b0e6fd9` and fast-forwarded to it before the first commit.
- **Revision verified:** the records commit (`docs: record the verification of the align-product-ports-with-g2-lifecycle change`) on top of the port types (`b905e448`), their tests (`77e02025`), the contract (`02ecee86`), and the change records (`0574128a`). The checks below ran on the working tree of `0574128a`, which the records commit holds with only this record changed.
- **Revision after the confirmed decisions:** the commit `docs: apply the confirmed product ports decisions` on top of the records commit; its checks are in Checks.
- **Revision after review pass 1:** the records commit of pass 1 (`docs: record review pass 1 of the align-product-ports-with-g2-lifecycle change`) on top of the fixes `475eebff` (the retry backoff reason), `19e28a2b` (its test), and `27553d4a` (contract, spec delta, and design); the checks without Docker in Checks ran on the working tree of `27553d4a`.
- **Revision after review pass 2:** the records commit of pass 2 (`docs: record review pass 2 of the align-product-ports-with-g2-lifecycle change`) on top of the fixes `b794aeb9` (task view names and the merge queue comment) and `9510346f` (contract, spec delta, design, and proposal); the checks without Docker in Checks ran on the working tree of `9510346f`.
- **Scope:** `docs/trust-model.md` section 3 (`installation-owner` row); `docs/contracts/product-ports.md` (sections 2, 3.2 to 3.4, 3.6 to 3.9, 4.1, 4.3, 5, 6.1, 6.3, and 7); the `product-ports` requirements of `specs/product-ports/spec.md`; `packages/modules/execution/src/ports/{board-read-model,needs-you,standing-approval-rules}.ts` and their exports; `packages/modules/integrations/src/ports/auto-merge.ts`; `packages/modules/execution/test/product-ports.test.ts`; `packages/modules/scheduling/test/board-obstacle-mirror.test.ts`.
- **Out of scope:** pass 1 H1 and pass 2 M1, the launch invalidation obligations of product writers (`bind-product-writers-to-launch-invalidation`, not on `dev` when this record was written); any adapter, projection, wire schema, or UI.
- **Design source:** the owner's UI proof of concept, read as data; `design.md`, Context, names where the contract follows it.

## Decisions confirmed

The coordinator brought decisions D1 (pass 2 H1, card per root run), D4 (merge readiness, the new merge gate values, and the re-queue at the same head), D7 (reconciliation in the inbox and the installation-scoped inbox), and D8 (standing rule revision scope) to the owner's away delegate. The delegate, Claude as the fallback harness, confirmed all four on 2026-10-27 in away run `/Users/petarnenov/.config/away/runs/20261027T200403Z-claude-78187` (a local run directory of the coordinator, not in the repository). As instructed with that confirmation:

- The contract's section 3.3 states the vocabulary: a card and its task detail are one root run (`runId`), a task is a G2 task, and the "admission" of ADR 0008 decision 4 is read as the run's list of task admissions (`TaskDetail.tasks`). No ADR file changes: `git diff origin/dev -- 'docs/decisions/0008-*'` is empty.
- `docs/trust-model.md` section 3 adds to the `installation-owner` capabilities the answer to the installation-scoped Needs you inbox (`acknowledge-process`), and the contract's section 2.1 links to it. No living spec lists role capabilities (`grep installation-owner openspec/specs` matches only the control plane API's bearer credential), so the delta adds no requirement for it.
- The owner's confirmation of an optional editorial note in ADR 0008 (run and admissions wording) is still open.

## Author self-check

- **Findings to resolutions.** Pass 1 M1: contract section 3.2, design D3. Pass 1 M3: sections 2, 3.6, 4.1, 4.3, `needs-you.ts`, design D7. Pass 1 M4 and pass 2 M4, L2: section 3.4 and 6.3 "Entry", `MERGE_GATE_STATES`, design D4. Pass 2 H1: sections 3.3, 3.7, 4.1, 4.3, 6.1, 6.3, `BoardCard`, `TaskDetail.tasks`, `NeedsYouSubject`, `NeedsYouCounts.byCard`, `MergeRequest`, design D1 and D2. Pass 2 M2 parts b and c: section 3.8, `PlacementObstacle`, the mirror test, design D5. Pass 2 M3: section 3.9, `TaskEnd`, design D6. Pass 2 M5: section 5 "Revision scope" and "Use", the modified requirement, `StandingApprovalRules.active`, design D8. Pass 2 L1: `CARD_WAIT_KINDS` and `CardWait`, design D9.
- **ADR 0008.** The card mapping keeps ADR 0008's card and task as one root run with its change (design D1); no decision of the ADR changes, and no ADR file is edited.
- **Contract, spec, and code agree.** `grep` for `WAITING_REASONS`, `WaitingReason`, `byTask`, `TaskCount`, and `taskDetail(projectId, taskId)` over `docs/`, `openspec/specs/`, `packages/`, and `apps/` finds no use of the replaced board names: the remaining matches are Scheduling's names and their control-plane users, the board's new `PLACEMENT_WAITING_REASONS`, and the proof of concept's own type in `docs/ui-poc/src/ui.tsx`. The merge gate values of contract section 3.4 equal `MERGE_GATE_STATES`; the obstacle reasons of section 3.8 equal the mirrors, which the Scheduling test compares with Scheduling's lists.
- **Citations.** Every `file:line` in `design.md` and the contract was checked against `b87abe75`: `task-service.ts:32`, `task.ts:116`, `delegation-admission.ts:61`, `stage-progress.ts:15` and `:37` (since pass 2 `:39`), `gate.ts:20`, `capacity-reasons.ts:3`, `assignment.ts:44`, `automatic-retry.ts:15`, `reconciliation-queue.ts:7`, `execution.ts:105`, `worker-revocation.ts:8`, `workflow-run-binding.ts:10`. The citations added by the review fixes were checked against the code of `9510346f`, which changes no cited file since `b87abe75`: `placement-service.ts:53`, `workflow-definition.ts:131` and `:133`, and `observation.integration.test.ts:1339` (pass 1); `capacity-repositories.ts:222`, `in-memory-placement.ts:50`, and the corrected `stage-progress.ts:39` and `worker-revocation.ts:10`, which point at the declarations instead of their comments (pass 2 N13).
- **Requirement length** (after review pass 2). Added requirements: 340 ("One card per root run"), 367 ("Completed workflow projection"), 413 ("Merge readiness by passed stages"), 480 ("Placement obstacle projection"), 287 ("Task end without merge"), and 355 ("Reconciliation in the inbox") characters; modified: 491 ("Board columns from the framework mapping", added by pass 1 L7), 351 ("Needs you items answered once by their source"), and 344 ("Standing approval rules recorded and audited"); all under 500. `npm run verify:archive` archives the change in a temporary copy into strictly valid specs.
- New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `chore`, `test`, and `docs`; only private workspace packages and documents change. Links from these records are inside the change or root-relative.

## Evidence check

- The counts below are copied from the runs' output on the working tree of `0574128a`.
- The value tests import `CARD_WAIT_KINDS` and the obstacle values, which `b87abe75` does not export, so they cannot pass before `b905e448`.

## Checks

Run on the working tree of `0574128a` with Node.js 24.22.1 and npm 12.2.1, without Docker:

- `npm run openspec -- validate align-product-ports-with-g2-lifecycle --strict`: valid.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run verify:comments`: every comment is within the comment length rule.
- `npm run verify:findings`: every findings file is valid, 43 files; every pass summary file is valid, 23 files.
- `npm run verify:links`: every checked link conforms.
- `npm run verify:archive`: every active OpenSpec change archives into strictly valid specs.
- `npm run verify:dependencies`: verified 731 package paths; 41 with license coverage gaps (all reviewed; 4 declaration-only).
- `npm run verify:package`: packed file allowlist and installed CLI verification passed.
- `make contract-compatibility`: 0 breaking changes in the four contract documents against `b87abe75`.
- `npm run build` and `npm run check:boundaries`: exit 0; workspace and hexagonal boundary checks passed.
- Unit tests of the touched packages, every non-integration test file of `packages/modules/execution/test`, `packages/modules/integrations/test`, and `packages/modules/scheduling/test` (26 files), with coverage of the modules' `dist`: 395 tests, 395 pass, 0 fail. `board-read-model.js`, `needs-you.js`, `standing-approval-rules.js`, and `auto-merge.js` 100% lines, branches, and functions each. The total over the modules, 86.58% lines, 93.01% branches, 87.02% functions, leaves out the integration tests and is not the repository coverage gate, which `make verify` checks.
- Unit tests of every workspace package and app, every non-integration test file (164 files), without coverage: 1855 tests, 1852 pass, 0 fail, 3 skipped.

After the confirmed decisions, on the working tree of that commit: `npm run verify:comments`, `npm run verify:links`, and `npm run verify:findings` (43 findings files, 23 pass summary files) pass; `validate align-product-ports-with-g2-lifecycle --strict` is valid; `validate --all --strict` gives 70 passed, 0 failed; `git diff origin/dev -- 'docs/decisions/0008-*'` is empty; `grep -n acknowledge-process docs/trust-model.md` matches line 29. Only Markdown changed, so the build and tests were not rerun.

After review pass 1, on the working tree of `27553d4a`: `npm run build` and `npm run check:boundaries` exit 0; unit tests of the touched packages (26 files) with coverage, 396 tests, 396 pass, 0 fail, `board-read-model.js`, `needs-you.js`, `standing-approval-rules.js`, and `auto-merge.js` 100% lines, branches, and functions each, the modules' total 86.58% lines, 93.01% branches, 87.02% functions; `verify:comments`, `verify:links`, and `verify:archive` pass; `verify:findings` and `make findings ARGS="validate"`: 43 findings files, 23 pass summary files valid; `validate align-product-ports-with-g2-lifecycle --strict` valid; `validate --all --strict` 70 passed, 0 failed. `make verify` after the pass 1 fixes, on the working tree of `a7c9970b`, run by the coordinator with Docker: exit 0; 2306 tests, 44 suites, 2303 pass, 0 fail, 0 cancelled, 3 skipped, 0 todo; coverage of all files lines 99.33%, branches 92.27%, functions 99.03%; every product module is in the coverage report; `validate --all --strict` 70 passed, 0 failed; every checked link conforms; every active OpenSpec change archives into strictly valid specs; the package verification passed; verified 731 package paths, 41 with license coverage gaps (all reviewed; 4 declaration-only). The author checked these numbers against the run's log.

After review pass 2, on the working tree of `9510346f`: `npm run build` and `npm run check:boundaries` exit 0; unit tests of the touched packages (26 files) with coverage, 396 tests, 396 pass, 0 fail, `board-read-model.js`, `needs-you.js`, `standing-approval-rules.js`, and `auto-merge.js` 100% lines, branches, and functions each, the modules' total 86.58% lines, 93.01% branches, 87.02% functions; `verify:comments`, `verify:links`, and `verify:archive` pass; `verify:findings` and `make findings ARGS="validate"`: 43 findings files, 23 pass summary files valid; `validate align-product-ports-with-g2-lifecycle --strict` valid; `validate --all --strict` 70 passed, 0 failed. `make verify` after the pass 2 fixes, on the working tree of `d9db145b`, run by the coordinator with Docker: exit 0; 2306 tests, 44 suites, 2303 pass, 0 fail, 0 cancelled, 3 skipped, 0 todo; coverage of all files lines 99.33%, branches 92.26%, functions 99.03%; every product module is in the coverage report; `validate --all --strict` 70 passed, 0 failed; every checked link conforms; every active OpenSpec change archives into strictly valid specs; the package verification passed; verified 731 package paths, 41 with license coverage gaps (all reviewed; 4 declaration-only). The author checked these numbers against the run's log.

`make verify` on the working tree of `120c6842`, run by the coordinator with Node.js from `.nvmrc` and Docker available: exit 0; 2305 tests, 44 suites, 2302 pass, 0 fail, 0 cancelled, 3 skipped, 0 todo; coverage of all files lines 99.33%, branches 92.27%, functions 99.03%; every product module is in the coverage report; `validate --all --strict` 70 passed, 0 failed; every checked link conforms; every active OpenSpec change archives into strictly valid specs; the package verification passed; verified 731 package paths, 41 with license coverage gaps (all reviewed; 4 declaration-only). The author checked these numbers against the run's log.

## Review

### Pass 1

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox; run by the coordinator. Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Model confirmation: the model and effort set in the invocation, as reported by the coordinator. Session `01a17efb-ef45-7bf1-aa88-bcfd74bcb0ea`.
- **Reviewed revision:** `da5275f2`. Snapshot of the worktree before and after the pass: `d9afecbe4e6bf43f59dfdde704acd100026b348f83ca82e340449ef9359abbf9` both, so the reviewer changed nothing.
- **Counts:** critical 0, high 0, medium 6, low 5 (`passes.jsonl`). Every finding was checked against the code and fixed; none was declined.

| Finding | Resolution |
| --- | --- |
| M1 (`product-ports.md:156`): `retries-exhausted` omits a last `not-started` attempt after the retries are spent (`apps/control-plane/test/observation.integration.test.ts:1339`) | Fixed: the kind covers a `not-started` outcome or a known failing exit once `MAX_AUTOMATIC_RETRIES` are spent; scenario "Retries spent after not started", required test, design D6 |
| M2 (`:141`): the fleet obstacle does not check that the task waits for placement | Fixed: section 3.8 decides applicability first (G2 `placementNeed`); scenario "Rejected in an empty fleet", design D5 |
| M3 (`:142`): the automatic retry obstacle has no checkable backoff criterion and hides a newer record | Fixed: the most recent observation by `observedAt` wins among retry, refusal, and scheduler record; scenario "Newer scheduler record", design D5 |
| M4 (`:143`): an older worker refusal hides a newer scheduler outcome | Fixed by the same rule; required test |
| M5 (`:146`): a rejection stays shown after a re-admission | Fixed: a rejection and a task end hold only at the ownership generation the attempt ended in; scenario "Re-admitted after a rejection", design D5 and D6 |
| M6 (`:62`): the last stage of the order need not be the Close stage | Fixed: the Close stage is the last stage with the `closure` obligation in graph order, which every admissible graph has; scenario "Closure stage not last", design D3 |
| L7 (delta `spec.md:15`): the restart rule is unconditional, and the living board columns requirement lacks the terminal fallback | Fixed: condition added; MODIFIED "Board columns from the framework mapping" |
| L8 (`board-read-model.ts:145`): the retry variant has no reason | Fixed: `RETRY_BACKOFF_REASON` (`retry-backoff`) with a value test |
| L9 (`product-ports.md:26`): "every query and command names one project" against the installation scope | Fixed: section 2.1 excepts the installation-scoped inbox |
| L10 (`:13`): the port table omits the reconciliation source | Fixed: added; pass 2 N9 replaced "not yet assigned" with G3 plan item 44 |
| L11 (`:133`): doubled comma | Fixed |

### Pass 2

- **Reviewer:** B, Claude Code, model `claude-opus-5-5`, effort `high`, plan permission mode with `Edit`, `Write`, and `NotebookEdit` disallowed; run by the coordinator. Invocation: `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`. Model confirmation: `claude-opus-5-5` in the JSON output's `modelUsage`, as reported by the coordinator. Session `a01e4958-f0ba-4f4b-ae90-6d1ee7d777e4`.
- **Reviewed revision:** `722e7d74`. Snapshot of the worktree before and after the pass: `0e154d1c3b0e5f29f63c12a89875284284fb6e72638182b344ac060e5e1bb843` both.
- **Pass 1 fixes:** ten confirmed; L10 partial, completed by N9.
- **Counts:** critical 0, high 0, medium 4, low 9 (`passes.jsonl`). Every finding was checked against the code and fixed; none was declined. N1, N2, N6, and N11 concern text that pass 1 reviewed, so their lines carry `missedBy` pass 1.

| Finding | Resolution |
| --- | --- |
| N1 (`product-ports.md:141`): waiting for placement ignores a held reservation (`capacity-repositories.ts:222`, `in-memory-placement.ts:50`) | Fixed: also requires no assignment with a `held` reservation; scenario "Placed, not yet launched", required test, design D5 |
| N2 (`:205`): the project's current policy revision is undefined, and a run at another revision would lose the auto-merge rule against the `auto-merge-authority` scenario "Push while auto-merge is on" | Fixed within D8: the project's current revision is the one new runs bind to; the rule exists at every revision current for an unclosed run; scenario "Push in a run at another revision"; `auto-merge-authority` unchanged |
| N3 (`:226`): the re-queue has no scenario and no test | Fixed: scenarios "Re-queue at the same head" and "Chosen withdrawal at the same head", required test |
| N4 (`:92`): "every stage before its Close stage" is ambiguous | Fixed: pre-merge stages, every stage other than Close and those depending on it; scenario "Stage after the closure stage in graph order", design D4 |
| N5 (`auto-merge.ts:109`): the comment omits the re-queue | Fixed |
| N6 (`product-ports.md:151`): a waiting record of an earlier attempt could be shown | Fixed: counts only when it names the active attempt, or none while the task has none; scenario "Record of an earlier attempt" |
| N7 (`:99` and others): "task" used for the card | Fixed: "card" or "the card's change" |
| N8 (`board-read-model.ts:254`): `TaskView.runId` is the task's own run | Fixed: renamed `taskRunId` |
| N9 (`product-ports.md:13`): reconciliation source called unassigned | Fixed: G3 plan item 44 cited in the contract and this record |
| N10 (`board-read-model.ts:243`): which ownership generation the admission shows | Fixed: `AdmissionView.dispatchedGeneration` and `TaskView.ownershipGeneration` |
| N11 (`product-ports.md:164`): a clean exit without a proven start | Fixed: a clean exit needs a proven start; otherwise `uncertain-exit` |
| N12 (`verification.md:30`): the citation check omits the pass 1 citations | Fixed: listed with the revision checked |
| N13 (`product-ports.md:92`, design): citations at doc comments | Fixed: `stage-progress.ts:39`, `worker-revocation.ts:10` |

### Pass 3

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox; run by the coordinator with the invocation of pass 1. Model confirmation: the Codex session header, as reported by the coordinator. Session `01a17f19-30c4-7a93-ada7-7a2603ca0dbf`.
- **Reviewed revision:** `d9db145b`. Snapshot of the worktree before and after the pass: `e58d84fc278ccebcf6f20005b560bcab9ab53f58220511ad0f8b495e902be150` both.
- **Pass 2 fixes:** N1 to N13 confirmed; none partial, none not fixed. The reviewer judged the pre-merge stage choice of N4 sound, since G2 `startStage` (`packages/modules/sdlc/src/domain/stage-progress.ts:55`) requires a stage's dependencies to have passed, so requiring the Close stage's dependents before the merge would be circular.
- **Counts:** critical 0, high 0, medium 0, low 0 (`passes.jsonl`). Verdict: pass. The review is complete after three passes.

## Limitations

- The contract fixes values and rules only; item 15 implements the projections, item 23 the queue entry rule, and item 44 `implement-readmission-and-reconciliation-surface` of the [G3 work plan](/docs/g3-plan.md) the reconciliation surface.

## Remaining gates

- Merge of `origin/dev` once `bind-product-writers-to-launch-invalidation` lands, and reconciliation of its section 5 "Invalidation" bullet.
- The owner's confirmation of the optional ADR 0008 editorial note (run and admissions wording); this change does not edit the ADR.
- Archive.
- Integration into dev by the coordinator (single pull request)
