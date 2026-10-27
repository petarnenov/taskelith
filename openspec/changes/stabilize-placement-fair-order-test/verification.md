# Verification: stabilize-placement-fair-order-test

## Scope and source

Assigned on 2026-10-27 by the coordinator, with the approved option A and a mirror case. Source: on a loaded 2020 Intel iMac, `apps/control-plane/test/placement.integration.test.ts:226` "tasks are placed in fair order across projects" placed `task-2` instead of `task-1`. Base revision: `fe64386` on `dev`. Prepared in the git worktree `../taskelith-worktrees/stabilize-placement-fair-order-test` on branch `stabilize-placement-fair-order-test`; the fix is commit `55f2fb4`. Scope: that test file and this change. No product code changes, `packages/modules/scheduling/src/domain/fair-order.ts` is unchanged, and the requirement is unchanged, so `.openspec.yaml` sets `skip_specs: true`, as `stabilize-observability-lag-test` did. Commit types `test` and `docs`; the package is private.

## Environment

MacBook Air, macOS 26.6.2 (Darwin 25.6.0, arm64), Node.js v24.22.1, Docker 29.6.1, PostgreSQL in Docker as `scripts/services.sh run` and `make verify` start it. This is not the iMac (macOS x86_64) where the failure occurred.

## Author self-check

- Against the requirement "Waiting placements" (oldest first within each project): the first test pins `task-1` older than `task-2` and expects `task-1`; the mirror test pins `task-2` older and expects `task-2`, so the order is shown to follow waiting age, not submit order or id.
- Against "Project rotation": `task-3` is pinned newest, so a global oldest-first order would place `task-1` and `task-2`; placing `task-3` can only come from the round-robin.
- Against the brief: the queue orders only by the `placement_waiting_since` column (`packages/adapters/postgres/src/capacity-repositories.ts:159-171`); the record's `changedAt` feeds only that column (`packages/adapters/postgres/src/repositories.ts:177-184`), and placement replaces a task by generation, so pinning the column leaves a consistent waiting row. Product code, the bound, and timing are unchanged; no retry or tolerance was added.
- Comments: the two new helper comments are within the comment length rule.
- Evidence check: no external link; the results below come from the commands listed.

## Diagnosis

`TaskService.submitTask` stamps `changedAt` with `tx.now()` (`apps/control-plane/src/application/task-service.ts:44`), which reads the database's `SELECT now()` (`packages/adapters/postgres/src/capacity-repositories.ts:337`), the start of the submit transaction. The submits run in sequential, awaited transactions; equal stamps still place `task-1` by the id tie-break. Only a strictly earlier stamp on `task-2`, which the server's wall clock in the Docker Desktop VM gives when it steps back between the two submits, places `task-2`. Concurrency was ruled out.

## Checks

- Failing before (perturbation not committed). On `fe64386`, the line below was inserted into the old test after `await submit('task-3', 'run-2');` and before `placeWaiting()`:

  ```ts
  await sql("UPDATE tasks SET placement_waiting_since = (SELECT placement_waiting_since FROM tasks WHERE id = 'task-1') - interval '1 millisecond' WHERE id = 'task-2'");
  ```

  Command: `bash scripts/services.sh run fairorder node --experimental-strip-types --test --test-name-pattern='fair order' apps/control-plane/test/placement.integration.test.ts`, after `npm run build`. Result: 1 test, 1 failed, with `AssertionError [ERR_ASSERTION]: project-2 is served before project-1 again`, `actual: [ 'task-2', 'task-3' ]`, `expected: [ 'task-1', 'task-3' ]`, at `placement.integration.test.ts:235`, the observed failure.
- Passing after (perturbation not committed). On `55f2fb4`, the same line was inserted right after `await submitTwoProjects();`, where the submit stamps are written, before the `waitingSince` pins. Same command: 1 test, 1 passed, 0 failed.
- `bash scripts/services.sh run fairorder bash -c '<the file once, then 30 times>'` with `node --experimental-strip-types --test apps/control-plane/test/placement.integration.test.ts`: 22 of 22 tests passed, and 0 failures in 30 consecutive runs.
- `npm run verify:comments`: every comment is within the rule.
- `npm run openspec -- validate stabilize-placement-fair-order-test --strict`: valid.
- `make verify` passed (exit 0) on `673e22f`: 2,018 tests, 2,016 passed, 0 failed, 2 skipped; coverage 99.29 % lines, 92.14 % branches, 99.05 % functions; strict OpenSpec validation 70 passed, 0 failed; contract compatibility, archive dry run, and package verification passed.

## Independent review

Pending.

## Limitations

- The failure was not reproduced on the iMac itself; it was reproduced by forcing the inversion of the waiting stamps, and the iMac's clock events were not captured.
- The two fair order tests no longer use the stamps the submit writes; the other tests of the file and the capacity conformance suite still do.

## Remaining gates

- Independent review.
- Integration into dev by the coordinator (single pull request).

## Follow-up outside scope

`fairPlacementOrder` (`packages/modules/scheduling/src/domain/fair-order.ts:25-27`) breaks ties on waiting time only by project id, with no explicit task-id tie-break, and relies on a stable sort to keep the queue's id order among a project's tasks with equal stamps. An explicit task-id tie-break would make that order independent of the input order.
