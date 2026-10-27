# Verification: break-fair-order-ties-by-task-id

## Scope and source

Assigned on 2026-10-27 by the coordinator (Niki); the gap was found by the worker of the change `stabilize-placement-fair-order-test`. `fairPlacementOrder` in `packages/modules/scheduling/src/domain/fair-order.ts` had no final tie-break and relied on a stable sort over the order the queue returned. Base revision: `33d341a9` on `dev`. Prepared in the git worktree `../taskelith-worktrees/break-fair-order-ties-by-task-id` on branch `break-fair-order-ties-by-task-id`. Scope: `fair-order.ts`, one unit test in `packages/modules/scheduling/test/resource-admission.test.ts`, the `execution-placement` requirement "Waiting placements", and this change. Commit types `test`, `chore`, and `docs`; `@taskelith/scheduling` is private.

## Revision

- `9bedc1d5` `test: expect task id order for equal waiting placements` (the failing test alone).
- `a89f7102` `chore: break fair placement order ties by task id` (the fix).
- `f0cdc2b2` `docs: specify the task id tie-break of the fair placement order` (this change and the spec delta).
- The commit that adds this record, `docs: record the verification of the fair order tie-break change`, changes only this file.

## Environment

Ubuntu Linux 6.8.0-147-generic x86_64 (host `hpz600`), Node.js v24.22.0 through `nvm use`, Docker 27.3.1, PostgreSQL 18.6 in Docker as `make verify` starts it.

## Author self-check

- **SQL and domain order agree within a project.** `PostgresPlacementQueue.waiting` (`packages/adapters/postgres/src/capacity-repositories.ts:159-171`) ranks each project's tasks by `tasks.placement_waiting_since, tasks.id COLLATE "C"`, and `InMemoryPlacementQueue` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:69-72`) by waiting time, project id, and `byCodeUnits` on the task id. `fairPlacementOrder` now sorts by waiting time, project id, and the task id in code-unit order, so within a project its order is that of both queues for any input order. The earlier keys and the round-robin across projects are unchanged.
- **Collation.** `TaskId` is created only by `parseIdentifier` (`packages/kernel/src/identifier.ts:11-14`), which admits only `[\x21-\x7e]`, so every id is ASCII. For ASCII, UTF-8 bytes (`"C"`) and UTF-16 code units (JavaScript `<`) have the same values and order. `localeCompare` would differ: it orders `task-a` before `task-B`, and the new test uses those ids so that it would fail on it.
- **Spec.** The living requirement "Waiting placements" did not state the tie-break; the `MODIFIED` delta copies its text and both scenarios in full, adds the tie-break to its last sentence, and adds the scenario "Equal waiting times".
- **Comments.** The one new comment is one line of 67 characters.
- Evidence check: no external link; the results below come from the commands listed.

## Checks

- Failing before, at `9bedc1d5` (test only): `npm run build`, then `node --experimental-strip-types --test --test-name-pattern="waiting placements" packages/modules/scheduling/test/resource-admission.test.ts`: `✖ waiting placements with equal waiting times follow task id order`, actual `[ 'task-B', 'task-c', 'task-a', 'task-A' ]`, expected `[ 'task-A', 'task-c', 'task-B', 'task-a' ]`; the existing test "waiting placements alternate between projects, oldest first in each" passed.
- Passing after, at `a89f7102`: the same commands; both tests pass.
- `npm run openspec -- validate break-fair-order-ties-by-task-id --strict`: `Change 'break-fair-order-ties-by-task-id' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make findings ARGS="validate"`: `Every findings file is valid: 5 file(s).`
- `make verify` passed (exit 0) on `f0cdc2b2`: 2,022 tests, 1,976 passed, 0 failed, 46 skipped; coverage 99.18 % lines, 91.85 % branches, 98.80 % functions; strict OpenSpec validation 70 passed, 0 failed; archive dry run (`Every active OpenSpec change archives into strictly valid specs.`) and package verification passed.

## Independent review

### Pass 1

Pending: OpenCode CLI, model `opencode-go/qwen3.8-max`, variant `medium`, as assigned by the coordinator.

## Limitations

- The new test covers the domain order; the agreement with the PostgreSQL queue is argued from its query text above, not by a new integration test.
- The project-id key of the domain sort still uses `localeCompare`, while the queues order project ids in `"C"` collation; it matters only for projects whose oldest waiting tasks started at the same instant and is out of this change's scope (`design.md`).

## Remaining gates

- Independent review pass 1 (OpenCode CLI, `opencode-go/qwen3.8-max#medium`) and its record.
- Integration into dev by the coordinator (single pull request).
