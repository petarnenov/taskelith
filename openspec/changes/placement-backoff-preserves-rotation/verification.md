# Verification

Date: 2026-10-27. The author's verification is recorded below; the independent review and the archive checks are pending.

## Scope and source

Follow-up `placement-backoff-preserves-rotation`, recorded by review pass 2 (finding M1) of `advance-placement-rotation-cursor` (pull requests #337 and #338): a decline for lack of fleet capacity backed the task off by 5 s to 60 s with jitter while the pass runs every 5 s, so a freed slot went to the first task whose backoff had ended instead of following the rotation cursor. The owner's delegate chose option (a), no per-task backoff after a decline for lack of fleet capacity and a backoff only for the task's own reasons (away decision `20261027T085757Z-opencode-1447`). The coordinator, Niki, assigned the task in a brief; it was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/placement-backoff-preserves-rotation` on branch `placement-backoff-preserves-rotation`.

- **Base revision:** `bd6108d4` (`origin/dev`, merge of pull request #342).
- **Revision verified:** the records commit (`docs: record the verification of the placement-backoff-preserves-rotation change`) on top of `43b914e7`: the contract, spec delta, and proposal (`7130f201`, `ea49eabc`, `43b914e7`), the tests (`fbdcdbdf`), the fix (`41ef68fb`), and the design, tasks, empty findings record, and this record. The checks ran on the working tree of `43b914e7` with those records, which the records commit holds with only the check results added.
- **Scope:** capacity reservation contract sections 5 and 13, the operational targets section 1, the `execution-placement` delta, `PlacementService` in `@taskelith/control-plane`, two comments in `@taskelith/scheduling`, and the placement unit and PostgreSQL integration tests.
- **Out of scope:** ending a pass at its first decline for lack of fleet capacity (design, Out of scope); the retry backoff of an automatic retry; the rotation cursor rule.

## Author self-check

- **Contract first.** `7130f201` changed capacity reservation contract section 5, bullet "Bounded backoff" (`docs/contracts/capacity-reservation.md:90`), section 13, bullet "Backoff" (`:236`), the operational targets rows "Placement retry and wait backoff" (`docs/operational-targets.md:22`) and "Control-plane background loops" (`:26`), and the spec delta, before the code (`41ef68fb`); `ea49eabc` renamed the row, and `43b914e7` replaced the promise of an offer in the next pass, which the batch limit can break, by a kept wait and place in the rotation. Section 5 states that the placement batch bounds the transactions a full fleet costs per pass.
- **One classification.** A decline for lack of fleet capacity is a failed placement whose reason `lacksFleetCapacity` (`packages/modules/scheduling/src/domain/capacity-reasons.ts:58`) finds in `FLEET_REASONS` (`:33`): `quarantined`, `worker-not-eligible`, `worker-capacity-exhausted`, `no-candidate`. The service names it once, `isFleetCapacityDecline` (`apps/control-plane/src/application/placement-service.ts:276`), and both the cursor (`#offer`, `:100`) and the backoff (`#settle`, `:113`) use it; no other list exists. Any other decline (quotas, provider concurrency, `control-not-enforceable`, `delegation-awaiting-capacity`, or a failure without a reason) is the task's own and backs off as before.
- **Code agrees.** `#settle` (`placement-service.ts:112`) returns at once on such a decline, counting no failure and forgetting nothing, so "Backoff forgetting" holds. A pass without a candidate (`:83`) settles nothing now; its loop over `NO_CANDIDATE` and that constant were removed, since a `no-candidate` outcome is such a decline.
- **Adapters.** The backoff lives only in the service's `RetrySchedule` and reaches the stores as the `excluding` argument of `PlacementQueue.waiting`, which `InMemoryPlacementQueue` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:26`) and `PostgresPlacementQueue` (`packages/adapters/postgres/src/capacity-repositories.ts:159`) both honour; reasons come from `decidePlacement` (`packages/modules/scheduling/src/domain/placement-decision.ts:62`) for either store. No adapter changed; both are covered by the same fifty-to-one case.
- **Other statements checked**, by `grep` for "backoff", "back off", "backs off", "capacity wait", "waiting for capacity", "no candidate accepts", and "lack of fleet capacity" over `docs/`, `openspec/specs/`, `apps/`, and `packages/`, outside `docs/qualification/`, archived changes, and `dist/`:
  - Changed: the contract and operational-targets lines above; the `execution-placement` requirement "Placement backoff" (`openspec/specs/execution-placement/spec.md:89`); the comments of `PLACEMENT_BACKOFF_INITIAL_MILLISECONDS` (`packages/modules/scheduling/src/domain/capacity-limits.ts:26`), which said capacity waits back off, and of `FLEET_REASONS` (`capacity-reasons.ts:31`); the comments of `placeWaiting` and `#settle`.
  - Agree and unchanged: contract section 5 "Fair admission" and section 13 "Fair order" (`capacity-reservation.md:235`), whose "backoff" among a project's own limits is the retry backoff; `execution-placement` "Waiting placements" (`spec.md:8`), "Project rotation" (`:31`), "Placement transaction" and its scenario "No capacity" (`:66`), and "Backoff forgetting" (`:104`); `observation-consumption` "Retry backoff" (`openspec/specs/observation-consumption/spec.md:133`); `capacity-reservation` "Bounded automatic retry" (`openspec/specs/capacity-reservation/spec.md:98`); `docs/architecture.md:409`; `RetrySchedule` (`apps/control-plane/src/application/retry-schedule.ts`) and `placementBackoff`. The other backoffs (`postgres-state`, `nats-transport`, `launch-authorization`, `worker-runtime`, `worker-journal.md:118`) concern other loops.
- **Requirement length.** The modified requirement is 499 characters, within the 500 of `MAX_REQUIREMENT_TEXT_LENGTH` of the pinned OpenSpec. `openspec archive placement-backoff-preserves-rotation --yes` in a scratch copy of `openspec/`, then `openspec validate --specs --strict`: 69 passed, 0 failed, at `43b914e7`.
- New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes within `make verify`.
- Commit types are `docs`, `test`, and `chore`; only private workspace packages and documents change.

## Evidence check

- **Fails before the fix.** With the new tests (`fbdcdbdf`) and the sources of `bd6108d4`, after `npm run build`:
  - `node --experimental-strip-types --test apps/control-plane/test/placement-service.test.ts`: 24 tests, 21 pass, 3 fail. `a freed slot follows the rotation after a fleet capacity decline, not a backoff` (`apps/control-plane/test/placement-service.test.ts:391`) failed with actual `[ 'task-big-01', 'task-big-02', 'task-small' ]`, expected `[ 'task-big-01', 'task-small', 'task-big-02' ]`: the large project took the freed slot while the small project's task backed off. `a decline for a reason of its own backs the task off, a fleet capacity decline does not` (`:402`) failed with actual `[]`, expected `[ 'task-b1' ]`; `without a candidate no transaction is opened and the tasks do not back off` (`:109`) failed with actual `{ waiting: 0, placed: 0 }`, expected `{ waiting: 1, placed: 1 }`.
  - Against PostgreSQL (`make services-up`), `node --experimental-strip-types --test apps/control-plane/test/placement.integration.test.ts`: 23 tests, 21 pass, 2 fail. `a slot freed after a fleet capacity decline goes to the next project, not the larger backlog` (`apps/control-plane/test/placement.integration.test.ts:181`) failed with actual `[ 'task-a01', 'task-a02' ]`, expected `[ 'task-a01', 'task-b' ]`; `without capacity nothing is written and the task still waits` (`:171`) failed with message `it does not back off`, actual `{ waiting: 0, placed: 0 }`, expected `{ waiting: 1, placed: 0 }`.
  - The tests were run before the fix was written, so no stash was needed: the built sources were those of `bd6108d4`.
- **Passes after the fix.** The same files at `41ef68fb`: 24 of 24 and 23 of 23 pass.
- **Fixture.** Both fifty-to-one tests draw a long jitter (0.9) for the first decline, the small project's task, and none for the rest, so before the fix its backoff outlasts the large project's; after the fix no decline draws.
- **Citations.** Every file and line cited above was checked against the files of the records commit.

## Checks

- `npm run openspec -- validate placement-backoff-preserves-rotation --strict`: valid.
- `make findings ARGS="validate"`: every findings file is valid, 20 files.
- `make findings ARGS="checklist --capability execution-placement --files apps/control-plane/**"`: the most frequent categories are docs, missing-fail-before-test, contract-drift, naming, and spec-wording; the self-check, the evidence check, and the limitations above address them.
- `make verify`: exit 0; 2114 tests, 2067 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.17%, functions 98.95%; every active OpenSpec change archives into strictly valid specs, `validate --all --strict` 70 passed. The new unit tests and both PostgreSQL tests above passed in it.

Environment: Linux (`Linux 7.0.0-38-generic`, x86_64), Node from `.nvmrc`, Docker test services started by the make targets, `TMPDIR` set to a directory on disk outside `/tmp` (`~/.cache/taskelith-tmp`) because of the stray `/tmp/.git` directory on this host.

## Independent review

### Review pass 1

- **Reviewer:** A, OpenCode CLI, model `opencode-go/qwen3.8-max`, variant `medium`. Pending.
- **Invocation, revision, model confirmation, session, snapshot, findings, resolutions:** pending.

### Review pass 2

- **Reviewer:** B, Claude Code, model `claude-opus-5-5`, effort `high`. Pending, if pass 1 has findings above Low.

### Review pass 3

- **Reviewer:** A, as pass 1. Pending, if pass 2 has findings above Low.

## Limitations

- A full fleet, or a quarantined installation, now costs up to `PLACEMENT_BATCH` (100) rolled-back placement transactions every 5 s; the batch bounds it, and no load test measured it.
- A slot that frees during a pass can still go to a later project of the same read (`advance-placement-rotation-cursor`, review pass 3, L2); this change does not remove that timing case.
- A task beyond the batch is not read in the next pass; it keeps its place in the rotation, which the requirement states instead of promising the next pass.
- The unit tests script the placement outcomes; only the integration test runs real placement transactions.

## Remaining gates

- Independent review (reviewer A passes 1 and 3, reviewer B pass 2).
- Archive of the change after the review.
- Integration into dev by the coordinator (single pull request).
