# Verification: stabilize-placement-capacity-decline-test

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by briefed subagents; a first subagent found the cause and committed the test fix, and a second one checked it, added the spec delta, and wrote these records. Source: an intermittent placement test about a slot freed after a fleet capacity decline. The candidates of the brief were `apps/control-plane/test/placement-service.test.ts:429` and `:461`, which use the in-memory store; the flaky test is the integration variant "a slot freed after a fleet capacity decline goes to the next project, not the larger backlog" (`apps/control-plane/test/placement.integration.test.ts:183`), whose expectation depends on the database clock. The intermittent failure was not observed on this host; it was reproduced deterministically ("Fail-before"). Scope: that test, the `execution-placement` delta that the coordinator asked for (option B, no `skip_specs`), and this change. Excluded: product code, other flaky tests. Commit types `test` and `docs`; `@taskelith/control-plane` is private.

## Revision

- Base: `dev` `44bd3592` (#442); the checklist was saved with `--at 44bd35924520870b0c5be829487c9c4156d64a36 --size S`.
- `f001b776` `test: pin the waiting ages of the placement capacity decline test` (the fix).
- `b7f908c1` `docs: propose the stabilize placement capacity decline test change` (proposal, design, tasks, the spec delta, `checklist.json`, `.openspec.yaml`, and the empty `findings.jsonl` and `passes.jsonl`).
- `69635a93` `docs: record the review route of the stabilize placement capacity decline test change` (`route.json` unedited).
- `bb2da9b2` `docs: record the checks of the stabilize placement capacity decline test change`.
- The commit of the review record and the archive commit follow.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs, Docker Engine 27.3.1. `make verify` ran with the `.nvmrc` pin, Node.js 24.22.1; the targeted runs ran with Node.js 24.22.0 from the shell's `PATH`, after `npm run build`, inside `bash scripts/services.sh run spcd ...` from the worktree. The logs are in Zaki's session scratchpad `/tmp/claude-1000/-home-petar-taskelith/b2f59113-7371-431b-8ca7-f0f5db414984/scratchpad/spcd/`.

## Diagnosis

- `TaskService.submitTask` stamps the task with `tx.now()` (`apps/control-plane/src/application/task-service.ts:44`), the database's `SELECT now()` at the start of the submit transaction (`packages/adapters/postgres/src/capacity-repositories.ts:372-374`), and the task repository writes that stamp to `placement_waiting_since` (`packages/adapters/postgres/src/repositories.ts:184`).
- The queue ranks each project's tasks by `placement_waiting_since`, then id (`packages/adapters/postgres/src/capacity-repositories.ts:162-174`), and the placement service ranks them again by the same stamp in `fairWaitingOrder` (`apps/control-plane/src/application/placement-service.ts:89`, `packages/modules/scheduling/src/domain/fair-order.ts:58-72`).
- The test submits 50 tasks of project-1 in sequential transactions and expects `task-a01` placed. A database server clock that steps back between two submits gives a later task an older stamp, and the placement then correctly serves it first. The product follows "Waiting placements"; the test assumed that submit order is waiting age. Same mechanism as the archived `2026-10-27-stabilize-placement-fair-order-test`.

## Author self-check

- Fix: the test pins all 51 stamps with the existing `waitingSince` helper, one second apart in submit order (`apps/control-plane/test/placement.integration.test.ts:189-193`), so `task-a01` is the oldest of project-1 and `task-b` newer than all of them, independent of the clock. Pinning after the submits leaves consistent waiting rows: the stamp is a query column only. The assertions, timing, and product code are unchanged; no retry or tolerance was added.
- Spec delta: MODIFIED "Waiting placements" copies the current requirement and its five scenarios and adds "Older stored stamp of a later submit". The requirement text has 459 characters. Archive probe: a copy of `openspec/` in the scratchpad (`spcd/archive-probe`), `openspec archive stabilize-placement-capacity-decline-test --yes` with the worktree's pinned CLI (`~ 1 modified`), then `openspec validate --all --strict`: `Totals: 71 passed, 0 failed (71 items)`.
- The new scenario is protected by the existing test "within a project the task waiting longest is placed, not the first submitted" (`apps/control-plane/test/placement.integration.test.ts:316`), which pins the later-submitted `task-2` older than `task-1` and expects `task-2`; "Mutant" below shows that it fails when the order follows submit order. No new test was needed.
- `npm run openspec -- validate stabilize-placement-capacity-decline-test --strict`: `Change 'stabilize-placement-capacity-decline-test' is valid`.
- The new test comment is two lines of at most 80 characters; `make verify` runs `npm run verify:comments`. No AI attribution in commits.

## Fail-before

The test of the base `44bd3592` (`git show 44bd3592:apps/control-plane/test/placement.integration.test.ts`), copied to a temporary `apps/control-plane/test/zz-before.integration.test.ts` with this line inserted after `await submit('task-b', 'run-2');`, then deleted:

```ts
await sql("UPDATE tasks SET placement_waiting_since = (SELECT placement_waiting_since FROM tasks WHERE id = 'task-a01') - interval '1 millisecond' WHERE id = 'task-a02'");
```

Command: `node --experimental-strip-types --test '--test-name-pattern=goes to the next project, not the larger backlog' apps/control-plane/test/zz-before.integration.test.ts` (`spcd/fail-before.log`): `tests 1, pass 0, fail 1`, `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal`, `actual: [ 'task-a02', 'task-b' ]`, `expected: [ 'task-a01', 'task-b' ]`, at the copy's line 197, the base test's `assert.deepEqual(await placedTasks(), ['task-a01', 'task-b'])` (line 196).

## After

- The same injection in a copy of the fixed test, right after `await submit('task-b', 'run-2');` and before the pins (`spcd/after.log`): `tests 1, pass 1, fail 0`. The pins overwrite the injected stamp, so this shows only that a stamp inversion during the submits cannot reach the assertion, which is the point of the fix; the evidence that a later submit with the older stamp is served first is the test at `:316` and the mutant below.
- 50 consecutive runs of the fixed test (`spcd/runs.sh`, logs `spcd/runs/run-<n>.log`), the same command on `apps/control-plane/test/placement.integration.test.ts`: runs 1 to 30 plain, 30 passed, 0 failed (3684 to 4038 ms each); runs 31 to 50 with 8 `yes > /dev/null` processes on the 8 logical CPUs, 20 passed, 0 failed (4819 to 6640 ms each); total `pass=50 fail=0`. The hog processes were killed by their saved PIDs; `pgrep -x yes` found none afterwards.

## Mutant

Ordering within a project by submit order, `admission_seq`, the sequence each task's INSERT takes:

- SQL only: `packages/adapters/postgres/src/capacity-repositories.ts:167` ranked by `ORDER BY tasks.admission_seq`, rebuilt, the whole file: `tests 30, pass 30, fail 0` (`spcd/mutant.log` of that run was overwritten by the next). `fairWaitingOrder` re-ranks the read by waiting time, so the SQL alone does not decide the order.
- SQL and domain: the same SQL edit, and `ranksWithinProject` (`packages/modules/scheduling/src/domain/fair-order.ts:61`) iterating `waiting` in read order instead of `[...waiting].sort(byWaitingSince)`, rebuilt, the whole file (`spcd/mutant.log`): `tests 30, pass 29, fail 1`; the failure is "within a project the task waiting longest is placed, not the first submitted" (`:316`, assertion at `:322`), `actual: [ 'task-1', 'task-3' ]`, `expected: [ 'task-2', 'task-3' ]`. Both edits were reverted with `git checkout` and the workspaces rebuilt.

## make verify

- Run 1, `env -u NODE_ENV make verify` on `69635a93` (tree `a8950e16`, clean), profile full (`spcd/verify-1.log`): failed on the known flake secrets linear-time, `value redaction takes linear time on long runs` with `"a b" repeated took 201 ms` (`packages/adapters/secrets/test/secrets.test.ts:218`); tests 4821, pass 4773, fail 1, skipped 47; all files 99.42% lines, 92.93% branches, 98.84% functions; `make: *** [Makefile:42: verify] Error 2`. Both placement tests above passed in it.
- Run 2, the rerun for that flake, same tree (`spcd/verify-2.log`): the secrets test passed (485 ms); failed on another known flake, http-evidence-publisher "async activity after a test ended": `a gateway failure, a 503, or no answer is unavailable; other failures keep their meaning` (`packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts:93`) `generated asynchronous activity after the test ended`, `TypeError [ERR_INVALID_STATE]: Invalid state: ReadableStream is already closed`, which failed the file; tests 4822, pass 4774, fail 1, skipped 47; all files 99.42% lines, 92.92% branches, 98.83% functions; `make: *** [Makefile:42: verify] Error 2`.
- Run 3, the rerun for that second flake, same tree (`spcd/verify-3.log`): both flaky tests passed and the Node.js suites passed, tests 4821, pass 4774, fail 0, skipped 47; all files 99.42% lines, 92.90% branches, 98.83% functions. Then the `@taskelith/web` Vitest suite failed one test outside the known list and outside this change: `test/app.test.tsx` "logout, expiry, and login in any order > shows the sign-in page as soon as the logout ends, before the next read" (`apps/web/test/app.test.tsx:255`, at `:252` `Unable to find role="menuitem" and name "Sign out"`, after 5613 ms); `Tests  1 failed | 589 passed (590)`; `make: *** [Makefile:42: verify] Error 2`. The host's load average was about 8 at the time (`uptime`: `5,27, 7,94, 8,26`), with other worktrees' runs.
- Run 4, same tree (`spcd/verify-4.log`): passed, `make verify: passed, profile full, tree a8950e161e472c37fe6a77175eec6c0de8f78df5; stamp written`; tests 4821, pass 4774, fail 0, skipped 47; all files 99.42% lines, 92.93% branches, 98.83% functions; the web suite `Tests  590 passed (590)`.

### Route

`route.json` of `69635a93`, rule version 5: standard (no trigger); pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router (jev-1.14.0) agrees: standard, P(third) 0.37, threshold 0.4. The route is a recommendation only.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a8950e161e472c37fe6a77175eec6c0de8f78df5`; tests 4821, pass 4774, fail 0, skipped 47; all files 99.42% lines, 92.93% branches, 98.83% functions.
- `npm run openspec -- validate stabilize-placement-capacity-decline-test --strict`: passed, `Change 'stabilize-placement-capacity-decline-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 119 file(s); every pass summary file is valid: 99 file(s); every route file is valid: 52 file(s).`.
- Spec diff against the merge base `44bd35924520` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a643-dd48-77f2-aa61-a8b9537f63f7` | 0 | 0 | 0 | 0 |
<!-- make record: end -->

## Independent review

- Pass 1, reviewer A: Codex CLI `gpt-6-astra` at effort medium (owner decision 2026-11-02), session `01a1a643-dd48-77f2-aa61-a8b9537f63f7`, against `bb2da9b2` with the merge base `44bd3592`: 0 Critical, 0 High, 0 Medium, 0 Low. `findings.jsonl` stays empty; the pass is recorded in `passes.jsonl`.
- A pass with no findings ends the review, so pass 2 and pass 3 did not run.
- No fix is unreviewed: the review found nothing to fix.

## Limitations

- The intermittent failure was not observed on this host, and the database clock steps were not captured; the failure was reproduced by inverting two stamps.
- The pinned test no longer uses the stamps the submits write; the other tests of the file and the capacity conformance suite still do.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
