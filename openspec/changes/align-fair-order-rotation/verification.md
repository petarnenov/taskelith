# Verification: align-fair-order-rotation

## Scope and source

Assigned on 2026-10-27 by the coordinator (Niki), who chose option B of Zaki's diagnosis: the domain owns the fair order rule. The diagnosis: `PlacementService.#placeDue` (`apps/control-plane/src/application/placement-service.ts:68-87` on the base) read a batch with `tx.placements.waiting(PLACEMENT_BATCH, notDue, this.#after)`. `PostgresPlacementQueue.waiting` (`packages/adapters/postgres/src/capacity-repositories.ts:159-171`) ranks each project's tasks by waiting time and task id in `"C"` collation, and orders each round by the projects after the cursor `after` first, wrapping, by `project_id COLLATE "C"`. The service then set `#after` to the last row's project (`:78`) and offered in `fairPlacementOrder(waiting)` (`:80`), which ordered each round's projects by their oldest task and ignored the cursor, undoing the rotation. With one free slot, `p-a` with `a1`, `a2`, `a3` since `t0`, `t1`, `t2` and `p-b` with `b1` since `t5`: after `a1` was placed (cursor `p-a`) the queue read `b1`, `a2`, `a3`, but the domain offered `a2` first, so `p-b` waited until `p-a`'s backlog drained. The in-memory queue (`rankedByProject` in `packages/modules/scheduling/src/adapters/in-memory-placement.ts`) already mirrored the SQL with the cursor.

Scope: `fair-order.ts` (`fairPlacementOrder(waiting, after)` and the new `fairWaitingOrder`), the in-memory queue using the domain function, the placement service re-applying the order with the read's cursor, a placement queue conformance case, a placement service test, the domain unit tests, the capacity reservation contract (sections 5 and 13), the `execution-placement` requirement "Waiting placements", and this change. Prepared in the git worktree `../taskelith-worktrees/align-fair-order-rotation` on branch `align-fair-order-rotation`. Commit types `test`, `chore`, and `docs`; the touched packages are private.

## Revision

Base: `e66d0d72` `docs: archive the fair order tie-break change`, the head of the branch `break-fair-order-ties-by-task-id`, which was not yet in `origin/dev` when this change started; basing on it avoids conflicts with the tie-break change.

- `5d802d6e` `docs: propose aligning the fair placement order with the project rotation` (proposal, design, tasks, empty `findings.jsonl`).
- `9e1b1174` `docs: state the fair order rotation in the capacity contract` (contract first).
- `2b89e496` `docs: specify the fair placement order as the project rotation` (the spec delta).
- `172bace0` `test: expect the fair placement order to follow the project rotation` (the failing tests alone).
- `5cd4fe2b` `chore: offer waiting placements in the project rotation order` (the fix).
- `4fbd8c77` `docs: record the verification of the fair order rotation change` (this record; the revision review pass 1 read).
- Pass 1 fixes: `b3cf9293` `test: cover a rotation cursor between two waiting projects`, `e039b771` `docs: state the round order relative to the cursor in the waiting placements scenario`, and the commit that records these results.

## Environment

Ubuntu Linux 6.8.0-147-generic x86_64 (host `hpz600`), Node.js v24.22.0 through `nvm use`, Docker 27.3.1, PostgreSQL 18.6 in Docker as `make verify` and `scripts/services.sh run` start it.

## Author self-check

