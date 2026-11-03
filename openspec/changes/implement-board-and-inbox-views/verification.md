# Verification: implement-board-and-inbox-views

## Scope and source

G3 item 15 (`docs/g3-plan.md`, row 15), sub-change 15a under the coordinator's split (Q1 (b)), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `468783d9` (#430), under the coordinator decisions Q1 to Q6 of 2026-11-03 (design, "Coordinator decisions"): the six board and inbox reads, the card store, the empty merge queue adapter, and the `card-changed` and `board-changed` emitters.

Commit type: `packages/modules/*`, `packages/adapters/postgres`, and `apps/control-plane` are private workspaces that the published `taskelith` package does not ship, so every commit uses `chore`, `test`, or `docs`.

## Revision

- Base: `dev` `468783d9f2e524ef490273c0ab8d66e2e8e251ef`, the development and checklist base.
- `744d1f2b` `chore: start the implement-board-and-inbox-views change`: `.openspec.yaml`, `checklist.json` saved with the brief's invocation `--save implement-board-and-inbox-views --at 468783d9f2e524ef490273c0ab8d66e2e8e251ef --size L` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `fd0242de` `test: cover the board and inbox views and the card projector`: the tests alone, the base of the fail-before run.
- `99b3d927` `chore: serve the board and inbox views and project card events`: the modules, the adapter, the migration, and the control plane.
- `a46f41b1` `test: cover the Close stage column and the fleet obstacle projection key`: two tests added after two mutations survived (section "Fail-before").
- `1d70b59e` `docs: describe the implement board and inbox views change`: proposal, design, spec deltas, tasks, and this record's skeleton.
- `c8f17b29` routed at head `1d70b59e` (unedited; tier `elevated`, 40 files and 2567 lines, triggers lines, files, capabilities, and size). Its `make verify` (`verify-15-1.log`) passed on the tree `fccba6ac` (tests 4531, pass 4522, fail 0, skipped 9; all files 99.41% lines, 92.66% branches, 98.75% functions), but the new `composition/board-views.js` had 72.73% branches, below the 75% that the brief asks of each new file: no test read an inbox source's position.
- `fd1bb853` `test: cover the inbox source position of the board composition` adds that test, which changed the diff, so `cfe8d48d` deleted that `route.json` and `2b9f126b` routed again (unedited; tier `elevated`, 40 files and 2584 lines, the same triggers).
- `7171b2f6` recorded these revisions. Its `make verify` (`verify-15-2.log`) passed on the tree `03adafdf` (tests 4532, pass 4523, fail 0, skipped 9; all files 99.42% lines, 92.66% branches, 98.78% functions), but `composition/board-views.js` still had 70.83% branches: no test reached the failure paths of the board reads.
- `74e0739a` `test: cover the failure paths of the board reads composition` adds a unit test over a fake transaction, which changed the diff, so `e1b677e7` deleted the second `route.json` and `3b6c8719` routed a third time (unedited; tier `elevated`, 41 files and 2608 lines, the same triggers).
- The `docs: ...` commit after it records this revision list; the commit after the next `make verify` records it with `make record`.

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`); Docker 29.5.2 for the services of `make verify` and of the targeted PostgreSQL runs (`make services-up`, project `taskelith-464544771-dev`).

## Fail-before

Logs in the session scratchpad (`fb-15-*.log`). Each mutation was applied to one source at the head named in its log, built, run against the named tests, and reverted.

- `fb-15-base.log`: the tests of `fd0242de` against the sources of `744d1f2b`, with the packages' `dist` removed and rebuilt: tests 99, pass 77, fail 22; every new suite fails to load (`@taskelith/execution` has no `InMemoryCardCatalog`), the two numbering-pass projection tests, the `sourceIn` test, the served-operations test, and the migration tests fail.
- `fb-15-projector-dedupe.log` (`card-projector.ts`, the stored projection never matches): 1 of 18 fails, the projector's once-per-change test.
- `fb-15-crash-point.log` (`postgres-database.ts`, no `CardProjectionCommit` point): 2 of 6 fail, both crash-point tests.
- `fb-15-contact-touch.log` (the migration's worker `UPDATE` trigger without its contact-time condition): 1 of 8 fails, the worker touch test.
- `fb-15-merge-gate.log` (`card-views.ts`, the auto-merge setting ignored): 1 of 12 fails, the merge gate test.
- `fb-15-caller-may-act.log` (`board-api.ts`, a forbidden operator check answers true): 1 of 5 fails, the viewer test.
- `fb-15-view-position.log` (`board-views.ts`, position `0` instead of the head): 3 of 18 fail.
- `fb-15-close-column-survived.log` (`board-stages.ts`, no Close stage branch in `cardColumn`): 0 of 21 failed, since every tested Close stage had only `closure`; `a46f41b1` adds a Close stage with `implementation`, and `fb-15-close-column.log` at `a46f41b1`: 1 of 23 fails, that test.
- `fb-15-fleet-observed-at.log` (`card-projector.ts`, `observedAt` kept in the projection key) at `a46f41b1`: 1 of 13 fails, the fleet obstacle test that `a46f41b1` adds. A first attempt at this mutation left unreachable code, failed the build, and ran the unmutated `dist`; its log was discarded.
- `fb-15-source-position.log` (`composition/board-views.ts`, an inbox source's position fixed at `0`) at `fd1bb853`: 1 of 7 fails, the source position test that `fd1bb853` adds.
- `fb-15-auto-merge-default.log` (`composition/board-views.ts`, a project without a setting starts with auto-merge off) at `74e0739a`: 1 of 1 fails, the composition test that `74e0739a` adds.
- `fb-15-quarantine.log` (`composition/board-views.ts`, the installation's quarantine ignored) at `74e0739a`: 1 of 1 fails, the same test. A first mutation that dropped the skip of a worker without a record failed the build and ran the unmutated `dist`; its log was discarded.

## Limitations

- Until item 25 registers cards, no writer calls `CardCatalog.register`, so every board is empty and every task detail answers `404` (Q2 (a)).
- The merge queue is the empty `NoMergeQueue` until item 23 (Q5 (a)); `integration` never reaches `queued`, `merging`, or `integrated` before it.
- `traceability` of the task detail is empty, since no store holds requirement references; task order in a card is by task identifier, since no store keeps the admission order.
- The order of `waitingFor` and the session activity derivation follow the design (decision 4), which the contract does not fix.
- A worker touch reprojects every card; the stored projection dedupes the events (design, "Risks / Trade-offs").
- No independent review has run yet; no deployment or browser check was made (backend only).

## Remaining gates

- Review passes 1 to 3 per governance, and their fix rounds.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
