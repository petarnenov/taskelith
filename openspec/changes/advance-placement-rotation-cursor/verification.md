# Verification: advance-placement-rotation-cursor

## Scope and source

Assigned on 2026-10-27 by the coordinator (Niki), split from review pass 2, finding M2, of `align-fair-order-rotation` (its archived `design.md` and `verification.md`). `PlacementService.#placeDue` (`apps/control-plane/src/application/placement-service.ts:79` on the base) set `#after = waiting.at(-1)?.projectId ?? this.#after`, the last row's project. A read that holds every waiting task ends with the project of the deepest backlog, so each next read wrapped and started with the same first project: with one free slot per pass, `p-a` with `a1`, `a2`, `a3` since `t0`, `t1`, `t2` and `p-b` with `b1` to `b3` later, six passes placed `a1`, `a2`, `a3`, `b1`, `b2`, `b3` instead of the rotation.

Scope: the cursor rule (`RotationCursor` in `packages/modules/scheduling/src/domain/fair-order.ts`, exported from `@taskelith/scheduling`), the placement service using it, its tests, the capacity reservation contract (sections 5 and 13; section 12 kept), the `execution-placement` requirements "Project rotation" and "Waiting placements", and this change. Out of scope: `#after` lives only in memory and resets on restart. Prepared in the git worktree `../taskelith-worktrees/advance-placement-rotation-cursor` on branch `advance-placement-rotation-cursor`, by an implementation subagent of the developing session. Commit types `docs`, `test`, and `chore`; the touched packages are private.

## Revision

Base: `d5f3baf3` `docs: archive the fair order rotation change`, the head of the branch `align-fair-order-rotation`, which builds on `break-fair-order-ties-by-task-id` (`e66d0d72`); neither was in `origin/dev` when this change started.

- `396c9cc1` `docs: propose advancing the placement rotation cursor past the project served` (proposal, design, tasks, empty `findings.jsonl`).
- `01eb65dd` `docs: state the rotation cursor rule in the capacity contract` (contract first).
- `2d7695e2` `docs: specify the rotation cursor as the project that last received capacity` (the spec delta).
- `552adee2` `test: expect the rotation cursor to follow the project that last received capacity` (the failing tests alone).
- `0d28a18b` `chore: advance the placement rotation cursor past the project that last received capacity` (the fix).
- The commit that adds this record.

## Environment

Ubuntu Linux 6.8.0-147-generic x86_64 (host `hpz600`), Node.js v24.22.0 through `nvm use`, Docker 27.3.1, PostgreSQL in Docker as `make verify` starts it.

## Author self-check

- **Cursor rule.** After a pass, `#after` is the project of the last task the pass placed, in offer order; when it placed nothing, the project of the last task it offered, an offer being a placement transaction that ended without an outage (`placed`, `ended`, `backing-off`, not accepted, or not waiting); when it offered nothing (empty read, no candidate worker, or an outage at the first offer), the cursor is unchanged. An outage stops the pass and the cursor still moves by the offers before it; the failed task is not counted.
- **Why not keep the cursor when nothing was placed.** Projects with no capacity-eligible task would hold the rotation: with 1200 blocked older projects, every read would return the same first 100, and the "Many blocked projects" test would fail. Moving to the last offer skips only projects that were offered and declined, so such a pass jumps past its whole read, as the code did before.
- **Why keep it without a candidate.** No transaction is opened and no project is offered capacity, so none loses its turn.
- **Section 12.** A pass that places moves the cursor past the last project served; one that places nothing moves it past every project it read; the cursor stays only when nothing was offered. A project declined because the capacity ran out is offered first in the next pass; a blocked project is offered again and declined, costing a transaction, not capacity. The 1200-project test passes unchanged.
- **Boundaries.** The rule is a small domain class with no I/O; the service records offers and placements into it and stores `next`. The service offers in `fairWaitingOrder(waiting, after)` (entries carry the project id); `fairPlacementOrder` keeps its conformance callers. The no-candidate path settles every task with `NO_CANDIDATE` as before, without the loop. `npm run check:boundaries` passed.
- **Queues unchanged.** Both queues already start after the cursor they are given; the PostgreSQL query is untouched.
- **Spec.** The `MODIFIED` delta copies the living "Waiting placements" and "Project rotation" in full. "Waiting placements" now names the rotation cursor instead of the previous read's project (text and two scenarios, same names); "Project rotation" states the cursor rule (410 characters; "Waiting placements" 459) and adds the scenarios "One free slot", "Several placements in a pass", "No candidate worker", and "Outage during a pass".
- **Contract.** Section 5 says the rotation starts after the project that last received capacity; section 13 "Fair order" states the full rule. Section 12 is unchanged.
- **Comments.** New comments are at most two lines of at most 80 characters; `npm run verify:comments` passed.
- **Tests.** The one-slot store became `fleetStore(backlog, placed, fleet)` with a configurable slot count, candidates, and one-shot outages; the existing one-slot test keeps its expectation.
- Evidence check: no external link; the results below come from the commands listed.