- **One rule.** `fairWaitingOrder(waiting, after)` sorts by rank within the project (computed over waiting time, project id, task id), then by whether the project wraps (`byCodeUnits(projectId, after) <= 0`; nothing wraps without a cursor), then project id, then waiting time, project id, and task id. These are the keys of the SQL `ORDER BY project_rank, (project_id COLLATE "C" <= $3) IS TRUE, project_id COLLATE "C", placement_waiting_since, id COLLATE "C"` in the same order, with `PARTITION BY project_id ORDER BY placement_waiting_since, id COLLATE "C"` for the rank. `byCodeUnits` matches `"C"` for the ASCII identifiers the kernel admits, as the tie-break change argued. The SQL treats a null cursor as "nothing wraps" (`IS TRUE`), as the domain does for `undefined`.
- **Adapter uses the domain.** `InMemoryPlacementQueue.waiting` returns `fairWaitingOrder(waiting, after).slice(0, limit)`; its copy (`rankedByProject`, `byWaitingSince`) is removed. The domain imports no adapter; `npm run check:boundaries` passed.
- **Service.** `#placeDue` captures `const after = this.#after` before the read, passes it to the read and to `fairPlacementOrder(waiting, after)`, and moves the cursor afterwards as before. The cursor's update rule is unchanged.
- **Kept behavior.** Rank-first rounds, the cursor, the wrap-around, and the task id and project id tie-breaks stay; only the order of the projects within a round changes from "oldest task first" to "after the cursor, then wrapped, by id". The 1200-blocked-projects test still passes. Section 12's guarantee (`docs/contracts/capacity-reservation.md:226`) is kept, and now holds for a backlog too.
- **Spec.** The `MODIFIED` delta copies the living "Waiting placements" (with the archived tie-break text) in full, describes the offer order as the rotation, rewrites "Equal oldest waiting times across projects" to fit (same name, required by strict validation, which refuses dropping a scenario), and adds "Round order across projects". The requirement text is 467 characters. "Project rotation" already states the read's rotation and is consistent; it is unchanged.
- **Comments.** New comments are at most two lines of at most 80 characters; `npm run verify:comments` passed.
- Evidence check: no external link; the results below come from the commands listed.

## Checks

- Failing before, at `172bace0` (tests only): `npm run build` failed with `packages/modules/scheduling/src/ports/capacity-conformance.ts(370,67): error TS2554: Expected 1 arguments, but got 2.`, since the old function took no cursor.
- Failing before, behaviorally: on `172bace0` with a temporary, uncommitted edit that only added an ignored `_after?: ProjectId` parameter to the old `fairPlacementOrder`, `npm run build` passed, and `node --experimental-strip-types --test packages/modules/scheduling/test/resource-admission.test.ts packages/modules/scheduling/test/repository-conformance.test.ts apps/control-plane/test/placement-service.test.ts`: 65 tests, 60 passed, 5 failed:
  - `with one free slot, the next project is offered before the older backlog of the last one`: actual `[ 'task-a1', 'task-a2', 'task-a3', 'task-b1' ]`, expected `[ 'task-a1', 'task-b1', 'task-a2', 'task-a3' ]`.
  - `in-memory placement queue: a read after a project offers the next project before its backlog, in the fair order`: `fair order: expected ["task-b1","task-a2","task-a3"], got ["task-a2","task-b1","task-a3"]`; the queue's own order (`after a`) passed.
  - `waiting placements rotate across projects in id order, oldest first in each`: actual `[ 'c1', 'a1', 'b1', 'a2', 'a3' ]`, expected `[ 'a1', 'b1', 'c1', 'a2', 'a3' ]`.
  - `a project after the cursor is offered before the older backlog of the cursor project`: actual `[ 'a2', 'b1', 'a3' ]`, expected `[ 'b1', 'a2', 'a3' ]`.
  - `the projects of a round follow project id order by code unit`: actual `[ 'task-1', 'task-2' ]`, expected `[ 'task-2', 'task-1' ]`.
- The same temporary state against PostgreSQL: `bash scripts/services.sh run postgres node --experimental-strip-types --test packages/adapters/postgres/test/capacity-conformance.integration.test.ts`: 33 tests, 32 passed, 1 failed: `PostgreSQL placement queue: a read after a project offers the next project before its backlog, in the fair order` with `fair order: expected ["task-b1","task-a2","task-a3"], got ["task-a2","task-b1","task-a3"]`; the PostgreSQL read order passed.
- Passing after, at `5cd4fe2b`: `npm run build` and `npm run check:boundaries` (`Workspace and hexagonal boundary checks passed.`); `node --experimental-strip-types --test packages/modules/scheduling/test/*.test.ts apps/control-plane/test/placement-service.test.ts`: 119 tests, 119 passed; the PostgreSQL conformance file: 33 tests, 33 passed.
- `npm run openspec -- validate align-fair-order-rotation --strict`: `Change 'align-fair-order-rotation' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make findings ARGS="validate"`: `Every findings file is valid: 6 file(s).`
- Before review, `make verify` passed (exit 0) on `5cd4fe2b`: 2,027 tests, 1,981 passed, 0 failed, 46 skipped; coverage 99.18 % lines, 91.84 % branches, 98.80 % functions; strict OpenSpec validation 70 passed, 0 failed; findings validation, contract compatibility, dependency inventory, archive dry run (`Every active OpenSpec change archives into strictly valid specs.`), and package verification passed.

