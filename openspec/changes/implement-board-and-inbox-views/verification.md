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
- `18d889a2` recorded this revision list; `f7f56f95` recorded `verify-15-3.log` (tree `35bb6db1`) with `make record`. Review pass 1 reviewed `468783d9..f7f56f95`.
- Pass 1 fixes (section "Pass 1 fixes"): `e13b58e2`, `2ce1c0eb`, `9b5f193f`, `bec6dcd9`, `60cce934`, `b6386560`, `7f1475ca`, and the design and delta commit `522f9217`. `f313b9a5` records pass 1 in `passes.jsonl` and `findings.jsonl`. The fixes changed the diff, so `44f5ecf6` deleted the third `route.json` and `50afde6e` routed a fourth time (unedited; tier `elevated`, 41 files and 2799 lines, the same triggers).
- `45df01f8` recorded the pass 1 fixes. Its first `make verify` (`verify-15-p1.log`) failed before `make test` started: Docker could not create the network of the verify services (`all predefined address pools have been fully subnetted`), an environment failure outside the change. The worker removed the containers and network of its own manual-run services (project `taskelith-464544771-dev`, volumes kept) and reran `make verify` once on the same tree (`verify-15-p1b.log`), which passed and is the run that `make record` records.

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

## Review pass 1

- Reviewer: role A, Codex CLI `gpt-6-astra`, effort medium (`codex`, `gpt-6-astra`, `medium`), session `01a1a15e-ae75-7220-8a24-a46c374d3bc0`, run by the worker session with `make review` (`codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only`), which reported the model `gpt-6-astra`, effort medium, and the read-only sandbox; `route.json` recommended effort high, and the authorized medium applied (policy version 11). The reviewed range is `468783d9..f7f56f95`; the report says that no worktree file changed, that `make record-check` and `verify:comments` passed, and that it did not rerun the full suite.
- Findings: Critical 0, High 2, Medium 7, Low 2, as its `passes.jsonl` line and the eleven `findings.jsonl` lines record.

### Pass 1 fixes

Each behaviour fix has a test that fails before it; the fail-before logs are `fb-15-p1-<n>.log` in the scratchpad, each run against the sources of `f7f56f95` with the new tests, and `fixed-15-p1.log` runs the change's tests after the fixes (60 tests, all passed). Pass 2 reviews these fixes.

