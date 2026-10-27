# Verification: close-g3-item-0

## Scope and source

A worker task of size S, documentation only, from the coordinator's brief of 2026-10-27, developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)): close G3 item 0 ([G3 work plan](/docs/g3-plan.md#work-items), row 0) so that the remaining items of wave 1, 26, 27, and 43, can start, recording facts only.

- **In scope:** `docs/g3-plan.md` (row 0, the hosted-runner row of "G2 closure deferrals", the dependency text, and the new section "Item 0 closure" with its owner-confirmed delegate decisions) and `docs/foundation.md` (the G2 status paragraph, the deferred-item row of the G3 groundwork re-review, and the delivery-sequence paragraph).
- **Out of scope:** ADRs (ADR 0015, which still calls the hosted-runner check open, and ADR 0008, whose optional editorial note is a separate documentation change by another worker), specs, code, and the change `align-product-ports-with-g2-lifecycle` itself.
- **Specs:** `skip_specs: true`. No living spec tracks the status of G3 plan items: `grep -rln -i "g3-plan\|G3 work plan\|G3 plan\|item 0" openspec/specs/` matches only `scm-port`, which cites G3 plan decision D8, and `delivery-planning` requires the plan and its decisions, not item status.

## Revision

- Base: `origin/dev` at `6b68d6c7` (the merge of #370). Branch `close-g3-item-0`.
- Merge of `origin/dev` at `579c227d` (the merge of #372) into the branch: merge commit `a7e82676`, without conflicts; it brought #371 `measure-checklist-effect` and #372 `align-product-ports-with-g2-lifecycle`. Neither changed `docs/g3-plan.md` or `docs/foundation.md` (`git diff --stat 6b68d6c7 579c227d` on both is empty), so the cited lines hold. No stale dependency inventory was reported.
- `align-product-ports-with-g2-lifecycle` was first read on its branch at `0a637301`; the cited lines were re-checked in its archived directory on the merged tree.

## Environment

macOS (Darwin 25.6.0), Node.js v24.22.1 through `nvm use` from `.nvmrc`. Docker was used only for the `make verify` run on `3513bbe4` (below); every other check ran without Docker.

## Author self-check and evidence check

- Pull requests: for each of #357 to #370, `git log --merges --grep="Merge pull request #<n> from" origin/dev` found one merge commit, and its body gave the subject recorded in the plan: #357 `bd4382e8`, #358 `ea530ede`, #359 `93b5065b`, #360 `04e4fe86`, #361 `5d0e9cb5`, #362 `4cbea974`, #363 `fac1fd4a`, #364 `9b0e6fd9`, #365 `b87abe75`, #366 `99333004`, #367 `10eeab69`, #368 `dc9f1b66`, #369 `d21838c3`, #370 `6b68d6c7`, #372 `579c227d` (body "docs: align the product ports with the G2 lifecycle", committed 2026-10-27 23:32 +0200, the last change of item 0, so the closure date is 2026-10-27). Each branch name matches an archived change directory `openspec/changes/archive/2026-10-27-<change>`.
- Follow-up list: the revalidation's "Follow-up changes" (`/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md`, lines 55 to 71) names eleven follow-ups, all in the plan's table; #367 is not among them, and the plan says so. Item 3 needed no fix (line 49).
- Hosted-runner row (`docs/g3-plan.md:75`): the facts are those of `/openspec/changes/archive/2026-10-27-record-hosted-runner-linux-acceptance/acceptance.md` and its `verification.md`: run 40534340382 on `dev` at `4fe09456`, ten proofs passed, 42 records; process ownership not marked met because the worker-kill proof killed after the task had exited; the 24c-dependent cancellation and connectivity parts deferred to G3, which the plan maps to item 43 ("Cancellation race g and the 24c-dependent rows on macOS and Linux"); the arm64 Linux entry not covered (`docs/foundation.md:87`).
- Owner-confirmed delegate decisions (`docs/g3-plan.md`, "Owner-confirmed delegate decisions"), each against its source. The source of the owner's confirmation is the coordinator's message of 2026-10-27, received during this task; it confirmed items 6, 5, and 44 and, for `align-product-ports-with-g2-lifecycle`, named D1 only, so D4, D7, and D8 remain confirmed by the away delegate only:
  1. Item 6: `/openspec/changes/archive/2026-10-27-align-git-workspace-with-execution-boundary/design.md` lines 55 and 56 (questions 1 and 2, decided by the away delegate), `proposal.md` lines 8 and 9 (away runs `20261027T160711Z-claude-46821` and `20261027T162806Z-claude-44593`), and `verification.md` line 158 (remaining gate: the owner's confirmation of both questions and the round 2 decision on item 41).
  2. Item 5: `/openspec/changes/archive/2026-10-27-align-slot-credential-delivery/verification.md` lines 55 and 136, and `findings.jsonl` lines 25 (Medium, `concurrency-race`, `fixed-unreviewed`, commit `b0aaa3f0`) and 26 (Low, `stale-citation`, `fixed-unreviewed`). The brief called the Medium finding M1; it is pass 3's only Medium finding.
  3. Item 8: `/openspec/changes/archive/2026-10-27-align-product-ports-with-g2-lifecycle/verification.md`, the same on `0a637301` and in `dev`, lines 20 (D1, D4, D7, and D8 confirmed by the delegate, away run `20261027T200403Z-claude-78187`), 22 (contract section 3.3 and ADR 0008 decision 4), 24, and 151 (the optional ADR 0008 editorial note, handled by a separate change); its `design.md` line 16 relates the card to ADR 0008 decisions 4 and 5.
  4. Item 44: `/openspec/changes/archive/2026-10-27-bind-product-writers-to-launch-invalidation/verification.md` line 104 (pass 2 M3, option (a), away run `20261027T201212Z-claude-24852`) and line 130 (remaining gate: owner confirmation of the item 44 plan amendment); `proposal.md` line 10. The amendment is in the item 44 row of `docs/g3-plan.md`.
- #371 `measure-checklist-effect` ("chore: measure the effect of the review checklist") is review tooling, not a G3 plan item or a follow-up of item 0, and is not listed in the plan.
- No other away-delegate decision: `grep -i away` over the `.md` records of the other item 0 changes matches nothing.
- Edited lines: `docs/g3-plan.md:75` (hosted-runner row), `:89` (the "G3 groundwork re-review" row of "G2 closure deferrals"), `:97` (row 0), `:167` (dependency text), `:171` onward (section "Item 0 closure"); `docs/foundation.md:59`, `:73`, and `:93`. `docs/foundation.md:3` ("As of 2026-10-27") names no item and is unchanged. `docs/g3-plan.md:3`, which says that items start "item 0 first", and `:147`, the owner's decision of 2026-10-26, are history and are unchanged.
- Neither `docs/decisions/0015-g2-closure.md` nor any other ADR is edited: `git diff origin/dev -- docs/decisions` is empty.

## Review checklist

`make findings ARGS="checklist --files docs/g3-plan.md,docs/foundation.md"` on the merged tree printed the text in [design.md](design.md), "Review checklist", with "Dev commit: 579c227d5593943983835bceaef570b9245e45bb." `make findings ARGS="checklist --files docs/g3-plan.md,docs/foundation.md --save close-g3-item-0 --at 579c227d --size S"` saved it: `Saved the checklist to openspec/changes/close-g3-item-0/checklist.json.`, with `devCommit` `579c227d5593943983835bceaef570b9245e45bb` and size `S`.

## Checks and results

On the working tree of the merged branch, after the checklist record:

- `npm run openspec -- validate close-g3-item-0 --strict`: `Change 'close-g3-item-0' is valid`.
- `npm run openspec -- validate --all --strict --no-interactive`: `Totals: 70 passed, 0 failed (70 items)`.
- `npm run verify:links`: `Every checked link conforms.`
- `npm run verify:findings` and `make findings ARGS="validate"`: `Every findings file is valid: 50 file(s); every pass summary file is valid: 30 file(s).`
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run verify:archive`: `Every active OpenSpec change archives into strictly valid specs.`

`make verify` on the working tree of `3513bbe4`, run on 2026-10-27 with Docker: exit 0; 2334 tests, 44 suites, 2331 pass, 0 fail, 0 cancelled, 3 skipped, 0 todo; coverage of all files lines 99.34%, branches 92.29%, functions 99.03%; every product module is in the coverage report; verified 731 package paths, 41 with license coverage gaps (all reviewed; 4 declaration-only); `validate --all --strict` `Totals: 70 passed, 0 failed (70 items)`; every checked link conforms; every active OpenSpec change archives into strictly valid specs; every findings file is valid, 50 findings files and 30 pass summary files; packed file allowlist and installed CLI verification passed.

Sequence deviation: worker step 4 runs `make verify` before the first review pass. Review pass 1 started before it, because the coordinator (Niki) instructed so while the Docker slot was busy. `make verify` then ran on `3513bbe4`, the same revision that pass 1 reviewed, and passed.

Sequence deviation: worker step 4 runs `make verify` after each round of fixes. The coordinator (Niki) ruled that fixes touching only change records need no separate re-verify, and that `make verify` runs once on the archive tree (step 7). So `make verify` did not run on `96d9eb0a`, the revision pass 2 reviewed, nor after the pass 2 fixes; the non-Docker checks below ran on the fixed tree.

On the working tree after the pass 2 fixes, without Docker:

- `npm run verify:links`: `Every checked link conforms.`
- `make findings ARGS="validate"`, after `findings.jsonl` and `passes.jsonl` gained pass 2: `Every findings file is valid: 50 file(s); every pass summary file is valid: 30 file(s).`
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run openspec -- validate close-g3-item-0 --strict`: `Change 'close-g3-item-0' is valid`.

## Review

### Pass 1

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox. Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Model confirmation: the model, reasoning effort, and read-only sandbox in the output header. Session `01a17f4b-bef1-7143-9744-4bf7b946c0fd`.
- **Reviewed revision:** `3513bbe4`. Snapshot of the worktree before and after the pass: `2c9fc781fa4cbcb8e6a2c9677766c58f77db7ea3b08293f60cd1cd54887eac66` both, so the reviewer changed nothing.
- **Counts:** critical 0, high 0, medium 1, low 1 (`passes.jsonl`). Both findings were fixed; none was declined.

| Finding | Resolution |
| --- | --- |
| M1 (`verification.md:57`, process): pass 1 started before `make verify`, against worker step 4 | Fixed: the `make verify` result on `3513bbe4` and the coordinator-directed sequence deviation are recorded above |
| L2 (`proposal.md:3`, docs): stale wording that `align-product-ports-with-g2-lifecycle` is pending integration | Fixed: it was integrated as #372 on 2026-10-27 |

### Pass 2

- **Reviewer:** B, Claude Code, model `claude-opus-5-5`, effort `high`, plan permission mode with `Edit`, `Write`, and `NotebookEdit` disallowed. Session `374cdf08-91eb-4bf4-8f22-8c5850ad7238`.
- **Reviewed revision:** `96d9eb0a`. Snapshot of the worktree before and after the pass: unchanged, so the reviewer changed nothing.
- **Counts:** critical 0, high 0, medium 0, low 6 (`passes.jsonl`). All six were fixed without another review and recorded `fixed-unreviewed`; none was declined. The reviewer cited `docs/g3-plan.md:189` and `:200` for L2 and L3; on `96d9eb0a` those paragraphs are at `:191` and `:195`, which `findings.jsonl` records.
- **Pass 1 fixes:** B confirmed M1 (`make verify` on `3513bbe4` and the recorded sequence deviation) and L2 (the proposal says #372 was integrated on 2026-10-27).

| Finding | Resolution |
| --- | --- |
| L1 (`docs/g3-plan.md:89`, docs): the "G3 groundwork re-review" row of "G2 closure deferrals" still named item 0 as open | Fixed: the row says "Done by item 0 on 2026-10-27" with a link to the item 0 closure, and the edited lines above list `:89` |
| L2 (`docs/g3-plan.md:191`, docs): #361 was called related without a stated relation | Fixed: #370 fixes a test that #359 added; #361 is a G2 test fix of the same period that stabilized `test/g2-cancellation-races.test.ts` (its [proposal](/openspec/changes/archive/2026-10-27-stabilize-g2-cancellation-races-exit-signal/proposal.md)), not tied to any item 0 change |
| L3 (`docs/g3-plan.md:195`, spec-wording): the intro said the owner confirmed every decision, while point 3 named only D1 | Fixed: the intro and point 3 say the owner's confirmation covered D1 of `align-product-ports-with-g2-lifecycle` and that D4, D7, and D8 remain confirmed by the away delegate only; the proposal and the evidence check above say the same |
| L4 (`docs/foundation.md:59`, docs): a capital letter after a semicolon | Fixed: a full stop ends the sentence |
| L5 (`proposal.md:3`, `verification.md:5`, docs): items 26, 27, and 43 presented as the whole of wave 1 | Fixed: both say "the remaining items of wave 1, 26, 27, and 43"; wave 1 also holds items 1, 2, 3, 5, 6, 7, and 8 (`docs/g3-plan.md:154`) |
| L6 (`verification.md:19`, evidence-mismatch): "Environment" denied the Docker run, and no check was recorded after the pass 1 fixes | Fixed: "Environment" names the Docker `make verify` run on `3513bbe4`; the coordinator's ruling is a recorded sequence deviation; the non-Docker checks on the fixed tree are recorded above |

## Limitations

- The list of item 0's changes follows the coordinator's brief; #367 is not a follow-up of the revalidation, and the plan says so.

## Archive

Archived as `openspec/changes/archive/2026-10-27-close-g3-item-0/` on 2026-10-27 on top of `origin/dev` `579c227d` (`skip_specs: true`, so no change under `openspec/specs/`). `validate --all --strict`: `Totals: 69 passed, 0 failed (69 items)`. `make findings ARGS="validate"`: every findings file is valid, 50 findings files and 30 pass summary files.

`make verify` on the archive tree, run on 2026-10-27 with Docker: exit 0; 2334 tests, 44 suites, 2331 pass, 0 fail, 0 cancelled, 3 skipped, 0 todo; coverage of all files lines 99.34%, branches 92.28%, functions 99.03%; every product module is in the coverage report; verified 731 package paths, 41 with license coverage gaps (all reviewed; 4 declaration-only); `Totals: 69 passed, 0 failed (69 items)`; every checked link conforms; no active OpenSpec change; packed file allowlist and installed CLI verification passed.

## Remaining gates

- Review pass 2 is done. No pass 3: pass 2 found only Low findings, which are fixed without another review ([independent review process](/docs/governance.md#independent-review-process)).
- Integration into dev by the coordinator (single pull request).