- After the pass 1 fixes, on `e039b771`: `npm run openspec -- validate align-fair-order-rotation --strict`: valid; `node --experimental-strip-types --test packages/modules/scheduling/test/*.test.ts apps/control-plane/test/placement-service.test.ts`: 121 tests, 121 passed; the PostgreSQL conformance file through `bash scripts/services.sh run postgres ...`: 34 tests, 34 passed, the new case included.
- After the pass 1 fixes, `make verify` passed (exit 0) on `e039b771`: 2,030 tests, 1,984 passed, 0 failed, 46 skipped; coverage 99.18 % lines, 91.86 % branches, 98.80 % functions; strict OpenSpec validation 70 passed, 0 failed; findings validation, contract compatibility, dependency inventory, archive dry run, and package verification passed. With the pass 1 line in `findings.jsonl`, `make findings ARGS="validate"`: `Every findings file is valid: 6 file(s).`; `npm run verify:comments`: within the rule.

## Independent review

### Pass 1

- **Codex CLI v0.163.0, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only` (as the session header states), session `01a17c3e-96fd-7b91-b3ed-ab96f2940b3a`, revision `4fbd8c77` (diff `e66d0d72..4fbd8c77`), run by the coordinator.** Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. The snapshot was `1b07ff811c3993b9b7c73905efead15368c30f184a104f44e3596e1ee6e84da5` before and after the pass. The reviewer ran 65 tests, strict OpenSpec validation, and `git diff --check`, all passing; it did not run the PostgreSQL tests or `make verify`, and `npm run verify:comments` failed in its sandbox (`spawnSync git EPERM`), so it checked the comments by reading them. It confirmed that the service uses the read's cursor, that the domain order matches the SQL for valid ASCII identifiers, with and without a cursor, and that the changed order without a cursor is stated and tested.
- Findings: 0 Critical, 0 High, 1 Medium, 0 Low.
  1. Medium (`specs/execution-placement/spec.md:19`, spec wording): the scenario "Equal oldest waiting times across projects" required the project with the first id first whenever the previous read ended with neither project, but with `project-a` and `project-c` waiting equally long and the cursor `project-b`, the SQL, the domain, and contract section 13 correctly take `project-c` first. Fixed, unreviewed: `e039b771` states the round order relative to a cursor between the two project ids; `b3cf9293` adds the domain test "a cursor between two waiting projects starts the round after it, then wraps" and the shared placement queue conformance case "a read after a project between two waiting ones starts after it, in the fair order". The code was already right, so these tests pass on `5cd4fe2b` and after; they guard the stated order. `findings.jsonl` records the finding as `fixed-unreviewed`.

### Pass 2

Pending: the same reviewer, on the pass 1 fixes.

## Limitations

- The new conformance cases cover two cursor examples on both queues; the agreement of the domain with the SQL for other inputs is argued from the query text above.
- The red runs used a temporary signature-only edit, not a committed revision, because the tests do not compile against the old signature.

## Follow-ups (out of scope, for `close-g2`)

- `#after` lives only in the placement service's memory and resets when the control plane restarts.
- The cursor is the last row's project, not the last project of the first round, which weakens the rotation when a batch is cut by its limit inside a round.

## Remaining gates

- Independent review pass 2 (Codex CLI `gpt-6.1-sol`) of the pass 1 fixes.
- Archive by the author after review, as the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
