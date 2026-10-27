# Verification: close-g3-item-0

## Scope and source

A worker task of size S, documentation only, from the coordinator's brief of 2026-10-27, developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)): close G3 item 0 ([G3 work plan](/docs/g3-plan.md#work-items), row 0) so that wave 1, items 26, 27, and 43, can start, recording facts only.

- **In scope:** `docs/g3-plan.md` (row 0, the hosted-runner row of "G2 closure deferrals", the dependency text, and the new section "Item 0 closure" with its owner-confirmed delegate decisions) and `docs/foundation.md` (the G2 status paragraph, the deferred-item row of the G3 groundwork re-review, and the delivery-sequence paragraph).
- **Out of scope:** ADRs (ADR 0015, which still calls the hosted-runner check open, and ADR 0008, whose optional editorial note is a separate documentation change by another worker), specs, code, and the change `align-product-ports-with-g2-lifecycle` itself.
- **Specs:** `skip_specs: true`. No living spec tracks the status of G3 plan items: `grep -rln -i "g3-plan\|G3 work plan\|G3 plan\|item 0" openspec/specs/` matches only `scm-port`, which cites G3 plan decision D8, and `delivery-planning` requires the plan and its decisions, not item status.

## Revision

- Base: `origin/dev` at `6b68d6c7` (the merge of #370). Branch `close-g3-item-0`.
- Merge of `origin/dev` at `579c227d` (the merge of #372) into the branch: merge commit `a7e82676`, without conflicts; it brought #371 `measure-checklist-effect` and #372 `align-product-ports-with-g2-lifecycle`. Neither changed `docs/g3-plan.md` or `docs/foundation.md` (`git diff --stat 6b68d6c7 579c227d` on both is empty), so the cited lines hold. No stale dependency inventory was reported.
- `align-product-ports-with-g2-lifecycle` was first read on its branch at `0a637301`; the cited lines were re-checked in its archived directory on the merged tree.

## Environment

macOS (Darwin 25.6.0), Node.js v24.22.1 through `nvm use` from `.nvmrc`. No Docker check was run.

## Author self-check and evidence check

- Pull requests: for each of #357 to #370, `git log --merges --grep="Merge pull request #<n> from" origin/dev` found one merge commit, and its body gave the subject recorded in the plan: #357 `bd4382e8`, #358 `ea530ede`, #359 `93b5065b`, #360 `04e4fe86`, #361 `5d0e9cb5`, #362 `4cbea974`, #363 `fac1fd4a`, #364 `9b0e6fd9`, #365 `b87abe75`, #366 `99333004`, #367 `10eeab69`, #368 `dc9f1b66`, #369 `d21838c3`, #370 `6b68d6c7`, #372 `579c227d` (body "docs: align the product ports with the G2 lifecycle", committed 2026-10-27 23:32 +0200, the last change of item 0, so the closure date is 2026-10-27). Each branch name matches an archived change directory `openspec/changes/archive/2026-10-27-<change>`.
- Follow-up list: the revalidation's "Follow-up changes" (`/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md`, lines 55 to 71) names eleven follow-ups, all in the plan's table; #367 is not among them, and the plan says so. Item 3 needed no fix (line 49).
- Hosted-runner row (`docs/g3-plan.md:75`): the facts are those of `/openspec/changes/archive/2026-10-27-record-hosted-runner-linux-acceptance/acceptance.md` and its `verification.md`: run 40534340382 on `dev` at `4fe09456`, ten proofs passed, 42 records; process ownership not marked met because the worker-kill proof killed after the task had exited; the 24c-dependent cancellation and connectivity parts deferred to G3, which the plan maps to item 43 ("Cancellation race g and the 24c-dependent rows on macOS and Linux"); the arm64 Linux entry not covered (`docs/foundation.md:87`).
- Owner-confirmed delegate decisions (`docs/g3-plan.md`, "Owner-confirmed delegate decisions"), each against its source. The owner confirmed all four on 2026-10-27; the source of the confirmation is the coordinator's message of 2026-10-27, received during this task:
  1. Item 6: `/openspec/changes/archive/2026-10-27-align-git-workspace-with-execution-boundary/design.md` lines 55 and 56 (questions 1 and 2, decided by the away delegate), `proposal.md` lines 8 and 9 (away runs `20261027T160711Z-claude-46821` and `20261027T162806Z-claude-44593`), and `verification.md` line 158 (remaining gate: the owner's confirmation of both questions and the round 2 decision on item 41).
  2. Item 5: `/openspec/changes/archive/2026-10-27-align-slot-credential-delivery/verification.md` lines 55 and 136, and `findings.jsonl` lines 25 (Medium, `concurrency-race`, `fixed-unreviewed`, commit `b0aaa3f0`) and 26 (Low, `stale-citation`, `fixed-unreviewed`). The brief called the Medium finding M1; it is pass 3's only Medium finding.
  3. Item 8: `/openspec/changes/archive/2026-10-27-align-product-ports-with-g2-lifecycle/verification.md`, the same on `0a637301` and in `dev`, lines 20 (D1, D4, D7, and D8 confirmed by the delegate, away run `20261027T200403Z-claude-78187`), 22 (contract section 3.3 and ADR 0008 decision 4), 24, and 151 (the optional ADR 0008 editorial note, handled by a separate change); its `design.md` line 16 relates the card to ADR 0008 decisions 4 and 5.
  4. Item 44: `/openspec/changes/archive/2026-10-27-bind-product-writers-to-launch-invalidation/verification.md` line 104 (pass 2 M3, option (a), away run `20261027T201212Z-claude-24852`) and line 130 (remaining gate: owner confirmation of the item 44 plan amendment); `proposal.md` line 10. The amendment is in the item 44 row of `docs/g3-plan.md`.
- #371 `measure-checklist-effect` ("chore: measure the effect of the review checklist") is review tooling, not a G3 plan item or a follow-up of item 0, and is not listed in the plan.
- No other away-delegate decision: `grep -i away` over the `.md` records of the other item 0 changes matches nothing.
- Edited lines: `docs/g3-plan.md:75` (hosted-runner row), `:97` (row 0), `:167` (dependency text), `:171` onward (section "Item 0 closure"); `docs/foundation.md:59`, `:73`, and `:93`. `docs/foundation.md:3` ("As of 2026-10-27") names no item and is unchanged. `docs/g3-plan.md:3`, which says that items start "item 0 first", and `:147`, the owner's decision of 2026-10-26, are history and are unchanged.
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

## Limitations

- The list of item 0's changes follows the coordinator's brief; #367 is not a follow-up of the revalidation, and the plan says so.

## Remaining gates

- `make verify` (Docker), pending a coordinator slot.
- Review pass 1 (reviewer A, Codex CLI, `gpt-6.1-sol`), pass 2 (reviewer B, Claude Code, `claude-opus-5-5`, effort high), and pass 3 (reviewer A).
- Archive.
- Integration into dev by the coordinator (single pull request).
