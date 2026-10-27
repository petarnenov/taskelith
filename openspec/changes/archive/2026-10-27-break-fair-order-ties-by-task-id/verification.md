# Verification: break-fair-order-ties-by-task-id

## Scope and source

Assigned on 2026-10-27 by the coordinator (Niki); the gap was found by the worker of the change `stabilize-placement-fair-order-test`. `fairPlacementOrder` in `packages/modules/scheduling/src/domain/fair-order.ts` had no final tie-break and relied on a stable sort over the order the queue returned. Base revision: `33d341a9` on `dev`. Prepared in the git worktree `../taskelith-worktrees/break-fair-order-ties-by-task-id` on branch `break-fair-order-ties-by-task-id`. Scope: `fair-order.ts`, two unit tests in `packages/modules/scheduling/test/resource-admission.test.ts`, the `execution-placement` requirement "Waiting placements", and this change; after review pass 1, as the coordinator decided, also the project-id key, the move of `byCodeUnits` into `domain/code-unit-order.ts` with its four in-memory adapter imports, and item 18 "Fair order" of `docs/contracts/capacity-reservation.md`. Commit types `test`, `chore`, and `docs`; `@taskelith/scheduling` is private.

## Revision

- `9bedc1d5` `test: expect task id order for equal waiting placements` (the failing test alone).
- `a89f7102` `chore: break fair placement order ties by task id` (the fix).
- `f0cdc2b2` `docs: specify the task id tie-break of the fair placement order` (this change and the spec delta).
- `a1e6fca9` `docs: record the verification of the fair order tie-break change` (this record; the revision review pass 1 read).
- Pass 1 fixes: `e00223e8` `test: expect project id order for equal oldest waiting placements` (the failing test alone), `0d22bbc1` `chore: order fair placement project ties by code unit`, `182a38d0` `chore: share the code-unit order from the scheduling domain`, `ea15330c` `docs: state the fair order tie-breaks in the capacity contract`, `b92836ae` `docs: apply review pass 1 to the fair order tie-break change`, and the commit that records these results.

## Environment

Ubuntu Linux 6.8.0-147-generic x86_64 (host `hpz600`), Node.js v24.22.0 through `nvm use`, Docker 27.3.1, PostgreSQL 18.6 in Docker as `make verify` starts it.

## Author self-check

- **SQL and domain order agree within a project.** `PostgresPlacementQueue.waiting` (`packages/adapters/postgres/src/capacity-repositories.ts:159-171`) ranks each project's tasks by `tasks.placement_waiting_since, tasks.id COLLATE "C"`, and `InMemoryPlacementQueue` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:69-72`) by waiting time, project id, and `byCodeUnits` on the task id. `fairPlacementOrder` now sorts by waiting time, then project id and task id, both in code-unit order, so within a project its order is that of both queues for any input order, and projects whose oldest tasks waited equally long come in the queues' `project_id COLLATE "C"` order. The earlier keys and the round-robin across projects are unchanged.
- **Collation.** `TaskId` and `ProjectId` are created only by `parseIdentifier` (`packages/kernel/src/identifier.ts:11-14`), which admits only `[\x21-\x7e]`, so every id is ASCII. For ASCII, UTF-8 bytes (`"C"`) and UTF-16 code units (JavaScript `<`) have the same values and order. `localeCompare` would differ: it orders `task-a` before `task-B`, and the new test uses those ids so that it would fail on it.
- **Spec.** The living requirement "Waiting placements" did not state the tie-breaks; the `MODIFIED` delta copies its text and both scenarios in full, adds the tie-breaks to its last sentence, and adds the scenarios "Equal waiting times" and "Equal oldest waiting times across projects". The requirement is about 440 characters.
- **Comments.** The one new comment (`domain/code-unit-order.ts:1`) is one line of 67 characters; the moved comparator's old comment was removed with it.
- **No behavior change from the move.** `byCodeUnits` keeps its body; `npm run check:boundaries` passed, and the 104 scheduling tests passed after the move.
- Evidence check: no external link; the results below come from the commands listed.

## Checks

