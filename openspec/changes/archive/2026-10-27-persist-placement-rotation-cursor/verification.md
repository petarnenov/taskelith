# Verification: persist-placement-rotation-cursor

## Scope and source

The coordinator (Niki) assigned this task to the worker Pepi on 2026-10-27, and it was developed in a briefed subagent. `PlacementService` kept the rotation cursor of capacity reservation section 13 only in memory, so a control-plane restart started the rotation again and could serve the same project twice in a row. [ADR 0015](/docs/decisions/0015-g2-closure.md#5-deferrals), decision 5 "Fair-order rotation", left storing the cursor as a non-blocking follow-up owned by the coordinator. The coordinator approved option (a) of [design.md](design.md): a stored cursor per installation, written in the placing transaction or once at the end of the pass.

## Revision

- Base: `origin/dev` `8aa75985`.
- Implementation and tests: `5c1dcb12` (`chore: persist the placement rotation cursor per installation`). First change documents: `ada7a475`.
- Merge of `origin/dev` `56346d92`: `cf23a546`. It brings ADR 0015 (#347) and `stop-placement-pass-at-fleet-decline` (#348), which ends a pass at its first decline for lack of fleet capacity.
  - Conflicts were in `placement-service.ts`, resolved with #348's `#offer` comment and its `break`, and in `capacity-reservation.md`, resolved with #348's "Fair order" bullet plus this change's "Durable cursor" bullet.
  - The merge commit also adapts this change to the stop rule. `RotationCursor.moving` and the `moveTo` argument are removed, because every placement of a pass now moves the cursor. The unit test for a decline after the first fleet decline, a case that no longer occurs, is retargeted to a pass that a fleet decline stops. The spec delta is rebuilt from the merged living text. The contract, proposal, design, and tasks are updated.
  - The merge needed no dependency inventory change, and `npm run verify:dependencies` passed in `make verify`.
- Record of the merge and its `make verify`: `a0667625`.
- Fixes of review pass 1: `83c9f799` (`chore: store a decline-only cursor move only over the cursor the pass read`); its record: `5a121ac4`.
- Fixes of review pass 2: `d330063b` (`chore: skip the decline-only cursor write after an outage`). This record of pass 2 comes in the commit after it. File and line citations below are to `d330063b`.

## Environment

macOS 26.6.2 (build 25G83), x86_64; Node.js 24.22.1 through `nvm use`; Docker Desktop for the PostgreSQL, NATS, and Toxiproxy services of `make verify`.

## Author self-check

- Code (`apps/control-plane/src/application/placement-service.ts`):
  - `PlacementService` reads the cursor in its `readCommitted` read (`:73`) and has no cursor field.
  - `placeMovingCursor` (`:196`) advances the cursor to the placed task's project in the placing transaction. `#offer` records that as `stored` (`:101`), and the pass ends at its first fleet capacity decline (`:106`).
  - A pass that an outage stops returns before any end-of-pass write (`:86`). Otherwise `#storeUnstoredMove` (`:117`) writes once at the end of the pass, only when the cursor differs from what the placements stored, and through `advanceFrom(after, next)` (`:121`) only while the stored cursor is still the one the pass read.
- Adapters:
  - `InMemoryPlacementRotation` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:56`) is one object per in-memory store (`apps/control-plane/test/in-memory-capacity.ts:41`), so a new service over the same store reads it.
  - `PostgresPlacementRotation` (`packages/adapters/postgres/src/capacity-repositories.ts:190`) upserts the one row of `placement_rotation` in `advance` (`:202`), and in `advanceFrom` (`:211`) updates it only from the expected project or inserts it only when there is none. `packages/adapters/postgres/migrations/1792932500000_placement-rotation.sql` creates the table.
- Contract and spec: capacity reservation section 13, bullet "Durable cursor" (`docs/contracts/capacity-reservation.md:236`), and the requirement "Rotation cursor storage" state the same rules as the code:
  - each placement stores the cursor in its own transaction;
  - one end-of-pass transaction stores a move by declines alone, only in a pass that no outage stopped, and only while the stored cursor is still the one the pass read;
  - a pass that does not move the cursor writes nothing;
  - the last placement wins.
- Spec delta:
  - "Project rotation" is MODIFIED. Its body is the merged living text, unchanged at 498 characters, with its ten scenarios unchanged and "Restart" added.
  - "Rotation cursor storage" is ADDED, with a body of 410 characters and five scenarios, "Lost commit reply" and "Outage after a decline" among them.
- The truncation lists of the PostgreSQL tests include `placement_rotation`. The migration tests list the new migration and hold it back where they hold back the later migrations.
- Plan checklist of [design.md](design.md):
  - code, contract, and spec agree;
  - each new placement test fails on the merged base service;
  - the PostgreSQL parts have integration tests, which ran in `make verify`;
  - `findings.jsonl` holds the findings of passes 1 and 2, and `passes.jsonl` one summary line per pass.

## Checks and results

- **Fail-before of the pass 2 fix.** Setup: `apps/control-plane/src/application/placement-service.ts` of `5a121ac4`, everything else of `d330063b`, after `npm run build`, on the same four files as below. Result: tests 98, pass 95, fail 3:
  - "a pass that an outage stops does not overwrite a placement of the cursor's own project" (`placement-rotation.test.ts:111`), the M1 regression test: stored cursor `p-b` instead of `p-a`;
  - "a pass that an outage stops does not store its decline-only move" (`placement-service.test.ts:584`): writes `['p-a']` instead of none;
  - "a pass that a fleet capacity decline stops does not write the unchanged cursor" (`placement-service.test.ts:570`): writes `['p-a', 'p-a']`, because the scripted transaction now writes the cursor of a placement as the real one does, and the earlier service wrote it again at the end of the pass.

  With `d330063b` the four files give tests 98, pass 98, fail 0.
- **Fail-before of the pass 1 fix.** Setup: `apps/control-plane/src/application/placement-service.ts` of `a0667625`, everything else of `83c9f799`, after `npm run build`, on the same four files as below. Result: tests 96, pass 95, fail 1. The failure is the new test "a decline-only move does not overwrite a placement whose commit reply was lost" (`apps/control-plane/test/placement-rotation.test.ts:102`), with the stored cursor `p-a` instead of `p-b`. With `83c9f799` the four files gave tests 96, pass 96, fail 0.
- **Fail-before on the merged base** (on `cf23a546`, before the pass 1 fix). Setup: `apps/control-plane/src/application/placement-service.ts` of `origin/dev` `56346d92`, everything else of `cf23a546`, after `npm run build`. Command: `node --experimental-strip-types --test` over these four files:
  - `apps/control-plane/test/placement-rotation.test.ts`
  - `apps/control-plane/test/placement-service.test.ts`
  - `packages/modules/scheduling/test/resource-admission.test.ts`
  - `packages/modules/scheduling/test/repository-conformance.test.ts`

  Result: tests 94, pass 88, fail 6. The six failures are the new tests, cited at their lines in `d330063b`:
  - "after a restart the rotation continues after the stored cursor" (`placement-rotation.test.ts:79`)
  - "a placement stores the cursor in the placing transaction, before an outage stops the pass" (`placement-rotation.test.ts:89`)
  - "a new service over the same store starts after the stored cursor" (`placement-service.test.ts:544`)
  - "a move by an own-reason decline alone is stored at the end of the pass" (`placement-service.test.ts:556`)
  - "a pass that a fleet capacity decline stops does not write the unchanged cursor" (`placement-service.test.ts:570`)
  - "a failed write of a decline-only move fails the pass" (`placement-service.test.ts:592`)
- **After the merge adaptation, same four files:** tests 94, pass 94, fail 0.
- **Earlier fail-before, before the merge.** Base service of `8aa75985` with `5c1dcb12`: tests 93, pass 87, fail 6.
- **`make verify` on `cf23a546`** (2026-10-27, 15:32:21 to 15:35:05 local): passed.
  - Tests 2162, pass 2160, fail 0, skipped 2; test run `duration_ms` 134131.
  - All files: 99.29% lines, 92.15% branches, 99.01% functions.
  - `placement-service.js`: 100% lines, 91.20% branches, 100% functions.
  - `capacity-repositories.js`: 100%, 97.75%, 100%.
  - `in-memory-placement.js`: 100%, 100%, 100%.
  - The PostgreSQL checks passed: the restart test "a new service over the same database continues the rotation after a restart" (`apps/control-plane/test/placement.integration.test.ts:293`), both PostgreSQL placement rotation conformance cases (`packages/adapters/postgres/test/capacity-conformance.integration.test.ts:64`), "migrations apply once, record their checksums, and create the schema", "the placement rotation down migration removes the rotation cursor" (`packages/adapters/postgres/test/migrations.integration.test.ts:404`), and the existing "two concurrent passes over one task place it once, with one charge and one offer".
  - Comment rule passed; findings 26 files and pass summaries 6 files valid; OpenSpec 70 passed, 0 failed; links conform; every active change archives into strictly valid specs; packed file allowlist and installed CLI verification passed.
- **`make verify` on `83c9f799`** (2026-10-27, 15:41:47 to 15:44:40 local): passed.
  - Tests 2165, pass 2163, fail 0, skipped 2; test run `duration_ms` 139560.
  - All files: 99.29% lines, 92.15% branches, 99.01% functions.
  - `placement-service.js`: 100% lines, 91.20% branches, 100% functions.
  - `capacity-repositories.js`: 100%, 97.85%, 100%.
  - `in-memory-placement.js`: 100%, 100%, 100%.
  - These passed: the lost-commit regression test; the conditional-move conformance case, in memory and on PostgreSQL; the PostgreSQL restart test; the down migration test; and "two concurrent passes over one task …".
  - The other checks passed: OpenSpec 70 passed, 0 failed; findings 26 files and pass summaries 6 files valid; comments, links, archive dry run, dependencies, and package.
- **`make verify` on `d330063b`** (2026-10-27, 15:55:58 to 15:58:54 local): passed.
  - Tests 2167, pass 2165, fail 0, skipped 2; test run `duration_ms` 138088.
  - All files: 99.29% lines, 92.14% branches, 99.01% functions.
  - `placement-service.js`: 100% lines, 91.13% branches, 100% functions.
  - `capacity-repositories.js`: 100%, 97.85%, 100%.
  - `in-memory-placement.js`: 100%, 100%, 100%.
  - These passed: both outage tests of pass 2; the lost-commit test of pass 1; the conditional-move conformance case, in memory and on PostgreSQL; the PostgreSQL restart test; and "two concurrent passes over one task …".
  - The other checks passed: OpenSpec 70 passed, 0 failed; findings 26 files and pass summaries 6 files valid; comments, links, archive dry run, dependencies, and package.
- After this record: `npm run openspec -- validate persist-placement-rotation-cursor --strict` valid; `npm run verify:links` conforms; `make findings ARGS="validate"`: every findings file is valid (26 files), and every pass summary file is valid (6 files).

## Independent review

Criteria: the ADR 0004 principles and the plan checklist of [design.md](design.md).

- Pass 1 (reviewer A), run by the coordinator:
  - Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox.
  - Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, on `a0667625`.
  - Model confirmation: the output header names model `gpt-6.1-sol` and reasoning effort `medium`.
  - Session: `01a17d94-0ac4-7cd2-a59b-f90929daeb30`.
  - Snapshot before and after: identical (`b4fe5aa7…71fc82`).
  - Findings: Critical 0, High 1, Medium 0, Low 2.

| Finding | Resolution |
| --- | --- |
| H1: the decline-only cursor write at the end of a pass could replace the move of a placement that committed but whose commit reply was lost (`unavailable`, `outcome: unknown`) | `83c9f799`: the end-of-pass write is the conditional `advanceFrom(after, next)`, which stores the move only while the stored cursor is still the one the pass read (design D8). Added a conformance case, in memory and on PostgreSQL, and the regression test `placement-rotation.test.ts:102`, which fails before the fix. Updated the contract bullet, the requirement "Rotation cursor storage" with the scenario "Lost commit reply", and the limitation text |
| L1: design.md said every offer of a pass moves the cursor | The Context now states the rule: each placement sets the cursor, and only a pass without a placement moves it, to its last own-reason decline before the fleet decline or outage |
| L2: the rationale against option (b) said every own-reason decline leaves no record, but a rejecting reason commits the attempt's end | The rationale now covers the declines that roll back or commit no assignment, and names `endRejectedAttempt` |

`findings.jsonl` holds the three findings with outcome `fixed` and commit `83c9f799`, and `passes.jsonl` the summary of pass 1. Pass 2 confirmed all three resolved.

- Pass 2 (reviewer B), run by the coordinator:
  - Reviewer: Claude Code, model `claude-fable-5-1`, effort `medium`, permission mode `plan` with Edit, Write, and NotebookEdit disallowed.
  - Invocation: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`, on `5a121ac4`.
  - Model confirmation: `modelUsage` of the JSON output names only `claude-fable-5-1`.
  - Session: `77d00a2d-1c7b-47bc-b192-479e3435e270`.
  - Snapshot before and after: identical (`d71e9199…f31e4ad0`).
  - Findings: Critical 0, High 0, Medium 1, Low 6.

| Finding | Resolution |
| --- | --- |
| M1: `advanceFrom` compares values, so a lost commit reply of a placement of the cursor's own project, which the wrap-around read puts last, looked like an unchanged cursor, and the decline-only write overwrote that placement's move. Pass 1 missed it | `d330063b`: a pass that an outage stops makes no end-of-pass write, after every outage rather than only after one marked `outcome: unknown`, so that the application layer does not read a PostgreSQL detail key (design D6, D8). The regression test `placement-rotation.test.ts:111` fails before the fix. Contract section 13, the requirement with the scenario "Outage after a decline", and the limitation text say so. The value comparison stays, for writers other than this pass |
| L1: the scripted placements wrote no cursor, so the unit tests named for the placement transaction went through the end-of-pass write | `d330063b`: the scripted transaction advances the cursor to the task's project when it answers a placement |
| L2: `cursorStored` was always true for a result `#offer` sees | `d330063b`: removed the flag and `PLACED_WITH_CURSOR`; every placement the pass sees counts as stored |
| L3: no unit test for the end-of-pass handling after an outage | `d330063b`: the D6 write no longer exists, so `placement-service.test.ts:584` checks that a pass stopped by an outage writes no decline-only move; it fails before the fix |
| L4: this record still said both record files are empty | This record: the plan checklist entry states what they hold |
| L5: design D2 cited the class line for `advance` | `d330063b`: D2 cites `capacity-repositories.ts:202`; every file and line citation of the records was checked again at `d330063b` |
| L6: ADR 0015 decision 5 still cites `placement-service.ts:51` and `:85` for the removed `#after` | Deferred, out of this change's scope: left to the coordinator at integration, who can mark the ADR 0015 decision 5 follow-up as landed with its pull request number |

`findings.jsonl` holds the seven findings of pass 2: six `fixed` and L6 `deferred`, M1 with `missedBy` pass 1, role A. `passes.jsonl` holds the summary of pass 2. Pass 2 had a Medium finding, so its fixes go to a third pass.

- Pass 3 (reviewer A), the last pass, run by the coordinator:
  - Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox.
  - Invocation: as in pass 1, on `bc9bad26`.
  - Model confirmation: the output header names model `gpt-6.1-sol`, sandbox `read-only`, and reasoning effort `medium`.
  - Session: `01a17daa-5f96-7150-b96f-132e98c035f0`.
  - Snapshot before and after: identical (`fb9785f8…0a205ff9e`).
  - Findings: Critical 0, High 0, Medium 0, Low 0. It confirmed M1 and L1 to L5 of pass 2 resolved and the deferral of L6 recorded correctly.

`passes.jsonl` holds the summary of pass 3; `findings.jsonl` gains no line from it.

## Archive checks

Worker step 7, after review pass 3, 2026-10-27. The checked state is the tree of the archive commit (`docs: archive the persist placement rotation cursor change`): the working tree these checks ran on after `npm run openspec -- archive persist-placement-rotation-cursor --yes` on `8a3936bb`. `origin/dev` was still `56346d92`, the merge base.

- Archive: `Totals: + 1, ~ 1, - 0, → 0`; archived as `2026-10-27-persist-placement-rotation-cursor`, with `findings.jsonl` (ten rows) and `passes.jsonl` (three rows).
- `npm run openspec -- validate --all --strict --no-interactive`: `Totals: 69 passed, 0 failed (69 items)`.
- `npm run openspec -- validate --archived --no-interactive`: the line `✓ change/2026-10-27-persist-placement-rotation-cursor` passes; only this change's line counts.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `openspec/specs/execution-placement/spec.md`, 27 lines added and none removed: the scenario "Restart" of "Project rotation", whose text is otherwise unchanged, and the requirement "Rotation cursor storage" with its five scenarios.
- `make findings ARGS="validate"`: every findings file is valid (26 files), and every pass summary file is valid (6 files).
- `make verify` (2026-10-27, 16:04:38 to 16:07:25 local): passed; tests 2167, pass 2165, fail 0, skipped 2; test run `duration_ms` 137261; all files 99.29% lines, 92.15% branches, 99.01% functions; OpenSpec 69 passed, 0 failed; findings 26 files and pass summaries 6 files valid; every active change archives into strictly valid specs; packed file allowlist and installed CLI verification passed.

## Limitations

- Control-plane instances share one cursor and the last placement wins. An end-of-pass write does not overwrite another writer's change unless that writer set the same project back, and no instance otherwise coordinates its passes with another (design D7, D8).
- A move by declines alone is lost when an outage stops its pass or when its end-of-pass write fails (design D6).
- The conditional end-of-pass write compares values, so another writer that moved the cursor away and back is not detected (design D8).

## Remaining gates

- Integration into dev by the coordinator (single pull request)
