# Verification

Date: 2026-10-27. The author's verification and checks are recorded below; the independent review passes and the archive checks are pending.

## Scope and source

Follow-up of the timing risk that review pass 3 of `advance-placement-rotation-cursor` recorded (L2; `openspec/changes/archive/2026-10-27-advance-placement-rotation-cursor/design.md:25`) and that `placement-backoff-preserves-rotation` (pull request #344) left out of scope as open point 2 (`openspec/changes/archive/2026-10-27-placement-backoff-preserves-rotation/design.md:17`): after a decline for lack of fleet capacity, a pass kept offering the later tasks of its read, so a slot that freed during the pass went to a later project, bypassing the rotation. The coordinator, Niki, assigned the task in a brief with the candidate fix, ending the pass at its first such decline, behind a decision gate: analysis first, implementation only if the candidate is sound and costs no throughput the contract forbids. It was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/stop-placement-pass-at-fleet-decline` on branch `stop-placement-pass-at-fleet-decline`.

- **Base revision:** `21f399a5` (`origin/dev`, merge of pull request #344).
- **Revision verified:** the records commit (`docs: record the verification of the stop-placement-pass-at-fleet-decline change`) on top of `bc02e042`: the contract, operational targets, spec delta, and proposal (`fa1de96b`), the tests (`ae9f5915`), the fix (`9086c800`), the design, tasks, and empty review records (`65072e2e`), and the comment of `FLEET_REASONS` (`bc02e042`). The checks ran on that working tree with this record, which the records commit holds with only the check results added.
- **Scope:** capacity reservation contract sections 5 and 13, operational targets section 1, the `execution-placement` delta of "Project rotation", `PlacementService.#offer` and `#settle` in `@taskelith/control-plane`, the comment of `FLEET_REASONS` in `@taskelith/scheduling`, and the placement unit and PostgreSQL integration tests.
- **Out of scope:** the rotation cursor rule and `RotationCursor`, the backoff of a fleet capacity decline (#344), the classification `lacksFleetCapacity`, per-task requests, and a load test.

## Decision gate (phase 1)

The analysis is in `design.md`, Analysis. In short: the cursor ends where it ended before, at the project of the last placed offer before the decline, else of the last offer before it, else unchanged, so the next read offers the declined project's task before any task of a project after it in the rotation. A fleet capacity decline in G2 implies that no later task of the pass fits unless capacity frees during the pass, because the candidates and their eligibility do not depend on the task, every request is `DEFAULT_ATTEMPT_REQUEST`, and the worker is checked before the quotas; own-reason declines do not end the pass. The contract bounds a pass by the batch and promises no offer after such a decline. The candidate passed the gate, and phase 2 implemented it.

## Author self-check

- **Contract first.** `fa1de96b` changed capacity reservation contract section 5, bullet "Bounded backoff" (`docs/contracts/capacity-reservation.md:90`), section 13, bullet "Fair order" (`:235`), the operational targets row "Control-plane background loops" (`docs/operational-targets.md:26`), and the spec delta, before the tests (`ae9f5915`) and the fix (`9086c800`).
- **Code agrees.** `#offer` (`apps/control-plane/src/application/placement-service.ts:91`) calls `cursor.ranOutOfCapacity()` and leaves its loop (`:101`, `:102`) at the first offer that `isFleetCapacityDecline` (`:276`) classifies; a store outage still returns from the loop (`:96`), and every other outcome settles and continues. `#settle` (`:113`) is no longer given a fleet capacity decline, so its early return for one was removed and the wait stays unchanged as #344 decided.
- **Adapters.** The rule is only in the service's loop; `InMemoryPlacementQueue` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:26`) and `PostgresPlacementQueue` (`packages/adapters/postgres/src/capacity-repositories.ts:159`) answer the same read as before and did not change. The unit tests run over the in-memory queue, the integration test over `PostgresDatabase`.
- **Other statements checked**, by `grep` for "during a pass", "mid-pass", "rest of the pass", "later offer", "later project", "tasks after it", "pass continues", "pass stops", "stops the pass", "ends the pass", and "first decline" over `docs/`, `openspec/specs/`, `apps/`, and `packages/`, outside archived changes and `dist/`, and by reading the comments of `PlacementService` and `fair-order.ts`:
  - Changed: contract sections 5 and 13 and the operational targets row above; the `execution-placement` requirement "Project rotation" in the delta (`openspec/changes/stop-placement-pass-at-fleet-decline/specs/execution-placement/spec.md:3`), which replaces the living requirement (`openspec/specs/execution-placement/spec.md:31`) only at archive, with its scenario "Capacity freed during a pass" (living `:50`), which expected a later project's placement in the same pass, "Many blocked projects", now blocked by the project's own limit, and the new scenario "Own decline during a pass"; the comments of `#offer` (`placement-service.ts:89`), `#settle` (`:111`), and `isOutage` (`:284`), which said a pass stops only when the store fails; the comment of `FLEET_REASONS` (`packages/modules/scheduling/src/domain/capacity-reasons.ts:32`).
  - Agree and unchanged: `RotationCursor` (`packages/modules/scheduling/src/domain/fair-order.ts:29`), whose offers after the first fleet capacity decline no longer occur; `execution-placement` "Waiting placements" (`spec.md:8`), "Placement transaction" (`:66`), "Placement backoff" (`:89`), "Backoff forgetting" (`:108`), and "Candidate order" (`:119`); the comments of `placeWaiting` and `#placeDue` (`placement-service.ts:60`, `:70`); `docs/architecture.md`, which states no placement pass rule. The archived records of `advance-placement-rotation-cursor` and `placement-backoff-preserves-rotation` describe the earlier state and are not edited.
- **Requirement length.** The modified requirement is 500 characters, the most that `MAX_REQUIREMENT_TEXT_LENGTH` (500) of the pinned OpenSpec allows. `openspec archive stop-placement-pass-at-fleet-decline --yes` in a scratch copy of `openspec/`, then `openspec validate --specs --strict --no-interactive`: 69 passed, 0 failed; the archived requirement is 500 characters.
- New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes within `make verify`.
- Commit types are `docs`, `test`, and `chore`; only private workspace packages and documents change.

## Evidence check

- **Fails before the fix.** With the new tests (`ae9f5915`) and the sources of `21f399a5`, after `npm run build`, against the services of `bash scripts/services.sh run taskelith-stopfb`: `node --experimental-strip-types --test apps/control-plane/test/placement-service.test.ts apps/control-plane/test/placement.integration.test.ts`, 51 tests, 48 pass, 3 fail:
  - `a slot freed during a pass after a fleet capacity decline waits for the declined project` (`apps/control-plane/test/placement-service.test.ts:377`): actual `{ waiting: 4, placed: 1 }`, expected `{ waiting: 4, placed: 0 }`; the pass placed `task-c1` after declining `task-b1`.
  - `a full fleet costs one placement transaction per pass` (`:396`): actual `3`, expected `1`.
  - `a slot freed during a pass after a fleet capacity decline goes to the declined project` (`apps/control-plane/test/placement.integration.test.ts:197`): actual `{ waiting: 2, placed: 1 }`, expected `{ waiting: 2, placed: 0 }`; PostgreSQL placed `task-3` of `project-2` in the slot freed after `task-1` of `project-1` was declined.
  - The tests ran before the fix was written, so no stash was needed: the built sources were those of `21f399a5`. `a decline for a reason of its own does not end the pass` (`placement-service.test.ts:388`) passed before and after; it guards that own declines keep the pass going.
- **Passes after the fix.** At `9086c800`, the same two files with `packages/modules/scheduling/test/*.test.ts`: 167 tests, 167 pass.
- **Replaced test.** `a slot freed after a capacity decline does not move the cursor past it` expected the freed slot to go to `task-d1` in the same pass, the behavior this change removes; the test at `placement-service.test.ts:377` replaces it with the same fleet and expects the rotation order `task-a1`, `task-b1`, `task-c1`, `task-d1`, `task-e1`.
- **Citations.** Every file, line, and commit cited above was checked against the files of the records commit.

## Checks

- `npm run openspec -- validate stop-placement-pass-at-fleet-decline --strict`: valid.
- Scratch archive, as in the self-check: 69 specs passed, 0 failed.
- `make findings ARGS="validate"`: every findings file is valid, 22 files; every pass summary file is valid, 2 files.
- `make verify` on the working tree of `65072e2e`: exit 0; 2138 tests, 2091 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.20%, functions 98.92%; every active OpenSpec change archives into strictly valid specs; `validate --all --strict` 70 passed. The new unit tests and the PostgreSQL test passed in it.
- `make verify` on the working tree of `bc02e042` with this record: exit 0; 2138 tests, 2091 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.18%, functions 98.92%; every active OpenSpec change archives into strictly valid specs; `validate --all --strict` 70 passed.

Environment: Linux (`Linux 7.0.0-38-generic`, x86_64), Node.js 24.22.1 from `.nvmrc`, Docker test services started by `make verify` and `scripts/services.sh`, `TMPDIR` set to a directory on disk outside `/tmp` (`~/.cache/taskelith-tmp`) because of the stray `/tmp/.git` directory on this host.

## Independent review

Not yet run. The coordinator assigned reviewer A, OpenCode, model `opencode-go/kimi-k3.1-pro`, variant `high`, for passes 1 and 3, and reviewer B, Claude Code, model `claude-opus-5-5`, effort `high`, for pass 2. Each pass that runs to a report adds its section here with its invocation, revision, model confirmation, session, snapshot, and findings, and a line in `passes.jsonl`.

### Review pass 1

Pending (reviewer A).

### Review pass 2

Pending (reviewer B).

### Review pass 3

Pending (reviewer A), only if pass 2 has findings above Low.

## Limitations

- No load test: the cost of a full fleet, one placement transaction declined for lack of fleet capacity per pass, follows from the code and the unit test `a full fleet costs one placement transaction per pass`, not from a measurement (`design.md`, Known limit).
- The rule relies on all requests being equal and eligibility not depending on the task, as in G2; per-task requests or hard controls must revisit it (`design.md`, Risks).
- A slot that frees during a pass is placed by the next pass, up to 5 s later.
- The unit test `a decline after the fleet ran out of capacity does not move the cursor` (`placement-service.test.ts:363`) passes before and after; since a pass now ends at the decline, it no longer reaches a decline after it, and `RotationCursor`'s own test (`packages/modules/scheduling/test/resource-admission.test.ts:262`) covers that guard.
- The multi-replica variant of L2 (`advance-placement-rotation-cursor`, design, Risks) was reasoned about, not tested. With one replica, a slot that frees during a pass is taken by the next pass's first offer, so the cursor moves and the rotation reaches every project. When a second scheduler replica takes every slot that frees between this replica's passes, this replica places nothing and keeps its cursor, and the order of placements is that of the other replica's passes.

## Remaining gates

- Independent review: pass 1 by reviewer A, pass 2 by reviewer B, and pass 3 by reviewer A if needed, with their records.
- Archive under worker step 7, with the checks of the archived tree.
- Integration into dev by the coordinator (single pull request)