- **1, High, task detail changes** (`bec6dcd9`, `control-plane-api`). The stored projection is the card and its task detail (stages, run binding, tasks), with a fleet obstacle's `observedAt` stripped from the card and from each task; the event still carries the card. `fb-15-p1-1.log`: the projector test that changes a later stage's gate and then an admission appends 1 event, not 3.
- **2, High, capacity changes** (`e13b58e2`, `postgres-state`). Assignment triggers write a `fleet` touch when a held reservation is inserted, released, or moved to another worker, and `take` names every card for it; an occupancy-neutral update touches only its task. `fb-15-p1-2.log`: with two cards, a held reservation of one names only `run-1`.
- **3, Medium, admissions** (`e13b58e2`, `postgres-state`). An `admissions` trigger writes an `admission` touch, mapped to the cards of the tasks that name it. `fb-15-p1-3.log`: no touch is written.
- **4, Medium, installation state** (`e13b58e2`, `postgres-state`). `installation` triggers write a `fleet` touch on insert and on a change of `quarantined` or `recovery_epoch`, not of the identity. `fb-15-p1-4.log`: no touch is written.
- **5, Medium, session activity** (`60cce934`, `control-plane-api`). A task is `working` only while a session binds its active attempt or still runs a generation of it (stopping, unconfirmed), else `stopped`; the test fixture's sessions now bind their task's attempts. `fb-15-p1-5.log`: a stopped session of an earlier attempt with a retry awaiting placement answers `working`.
- **6, Medium, admission order** (`4f00c1f4`, `control-plane-api`, `postgres-state`). Fixed under the coordinator decision of 2026-11-03 on finding 6, which replaced the deferral of `7f1475ca`. Admission order is the order in which tasks were created (design decision 10, product ports section 3.7, `TaskDetail.tasks`), so migration `1792934100000` adds `tasks.admission_seq` from a PostgreSQL sequence that the tasks INSERT takes, backfills existing tasks in task identifier order, and makes it `NOT NULL`; `PostgresCardCatalog.tasks` orders by the path of sequences from the root, each delegated child under its parent. `fb-15-p1-6.log`, at `c4eabd6c` with the new tests: 3 of 3 fail, the PostgreSQL order test (task identifier order), the PostgreSQL against in-memory test, and the migration test (no `admission_seq` column).
- **7, Medium, card obstacle** (`b6386560`, `control-plane-api`). The card shows its first rejected obstacle, else its first waiting one only while `waitingFor` is capacity, which any waiting obstacle of the current stage now selects; each task in the detail keeps its own. `fb-15-p1-7.log`: a card waiting for a person carries the waiting `worker-capacity-exhausted` obstacle.
- **8, Medium, numbering test** (`9b5f193f`, `control-plane-api`). The test waits on the numbering horizon condition (the query of item 14's `untilNumberable`) and numbers through the READ COMMITTED `PostgresUiEventLog`; a new test holds an older transaction open, sees `assign` answer 0, and numbers after it ends. `fb-15-p1-8.log`: the original test, with an older transaction open in another database of the cluster, fails `0 !== 1`; the probe file was not committed.
- **9, Medium, titles** (`2ce1c0eb`, `product-ports`, `postgres-state`). `parseCardRecord` refuses an unpaired surrogate, so both adapters accept only titles that PostgreSQL text keeps; the shared conformance case also reads back an astral title unchanged. `fb-15-p1-9.log`: the case fails on both adapters (`high surrogate` and `low surrogate` accepted).
- **10 and 11, Low, design** (`522f9217`). Decision 6 describes `total` and `byCard`; decision 3 names `unavailable` for `enqueue` and `recordManualMerge` and `not-found` for `transition` and `latestForRun`.

The same commit `522f9217` applies the coordinator decisions of 2026-11-03 after pass 1: the dedupe bound and the one-time first events (decision 7), the three deviations, traceability, task order, and trigger-written touches (decision 9), and the follow-ups; `4f00c1f4` and the records after it remove the task order deviation (finding 6).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `2dd515e45a135c317ae77f3edadfac741e1b51c3`; tests 4541, pass 4532, fail 0, skipped 9; all files 99.42% lines, 92.70% branches, 98.78% functions.
- `npm run openspec -- validate implement-board-and-inbox-views --strict`: passed, `Change 'implement-board-and-inbox-views' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 107 file(s); every pass summary file is valid: 87 file(s); every route file is valid: 40 file(s).`.
- Spec diff against the merge base `468783d9f2e5` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a15e-ae75-7220-8a24-a46c374d3bc0` | 0 | 2 | 7 | 2 |
<!-- make record: end -->

## Limitations

- Until item 25 registers cards, no writer calls `CardCatalog.register`, so every board is empty and every task detail answers `404` (Q2 (a)).
- The merge queue is the empty `NoMergeQueue` until item 23 (Q5 (a)); `integration` never reaches `queued`, `merging`, or `integrated` before it.
- `traceability` of the task detail is empty until item 25.
- The admission order of concurrent admissions is the order of their sequence values, not of their commits, and may have gaps (design decision 10).
- The order of `waitingFor` and the session activity derivation follow the design (decision 4), which the contract does not fix.
- A worker or fleet touch reprojects every card; the batch dedupes the reads per card and the stored projection the events (design decision 7); narrowing and measuring it is a follow-up.
- The first worker touch after the migration appends one `board-changed` per project, a known one-time event (design decision 7).
- Review pass 1 ran; its fixes await pass 2. No deployment or browser check was made (backend only).

## Remaining gates

- Review pass 2 by reviewer B over the pass 1 fixes, and pass 3 when governance "Review sequence" requires it, with their fix rounds.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