- Failing before, at `9bedc1d5` (test only): `npm run build`, then `node --experimental-strip-types --test --test-name-pattern="waiting placements" packages/modules/scheduling/test/resource-admission.test.ts`: `✖ waiting placements with equal waiting times follow task id order`, actual `[ 'task-B', 'task-c', 'task-a', 'task-A' ]`, expected `[ 'task-A', 'task-c', 'task-B', 'task-a' ]`; the existing test "waiting placements alternate between projects, oldest first in each" passed.
- Passing after, at `a89f7102`: the same commands; both tests pass.
- `npm run openspec -- validate break-fair-order-ties-by-task-id --strict`: `Change 'break-fair-order-ties-by-task-id' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make findings ARGS="validate"`: `Every findings file is valid: 5 file(s).`, before review and again with the three pass 1 lines.
- Pass 1, failing before, at `e00223e8` (test only, on the build of that tree): the test "projects whose oldest placements wait equally long follow project id order" failed with actual `[ 'task-1', 'task-2' ]`, expected `[ 'task-2', 'task-1' ]`; the two earlier fair order tests passed.
- Pass 1, passing after, at `0d22bbc1` and after: all three fair order tests pass; `node --experimental-strip-types --test packages/modules/scheduling/test/*.test.ts`: 104 tests, 104 passed.
- After the pass 1 fixes, `npm run openspec -- validate break-fair-order-ties-by-task-id --strict`: valid; `npm run verify:comments`: within the rule.
- After the pass 1 fixes, `make verify` passed (exit 0) on `b92836ae`: 2,023 tests, 1,977 passed, 0 failed, 46 skipped; coverage 99.19 % lines, 91.87 % branches, 98.80 % functions; strict OpenSpec validation 70 passed, 0 failed; findings validation, archive dry run, and package verification passed.
- Before review, `make verify` passed (exit 0) on `f0cdc2b2`: 2,022 tests, 1,976 passed, 0 failed, 46 skipped; coverage 99.18 % lines, 91.85 % branches, 98.80 % functions; strict OpenSpec validation 70 passed, 0 failed; archive dry run (`Every active OpenSpec change archives into strictly valid specs.`) and package verification passed.

## Independent review

### Pass 1

- **OpenCode CLI, model `opencode-go/qwen3.8-max`, variant `medium`, agent `reviewer`, session `ses_e83e7b61effeASBme1Dnw3tReZ`, revision `a1e6fca9` (diff `33d341a9..a1e6fca9`), run by the coordinator.** Invocation: `opencode run --standalone --agent reviewer -m 'opencode-go/qwen3.8-max#medium' --format json --title break-fair-order-ties-by-task-id "$(cat <prompt-file>)" < /dev/null > <log>`. The snapshot was `4f6945ecf6bcc5e70cb11888ed5462ebbe688f28d31b54ed7aa9ce519237c441` before and after the pass. The reviewer's shell allowlist refused `node --test`, so it checked the test's failing-before and passing-after outcome analytically and against this record. It confirmed the collation argument for task ids, the kept keys, the test, the instant precision, the boundaries, the delta, and the comment rule.
- Findings: 0 Critical, 0 High, 1 Medium, 2 Low. The coordinator decided to fix all three in this change; pass 2 confirmed the fixes:
  1. Medium (`fair-order.ts`, contract drift): the project-id key used `localeCompare` while both queues use `"C"`. Fixed in `0d22bbc1` with the failing-before test `e00223e8`; the delta, proposal, and design state it, and the out-of-scope note is removed.
  2. Low (`fair-order.ts` and `in-memory-capacity.ts`): `byCodeUnits` was duplicated. Fixed in `182a38d0`: one exported helper in `domain/code-unit-order.ts`, imported by the domain and the in-memory adapters.
  3. Low (`docs/contracts/capacity-reservation.md:235`): the contract did not state the tie-breaks. Fixed in `ea15330c`; the proposal's impact no longer says "no contract change".

### Pass 2

- **OpenCode CLI, model `opencode-go/qwen3.8-max`, variant `medium`, agent `reviewer`, session `ses_e83db1221ffec8yyfuGP06rF6g`, revision `e296c501` (diff `33d341a9..e296c501`, including the pass 1 fixes `a1e6fca9..e296c501`), run by the coordinator.** Same invocation as pass 1. The snapshot was `df7f447415f242bb8fc480f68db0276121a389fa3072901c983f4248d4a2493a` before and after the pass. The shell was again denied, so the reviewer checked the tests analytically and against this record.
- It confirmed M1, L2, and L3 as resolved, and in a full re-review the agreement of the domain, SQL, and in-memory orders for every valid id, the kept keys, the failing-before tests, the agreement of code, contract, and delta, the boundaries, and the comment rule.
- Findings: 0 Critical, 0 High, 0 Medium, 0 Low. The three pass 1 lines of `findings.jsonl` are now `fixed`.

## Limitations

- The new test covers the domain order; the agreement with the PostgreSQL queue is argued from its query text above, not by a new integration test.
- Review passes 1 and 2 could not run tests; their outcome on the tests is analytical.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

## Archive checks

Worker step 7, after review pass 2. The checked state is the tree of the archive commit, which is the working tree these checks ran on after `npm run openspec -- archive break-fair-order-ties-by-task-id --yes` (base `33d341a9`; `origin/dev` had not moved).

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `make verify`: exit 0; 2,023 tests, 1,977 passed, 0 failed, 46 skipped; coverage 99.19 % lines, 91.88 % branches, 98.80 % functions; strict OpenSpec validation 69 passed, 0 failed; findings validation, archive dry run, and package verification passed.
- `npm run openspec -- validate --archived --no-interactive`: the line of `change/2026-10-27-break-fair-order-ties-by-task-id` passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `execution-placement`, requirement "Waiting placements": the tie-break sentence and the scenarios "Equal waiting times" and "Equal oldest waiting times across projects", as intended.
- The moved change has its `findings.jsonl` with the three pass 1 lines, and `make findings ARGS="validate"` passed.
