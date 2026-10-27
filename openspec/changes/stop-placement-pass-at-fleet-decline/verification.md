# Verification

Date: 2026-10-27. The author's verification and checks, and review pass 1 with its fixes, are recorded below; review passes 2 and 3 and the archive checks are pending.

## Scope and source

Follow-up of the timing risk that review pass 3 of `advance-placement-rotation-cursor` recorded (L2; `openspec/changes/archive/2026-10-27-advance-placement-rotation-cursor/design.md:25`) and that `placement-backoff-preserves-rotation` (pull request #344) left out of scope as open point 2 (`openspec/changes/archive/2026-10-27-placement-backoff-preserves-rotation/design.md:17`): after a decline for lack of fleet capacity, a pass kept offering the later tasks of its read, so a slot that freed during the pass went to a later project, bypassing the rotation. The coordinator, Niki, assigned the task in a brief with the candidate fix, ending the pass at its first such decline, behind a decision gate: analysis first, implementation only if the candidate is sound and costs no throughput the contract forbids. It was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/stop-placement-pass-at-fleet-decline` on branch `stop-placement-pass-at-fleet-decline`.

- **Base revision:** `21f399a5` (`origin/dev`, merge of pull request #344).
- **Revision verified:** the records commit (`docs: record the verification of the stop-placement-pass-at-fleet-decline change`) on top of `bc02e042`: the contract, operational targets, spec delta, and proposal (`fa1de96b`), the tests (`ae9f5915`), the fix (`9086c800`), the design, tasks, and empty review records (`65072e2e`), and the comment of `FLEET_REASONS` (`bc02e042`). The checks ran on that working tree with this record, which the records commit holds with only the check results added.
- **Revision after review pass 1:** the records commit of pass 1 (`docs: record review pass 1 of the stop-placement-pass-at-fleet-decline change`) on top of the fixes `f4d82827` (spec delta, contract, proposal, design, tasks) and `c7d4f298` (test); the section Checks records its checks.
- **Scope:** capacity reservation contract sections 5 and 13, operational targets section 1, the `execution-placement` delta of "Project rotation", `PlacementService.#offer` and `#settle` in `@taskelith/control-plane`, the comment of `FLEET_REASONS` in `@taskelith/scheduling`, and the placement unit and PostgreSQL integration tests.
- **Out of scope:** the rotation cursor rule and `RotationCursor`, the backoff of a fleet capacity decline (#344), the classification `lacksFleetCapacity`, per-task requests, and a load test.

## Decision gate (phase 1)

The analysis is in `design.md`, Analysis. In short: the cursor ends where it ended before, at the project of the last placed offer before the decline, else of the last offer before it, else unchanged, so the next read offers the declined project's task before any task of a project after it in the rotation. A fleet capacity decline in G2 implies that no later task of the pass fits as long as the candidate workers, their eligibility, quarantine, and capacity do not change during the pass, because the candidates and their eligibility do not depend on the task, every request is `DEFAULT_ATTEMPT_REQUEST`, and the worker is checked before the quotas; capacity that becomes available during the pass is deferred to the next pass, which offers it in rotation order; own-reason declines do not end the pass. The contract bounds a pass by the batch and promises no offer after such a decline. The candidate passed the gate, and phase 2 implemented it.

## Author self-check

- **Contract first.** `fa1de96b` changed capacity reservation contract section 5, bullet "Bounded backoff" (`docs/contracts/capacity-reservation.md:90`), section 13, bullet "Fair order" (`:235`), the operational targets row "Control-plane background loops" (`docs/operational-targets.md:26`), and the spec delta, before the tests (`ae9f5915`) and the fix (`9086c800`).
- **Code agrees.** `#offer` (`apps/control-plane/src/application/placement-service.ts:91`) calls `cursor.ranOutOfCapacity()` and leaves its loop (`:101`, `:102`) at the first offer that `isFleetCapacityDecline` (`:276`) classifies; a store outage still returns from the loop (`:96`), and every other outcome settles and continues. `#settle` (`:113`) is no longer given a fleet capacity decline, so its early return for one was removed and the wait stays unchanged as #344 decided.
- **Adapters.** The rule is only in the service's loop; `InMemoryPlacementQueue` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:26`) and `PostgresPlacementQueue` (`packages/adapters/postgres/src/capacity-repositories.ts:159`) answer the same read as before and did not change. The unit tests run over the in-memory queue, the integration test over `PostgresDatabase`.
- **Other statements checked**, by `grep` for "during a pass", "mid-pass", "rest of the pass", "later offer", "later project", "tasks after it", "pass continues", "pass stops", "stops the pass", "ends the pass", and "first decline" over `docs/`, `openspec/specs/`, `apps/`, and `packages/`, outside archived changes and `dist/`, and by reading the comments of `PlacementService` and `fair-order.ts`:
  - Changed: contract sections 5 and 13 and the operational targets row above; the `execution-placement` requirement "Project rotation" in the delta (`openspec/changes/stop-placement-pass-at-fleet-decline/specs/execution-placement/spec.md:3`), which replaces the living requirement (`openspec/specs/execution-placement/spec.md:31`) only at archive, with its scenario "Capacity freed during a pass" (living `:50`), which expected a later project's placement in the same pass, "Many blocked projects", now blocked by the project's own limit, and the new scenarios "Fleet full for many passes" (`:26`, from review pass 1) and "Own decline during a pass"; the comments of `#offer` (`placement-service.ts:89`), `#settle` (`:111`), and `isOutage` (`:284`), which said a pass stops only when the store fails; the comment of `FLEET_REASONS` (`packages/modules/scheduling/src/domain/capacity-reasons.ts:32`).
  - Agree and unchanged: `RotationCursor` (`packages/modules/scheduling/src/domain/fair-order.ts:29`), whose offers after the first fleet capacity decline no longer occur; `execution-placement` "Waiting placements" (`spec.md:8`), "Placement transaction" (`:66`), "Placement backoff" (`:89`), "Backoff forgetting" (`:108`), and "Candidate order" (`:119`); the comments of `placeWaiting` and `#placeDue` (`placement-service.ts:60`, `:70`); `docs/architecture.md`, which states no placement pass rule. The archived records of `advance-placement-rotation-cursor` and `placement-backoff-preserves-rotation` describe the earlier state and are not edited.
- **Requirement length.** After review pass 1 the modified requirement is 498 characters; `MAX_REQUIREMENT_TEXT_LENGTH` of the pinned OpenSpec is 500. `openspec archive stop-placement-pass-at-fleet-decline --yes` in a scratch copy of `openspec/` at `c7d4f298`, then `openspec validate --specs --strict --no-interactive`: 69 passed, 0 failed; the archived requirement is 498 characters. Before pass 1 it was 500, with the same scratch result.
- New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes within `make verify`.
- Commit types are `docs`, `test`, and `chore`; only private workspace packages and documents change.

## Evidence check

- **Fails before the fix.** With the new tests (`ae9f5915`) and the sources of `21f399a5`, after `npm run build`, against the services of `bash scripts/services.sh run taskelith-stopfb`: `node --experimental-strip-types --test apps/control-plane/test/placement-service.test.ts apps/control-plane/test/placement.integration.test.ts`, 51 tests, 48 pass, 3 fail:
  - `a slot freed during a pass after a fleet capacity decline waits for the declined project` (`apps/control-plane/test/placement-service.test.ts:384` since review pass 1, `:377` at `ae9f5915`): actual `{ waiting: 4, placed: 1 }`, expected `{ waiting: 4, placed: 0 }`; the pass placed `task-c1` after declining `task-b1`.
  - `a full fleet costs one placement transaction per pass` (`:403`, `:396` at `ae9f5915`): actual `3`, expected `1`.
  - `a slot freed during a pass after a fleet capacity decline goes to the declined project` (`apps/control-plane/test/placement.integration.test.ts:197`): actual `{ waiting: 2, placed: 1 }`, expected `{ waiting: 2, placed: 0 }`; PostgreSQL placed `task-3` of `project-2` in the slot freed after `task-1` of `project-1` was declined.
  - The tests ran before the fix was written, so no stash was needed: the built sources were those of `21f399a5`. `a decline for a reason of its own does not end the pass` (`placement-service.test.ts:395`) passed before and after; it guards that own declines keep the pass going.
- **Passes after the fix.** At `9086c800`, the same two files with `packages/modules/scheduling/test/*.test.ts`: 167 tests, 167 pass.
- **Replaced test.** `a slot freed after a capacity decline does not move the cursor past it` expected the freed slot to go to `task-d1` in the same pass, the behavior this change removes; the test at `placement-service.test.ts:384` replaces it with the same fleet and expects the rotation order `task-a1`, `task-b1`, `task-c1`, `task-d1`, `task-e1`.
- **Review pass 1 test.** `a fleet that stays full keeps the cursor until capacity returns` (`placement-service.test.ts:369`), from `c7d4f298`, guards the scenario "Fleet full for many passes" with 120 projects: three full passes each read 100 tasks and place none, then the slot goes to the project after the cursor. It passes after the fix and, with `placement-service.ts` of `21f399a5`, before it, which shows that the full-fleet behavior predates this change.
- **Citations.** Every file, line, and commit cited above was checked against the files of the records commit of review pass 1.

## Checks

- `npm run openspec -- validate stop-placement-pass-at-fleet-decline --strict`: valid.
- Scratch archive, as in the self-check: 69 specs passed, 0 failed.
- `make findings ARGS="validate"`: every findings file is valid, 22 files; every pass summary file is valid, 2 files.
- `make verify` on the working tree of `65072e2e`: exit 0; 2138 tests, 2091 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.20%, functions 98.92%; every active OpenSpec change archives into strictly valid specs; `validate --all --strict` 70 passed. The new unit tests and the PostgreSQL test passed in it.
- `make verify` on the working tree of `bc02e042` with this record: exit 0; 2138 tests, 2091 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.18%, functions 98.92%; every active OpenSpec change archives into strictly valid specs; `validate --all --strict` 70 passed.
- After review pass 1, on the working tree of `c7d4f298` with this record: `npm run openspec -- validate stop-placement-pass-at-fleet-decline --strict`: valid; the scratch archive as in the self-check: 69 specs passed, 0 failed; `make findings ARGS="validate"`: every findings file is valid, 22 files; every pass summary file is valid, 2 files; `make verify`: exit 0; 2138 tests, 2091 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.19%, functions 98.92%; every active OpenSpec change archives into strictly valid specs; `validate --all --strict` 70 passed. The records commit of pass 1 holds this record with only these results added.

Environment: Linux (`Linux 7.0.0-38-generic`, x86_64), Node.js 24.22.1 from `.nvmrc`, Docker test services started by `make verify` and `scripts/services.sh`, `TMPDIR` set to a directory on disk outside `/tmp` (`~/.cache/taskelith-tmp`) because of the stray `/tmp/.git` directory on this host.

## Independent review

The coordinator assigned reviewer A, OpenCode, model `opencode-go/kimi-k3.1-pro`, variant `high`, for passes 1 and 3, and reviewer B, Claude Code, model `claude-opus-5-5`, effort `high`, for pass 2. Each pass that runs to a report adds its section here with its invocation, revision, model confirmation, session, snapshot, and findings, and a line in `passes.jsonl`.

### Review pass 1

- **Reviewer:** A, OpenCode CLI, model `opencode-go/kimi-k3.1-pro`, variant `high`, agent `reviewer`, session `ses_e829d343fffey5N1BJbRlYhcC3`.
- **Revision reviewed:** `a12f4db2`, from 2026-10-27T12:43:09Z to 12:46:32Z.
- **Invocation:** `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title stop-placement-pass-at-fleet-decline "$(cat <prompt-file>)" < /dev/null > <log>`, with the prompt and the log outside the worktree.
- **Model confirmation:** the stored assistant messages record provider `opencode-go`, model `kimi-k3.1-pro`, variant `high`, agent `reviewer`.
- **Snapshot:** before and after the pass `d6086d3e465829abacc3e40a27cdcb7374164f91785e843128a0ee2a96d067f4`, identical.
- **Result:** Critical 0, High 0, Medium 1, Low 3. The reviewer judged the stop and the cursor update correct, and `RotationCursor.ranOutOfCapacity` still meaningful as a domain guard. The file lines below are those of `a12f4db2`.
- **M1, spec-wording** (`specs/execution-placement/spec.md:4`): "every project with a waiting task is read within a bounded number of passes" fails when the fleet stays full: the read takes the first `PLACEMENT_BATCH` tasks in rotation order from the cursor, the pass stops at its first offer, the cursor stays, and a project beyond the batch is never read. Verified against `#placeDue`, `#offer`, `RotationCursor`, and both queues. It predates the change: at `21f399a5` the cursor also ignored the offers after the first fleet capacity decline, and the living requirement made the same claim; the new test passes there too, so the finding names `missedBy` `integration`. Fixed in `f4d82827`: the requirement bounds the read while offers move the cursor, the scenario "Fleet full for many passes" states that a full fleet keeps the cursor and the rotation resumes from it, contract section 13 says the same, and `design.md` records it under Analysis; test in `c7d4f298`.
- **L1, docs** (`docs/contracts/capacity-reservation.md:90`, `design.md:8`, this record's decision gate): the claim that no later task fits unless capacity frees was too strong. Fixed in `f4d82827` and this record: it holds as long as the candidate workers, their eligibility, quarantine, and capacity do not change during the pass, and newly available capacity is deferred to the next pass.
- **L2, docs** (`design.md:10`, `:27`, `proposal.md:22`, this record's limitations): "placed by the next pass" and "up to 5 s later" are not guaranteed. Fixed in `f4d82827` and this record: capacity is offered in the next pass, in rotation order; with one replica and no intervening change the next pass starts 5 s after this one ends, as `runPeriodically` waits the interval after each pass, and no hard bound is claimed.
- **L3, naming** (`apps/control-plane/test/placement-service.test.ts:363`): the test `a decline after the fleet ran out of capacity does not move the cursor` no longer reached its scenario. Removed in `c7d4f298`; the `RotationCursor` test at `packages/modules/scheduling/test/resource-admission.test.ts:259` covers the guard, and the reachable test `a fleet that stays full keeps the cursor until capacity returns` takes its place.

### Review pass 2

Not run yet; reviewer B checks the resolutions of pass 1.

### Review pass 3

Not run yet; reviewer A runs it only if pass 2 has findings above Low.

## Limitations

- No load test: the cost of a full fleet, one placement transaction declined for lack of fleet capacity per pass, follows from the code and the unit test `a full fleet costs one placement transaction per pass`, not from a measurement (`design.md`, Known limit).
- The rule relies on all requests being equal and eligibility not depending on the task, as in G2; per-task requests or hard controls must revisit it (`design.md`, Risks).
- Capacity that frees during a pass is offered in the next pass, in rotation order. With one replica and no intervening change, that pass starts 5 s after this one ends (`runPeriodically`, `packages/adapters/node-observability/src/periodic-sampler.ts:7`); another replica or a task earlier in the rotation may take the slot first, so no hard time bound holds.
- A fleet that stays full keeps the cursor, so the passes read the same first `PLACEMENT_BATCH` tasks and no project beyond them is read until capacity returns; nothing is placed meanwhile, and the rotation then resumes from the cursor. This predates the change (`design.md`, Analysis, "A fleet that stays full"; review pass 1, M1).
- Since a pass ends at its first fleet capacity decline, no service test reaches an offer after it; `RotationCursor`'s own test (`packages/modules/scheduling/test/resource-admission.test.ts:259`) covers that guard. Review pass 1 removed the service test that no longer reached it (L3).
- The multi-replica variant of L2 (`advance-placement-rotation-cursor`, design, Risks) was reasoned about, not tested. With one replica and no intervening change, a slot that frees during a pass is offered in the next pass, in rotation order, and a placement moves the cursor, so the rotation reaches every project while offers move it. When a second scheduler replica takes every slot that frees between this replica's passes, this replica places nothing and keeps its cursor, and the order of placements is that of the other replica's passes.

## Remaining gates

- Independent review: pass 2 by reviewer B, and pass 3 by reviewer A if needed, with their records.
- Archive under worker step 7, with the checks of the archived tree.
- Integration into dev by the coordinator (single pull request)
