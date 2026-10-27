# Verification

Date: 2026-10-27. The author's verification and the checks without Docker are recorded below; `make verify`, which needs Docker, waits for the coordinator's slot, and the review passes follow.

## Scope and source

Follow-up of G3 item 0, `revalidate-g3-foundations`: item 8 `product-ports`, pass 1 M1, M3, M4 and pass 2 H1, M2 parts b and c, M3, M4, M5, L1, L2 ([its findings](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl); [its verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md), follow-up table). The coordinator assigned the task in a brief; it was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/align-product-ports-with-g2-lifecycle` on branch `align-product-ports-with-g2-lifecycle`.

- **Base revision:** `b87abe75` (`origin/dev`, merge of pull request #365); the worktree was created at `9b0e6fd9` and fast-forwarded to it before the first commit.
- **Revision verified:** the records commit (`docs: record the verification of the align-product-ports-with-g2-lifecycle change`) on top of the port types (`b905e448`), their tests (`77e02025`), the contract (`02ecee86`), and the change records (`0574128a`). The checks below ran on the working tree of `0574128a`, which the records commit holds with only this record changed.
- **Revision after the confirmed decisions:** the commit `docs: apply the confirmed product ports decisions` on top of the records commit; its checks are in Checks.
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
- **Citations.** Every `file:line` in `design.md` and the contract was checked against `b87abe75`: `task-service.ts:32`, `task.ts:116`, `delegation-admission.ts:61`, `stage-progress.ts:15` and `:37`, `gate.ts:20`, `capacity-reasons.ts:3`, `assignment.ts:44`, `automatic-retry.ts:15`, `reconciliation-queue.ts:7`, `execution.ts:105`, `worker-revocation.ts:8`, `workflow-run-binding.ts:10`.
- **Requirement length.** Added requirements: 340 ("One card per root run"), 288 ("Completed workflow projection"), 378 ("Merge readiness by passed stages"), 401 ("Placement obstacle projection"), 287 ("Task end without merge"), and 355 ("Reconciliation in the inbox") characters; modified: 351 ("Needs you items answered once by their source") and 344 ("Standing approval rules recorded and audited"); all under 500. `npm run verify:archive` archives the change in a temporary copy into strictly valid specs.
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

`make verify`: pending; the coordinator holds the Docker slot and runs or approves it.

## Review

No review pass has run yet.

## Limitations

- The contract fixes values and rules only; item 15 implements the projections, item 23 the queue entry rule, and the reconciliation source is a G3 surface not yet assigned.

## Remaining gates

- `make verify` with Docker.
- Review pass 1 by reviewer A, Codex `gpt-6.1-sol`.
- Review pass 2 by reviewer B, Claude Code `claude-opus-5-5`, effort `high`.
- Review pass 3 by reviewer A, if pass 2 has findings above Low.
- Merge of `origin/dev` once `bind-product-writers-to-launch-invalidation` lands, and reconciliation of its section 5 "Invalidation" bullet.
- The owner's confirmation of the optional ADR 0008 editorial note (run and admissions wording); this change does not edit the ADR.
- Archive.
- Integration into dev by the coordinator (single pull request)