## Checks

- Failing before, at `552adee2` (tests only): `npx tsc -p tsconfig.check.json` failed with `packages/modules/scheduling/test/resource-admission.test.ts(14,3): error TS2305: Module '"@taskelith/scheduling"' has no exported member 'RotationCursor'.`, and the domain test file failed to load (`SyntaxError: The requested module '@taskelith/scheduling' does not provide an export named 'RotationCursor'`).
- Failing before, behaviorally: `node --experimental-strip-types --test --test-reporter=spec apps/control-plane/test/placement-service.test.ts` at `552adee2` after `npm run build`: 17 tests, 13 passed, 4 failed:
  - `with one free slot, two backlogs alternate across six passes`: actual `[ 'task-a1', 'task-a2', 'task-a3', 'task-b1', 'task-b2', 'task-b3' ]`, expected `[ 'task-a1', 'task-b1', 'task-a2', 'task-b2', 'task-a3', 'task-b3' ]`.
  - `after several placements in a pass, the next read starts after the last one` (two slots per pass): actual `[ 'task-a1', 'task-b1', 'task-b2', 'task-c1', 'task-a2', 'task-a3', 'task-a4' ]`, expected `[ 'task-a1', 'task-b1', 'task-c1', 'task-a2', 'task-b2', 'task-a3', 'task-a4' ]`.
  - `a pass without a candidate worker keeps the rotation cursor`: actual `[ 'task-b1', 'task-a1', 'task-a2' ]`, expected `[ 'task-a1', 'task-b1', 'task-a2' ]`.
  - `after an outage stops a pass, the next read starts after its last placement`: actual `[ 'task-a1', 'task-c1', 'task-d1', 'task-b1', 'task-b2' ]`, expected `[ 'task-a1', 'task-b1', 'task-c1', 'task-d1', 'task-b2' ]`.
  The 1200-project test and the four-pass one-slot test passed.
- Passing after, at `0d28a18b`: `npm run build`, `npx tsc -p tsconfig.check.json`, and `npm run check:boundaries` (`Workspace and hexagonal boundary checks passed.`); `node --experimental-strip-types --test apps/control-plane/test/placement-service.test.ts packages/modules/scheduling/test/*.test.ts`: 128 tests, 128 passed, the 1200-project test included.
- `npm run openspec -- validate advance-placement-rotation-cursor --strict`: `Change 'advance-placement-rotation-cursor' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make findings ARGS="validate"`: `Every findings file is valid: 7 file(s).`
- Before review, `make verify` passed (exit 0) on `0d28a18b`: 2,037 tests, 1,991 passed, 0 failed, 46 skipped; coverage 99.18 % lines, 91.87 % branches, 98.80 % functions; strict OpenSpec validation 70 passed, 0 failed; comments within the rule; findings validation (`Every findings file is valid: 7 file(s).`), contract compatibility, dependency inventory, archive dry run (`Every active OpenSpec change archives into strictly valid specs.`), and package verification passed.

## Independent review

### Pass 1

Pending: Claude Code, model `claude-opus-5-5`, effort `high`, run by the developing session.

## Limitations

- The service tests use an in-memory queue and a scripted transaction; the PostgreSQL queue is unchanged and covered by its existing conformance cases, which take the cursor as an argument.
- The bounded-pass argument for mixed backlogs is reasoned in the design; the tests cover blocked projects (1200), one and two slots per pass, no candidate, and an outage.

## Follow-ups (out of scope)

- `#after` lives only in the placement service's memory and resets when the control plane restarts; a follow-up for `close-g2`.

## Remaining gates

- Independent review pass 1 (Claude Code, `claude-opus-5-5`, effort `high`).
- Integration into dev by the coordinator (single pull request), after `align-fair-order-rotation` (and `break-fair-order-ties-by-task-id`), on which this branch is based.
