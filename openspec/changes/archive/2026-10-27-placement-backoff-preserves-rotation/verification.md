# Verification

Date: 2026-10-27. The author's verification, review passes 1 and 2 with their fixes, and the checks after them are recorded below; the archive checks are pending.

## Scope and source

Follow-up `placement-backoff-preserves-rotation`, recorded by review pass 2 (finding M1) of `advance-placement-rotation-cursor` (pull requests #337 and #338): a decline for lack of fleet capacity backed the task off by 5 s to 60 s with jitter while the pass runs every 5 s, so a freed slot went to the first task whose backoff had ended instead of following the rotation cursor. The owner's delegate chose option (a), no per-task backoff after a decline for lack of fleet capacity and a backoff only for the task's own reasons (away decision `20261027T085757Z-opencode-1447`). The coordinator, Niki, assigned the task in a brief; it was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/placement-backoff-preserves-rotation` on branch `placement-backoff-preserves-rotation`.

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
  - Changed: the contract and operational-targets lines above; the `execution-placement` requirement "Placement backoff", in the delta `openspec/changes/placement-backoff-preserves-rotation/specs/execution-placement/spec.md:3`, which replaces the living requirement (`openspec/specs/execution-placement/spec.md:89`) only at archive; the comments of `PLACEMENT_BACKOFF_INITIAL_MILLISECONDS` (`packages/modules/scheduling/src/domain/capacity-limits.ts:26`), which said capacity waits back off, and of `FLEET_REASONS` (`capacity-reasons.ts:31`); the comments of `placeWaiting`, `#placeDue`, `#settle`, and `isFleetCapacityDecline`.
  - Agree and unchanged: contract section 5 "Fair admission" and section 13 "Fair order" (`capacity-reservation.md:235`), whose "backoff" among a project's own limits is the retry backoff; `execution-placement` "Waiting placements" (`spec.md:8`), "Project rotation" (`:31`), "Placement transaction" and its scenario "No capacity" (`:66`), and "Backoff forgetting" (`:104`); `observation-consumption` "Retry backoff" (`openspec/specs/observation-consumption/spec.md:133`); `capacity-reservation` "Bounded automatic retry" (`openspec/specs/capacity-reservation/spec.md:98`); `docs/architecture.md:409`; `RetrySchedule` (`apps/control-plane/src/application/retry-schedule.ts`) and `placementBackoff`. The other backoffs (`postgres-state`, `nats-transport`, `launch-authorization`, `worker-runtime`, `worker-journal.md:118`) concern other loops.
- **Requirement length.** The modified requirement is 499 characters, within the 500 of `MAX_REQUIREMENT_TEXT_LENGTH` of the pinned OpenSpec. `openspec archive placement-backoff-preserves-rotation --yes` in a scratch copy of `openspec/`, then `openspec validate --specs --strict`: 69 passed, 0 failed, at `43b914e7`.
- New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes within `make verify`.
- Commit types are `docs`, `test`, and `chore`; only private workspace packages and documents change.

## Evidence check

- **Fails before the fix.** With the new tests (`fbdcdbdf`) and the sources of `bd6108d4`, after `npm run build`:
  - `node --experimental-strip-types --test apps/control-plane/test/placement-service.test.ts`: 24 tests, 21 pass, 3 fail. `a freed slot follows the rotation after a fleet capacity decline, not a backoff` (`apps/control-plane/test/placement-service.test.ts:392`) failed with actual `[ 'task-big-01', 'task-big-02', 'task-small' ]`, expected `[ 'task-big-01', 'task-small', 'task-big-02' ]`: the large project took the freed slot while the small project's task backed off. `a decline for a reason of its own backs the task off, a fleet capacity decline does not` (`:403`), then with a decline without a reason as its own (pass 2, L6), failed with actual `[]`, expected `[ 'task-b1' ]`; `without a candidate no transaction is opened and the tasks do not back off` (`:109`) failed with actual `{ waiting: 0, placed: 0 }`, expected `{ waiting: 1, placed: 1 }`.
  - Against PostgreSQL (`make services-up`), `node --experimental-strip-types --test apps/control-plane/test/placement.integration.test.ts`: 23 tests, 21 pass, 2 fail. `a slot freed after a fleet capacity decline goes to the next project, not the larger backlog` (`apps/control-plane/test/placement.integration.test.ts:181`) failed with actual `[ 'task-a01', 'task-a02' ]`, expected `[ 'task-a01', 'task-b' ]`; `without capacity nothing is written and the task still waits` (`:171`) failed with message `it does not back off`, actual `{ waiting: 0, placed: 0 }`, expected `{ waiting: 1, placed: 0 }`.
  - The tests were run before the fix was written, so no stash was needed: the built sources were those of `bd6108d4`.
- **Passes after the fix.** The same files at `41ef68fb`: 24 of 24 and 23 of 23 pass; with the pass 1 test (`dfe54076`), 25 of 25 unit tests.
- **Kept failure count (pass 1, L2).** `a fleet capacity decline keeps the failure count of an own-reason backoff` (`apps/control-plane/test/placement-service.test.ts:414`) runs an own decline, a fleet decline once due, and a second own decline, and expects the second wait to be 15 s. With the early return of `#settle` replaced by `this.#forget(taskId)` it failed with `the second own wait doubles to 15 s`; replaced by `this.#tasks.failed(taskId)`, the base behavior, it failed with `the fleet decline set no new wait`. The source was restored and rebuilt; the test passes.
- **Fixture.** Both fifty-to-one tests draw a long jitter (0.9) for the first decline, the small project's task, and none for the rest, so before the fix its backoff outlasts the large project's; after the fix no decline draws.
- **Citations.** Every file and line cited above was checked against the files of the records commit.

## Checks

- `npm run openspec -- validate placement-backoff-preserves-rotation --strict`: valid.
- `make findings ARGS="validate"`: every findings file is valid, 20 files.
- `make findings ARGS="checklist --capability execution-placement --files apps/control-plane/**"`: the most frequent categories are docs, missing-fail-before-test, contract-drift, naming, and spec-wording; the self-check, the evidence check, and the limitations above address them.
- `make verify`: exit 0; 2114 tests, 2067 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.17%, functions 98.95%; every active OpenSpec change archives into strictly valid specs, `validate --all --strict` 70 passed. The new unit tests and both PostgreSQL tests above passed in it.

- After the pass 1 fixes, on the working tree of `206c9e3d` with the findings record and these results, which the commit `docs: record review pass 1 of the placement-backoff-preserves-rotation change` holds: `npm run openspec -- validate placement-backoff-preserves-rotation --strict` valid; `make findings ARGS="validate"` valid (20 files); `make verify` exit 0, 2115 tests, 2068 pass, 0 fail, 47 skipped, coverage lines 99.24%, branches 92.20%, functions 98.92%, `validate --all --strict` 70 passed. The pass 1 test and both PostgreSQL tests passed in it.

- After the pass 2 fixes, on the working tree of `5307cec1` with the pass 2 records and these results, which the commit `docs: record review pass 2 of the placement-backoff-preserves-rotation change` holds: `npm run openspec -- validate placement-backoff-preserves-rotation --strict` valid; `make findings ARGS="validate"` valid (20 files); `make verify` exit 0, 2115 tests, 2068 pass, 0 fail, 47 skipped, coverage lines 99.24%, branches 92.19%, functions 98.92%, every active change archives into strictly valid specs, `validate --all --strict` 70 passed. The placement unit tests, 25 of 25, and both PostgreSQL tests passed in it.

Environment: Linux (`Linux 7.0.0-38-generic`, x86_64), Node from `.nvmrc`, Docker test services started by the make targets, `TMPDIR` set to a directory on disk outside `/tmp` (`~/.cache/taskelith-tmp`) because of the stray `/tmp/.git` directory on this host.

## Independent review

### Review pass 1

- **Reviewer:** A, OpenCode CLI, model `opencode-go/qwen3.8-max`, variant `medium`, agent `reviewer`, read-only, assigned and run by the coordinator from the worktree, 2026-10-27T11:42:35Z to 11:56:59Z.
- **Invocation:** `opencode run --standalone --agent reviewer -m 'opencode-go/qwen3.8-max#medium' --format json --title placement-backoff-preserves-rotation "$(cat <prompt-file>)" < /dev/null > <log>`, with the prompt and the log kept outside the worktree.
- **Revision:** `5f159bc1`.
- **Model confirmation:** the stored assistant messages record provider `opencode-go`, model `qwen3.8-max`, variant `medium`, agent `reviewer`; session `ses_e82d4a6baffec8jvO13lmt2pyR`.
- **Snapshot:** `6e12da5881b9a70816343a980ed5285381637c9931fe6aa006bfbff8d33c0785` before and after; unchanged.
- **Scope of the check:** the reviewer had no shell, so it ran no tests, no `make verify`, and checked no commit hash; it checked the fail-before values by reasoning, and confirmed that both adapters behave the same and that no other statement still backs off a capacity wait.
- **Findings:** 0 Critical, 0 High, 1 Medium, 4 Low. All five are **fixed**, to be checked by review pass 2 (reviewer B, Claude Code, model `claude-opus-5-5`, effort `high`); `findings.jsonl` holds one line for each.
  1. **M1 (contract-drift):** the comment of `isFleetCapacityDecline` (`placement-service.ts:274`) promised an offer in the next pass, without the batch qualifier of contract section 5. **Fixed** (`5cb42104`): the next pass that reads it offers it in its place in the rotation.
  2. **L1 (docs):** the comment of `#placeDue` (`placement-service.ts:70`) said a declined task keeps waiting unchanged, against the spec's term for the kept wait. **Fixed** (`5cb42104`): it rolls back, and the task still waits.
  3. **L2 (missing-fail-before-test):** the design decision that a fleet capacity decline keeps an own-reason failure count had no test. **Fixed** (`dfe54076`): the test at `placement-service.test.ts:414`, which fails both if `#settle` forgets and if it counts a failure on such a decline (evidence check).
  4. **L3 (docs):** `worker-capacity-exhausted` depends on the task's own request, so the `FLEET_REASONS` comment (`capacity-reasons.ts:31`) was too absolute. **Fixed** (`5cb42104`, `206c9e3d`): the comment says the set is exact while all requests are equal, and the design's Risks say that per-task requests must revisit the reason.
  5. **L4 (evidence-mismatch):** this record cited the living spec as changed, although the branch changes only the delta. **Fixed** (`206c9e3d`): the self-check cites the delta and notes that the living requirement changes at archive.

### Review pass 2

- **Reviewer:** B, Claude Code, model `claude-opus-5-5`, effort `high`, read-only, session `f786997a-5e38-4434-8926-055a08d41964`, 2026-10-27T12:06:40Z to 12:12:41Z.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`, with the prompt and the output kept outside the worktree. The effort `high` is set by the invocation; the reviewer cannot confirm its own effort.
- **Revision:** `4a286a79`.
- **Model confirmation:** `claude-opus-5-5` is the only model in the JSON `modelUsage`; `is_error` is false.
- **Snapshot:** `4697edc2f19a1415ef70858a5799e9dbe011dbda1167d885edc1e205fe89fa45` before and after; unchanged.
- **Pass 1 fixes:** all five confirmed (M1, L1 to L4). The reviewer ran the unit tests against the `placement-service.ts` of `bd6108d4` in memory, writing nothing to disk: 25 tests, 4 fail, exactly the recorded ones. It traced the PostgreSQL test by reasoning and confirmed the `FLEET_REASONS` membership, the parity of the adapters, every citation, and the content of every commit. It ran no `make verify`, no integration test, and no scratch archive.
- **Findings:** 0 Critical, 0 High, 0 Medium, 6 Low. A Low-only pass ends the review (governance, "Low findings are fixed"), so all six are **fixed as unreviewed fixes**; `findings.jsonl` holds one line for each, with outcome `fixed-unreviewed`.
  1. **L1 (spec-wording):** the delta (`specs/execution-placement/spec.md:4`) dropped the clause "so that a pass reaches the tasks after it" without a record. **Fixed, unreviewed** (`5307cec1`): the design's Risks (`design.md:25`) say that with per-task requests a full batch of fleet-declined tasks, read again every pass, could hide a later task that would fit, why G2 is safe, and that the clause was also dropped for the 500-character requirement limit; the requirement is unchanged at 499 characters.
  2. **L2 (docs):** What Changes (`proposal.md:11`) omitted the changed scenario "Repeated waiting" and the dropped rationale. **Fixed, unreviewed** (`5307cec1`): both are listed.
  3. **L3 (docs):** the `FLEET_REASONS` comment (`capacity-reasons.ts:32`) cited only contract section 5, although the cursor stop is section 13 "Fair order". **Fixed, unreviewed** (`4fe51312`): it cites §5 and §13.
  4. **L4 (naming):** the comment of `isFleetCapacityDecline` (`placement-service.ts:274`) said "such a task" without a referent. **Fixed, unreviewed** (`4fe51312`): it says that the function answers a failure for a fleet reason, after which the task keeps its wait.
  5. **L5 (docs):** the comment of `BIG_AND_SMALL` (`placement-service.test.ts:386`) said the tasks are all older than the passes, which is false. **Fixed, unreviewed** (`32862dd2`): they wait in id order.
  6. **L6 (naming):** the test `a decline for a reason of its own backs the task off, a fleet capacity decline does not` (`placement-service.test.ts:403`) scripted a decline without a reason. **Fixed, unreviewed** (`32862dd2`): it scripts `QUOTA_USED` (`:267`), a decline for `project-quota-exhausted`, which is not in `FLEET_REASONS`. The test passes; with `#settle` backing off every decline, the base behavior, it fails, and with `lacksFleetCapacity` also accepting `project-quota-exhausted` it fails with actual `[ 'task-a1' ]`, expected `[ 'task-b1' ]`. The source was restored and rebuilt.
- **Citation shifts:** the constant `QUOTA_USED` moved the later tests of `placement-service.test.ts` down one line; this record and `findings.jsonl` cite the new lines (`:392`, `:403`, `:414`).

### Review pass 3

Not run. A Low-only pass 2 ends the review (governance, "Low findings are fixed"): pass 3 confirms the fixes of pass 2, which a Low-only pass does not need.

## Limitations

- A full fleet, or a quarantined installation, now costs up to `PLACEMENT_BATCH` (100) rolled-back placement transactions every 5 s; the batch bounds it, and no load test measured it.
- A slot that frees during a pass can still go to a later project of the same read (`advance-placement-rotation-cursor`, review pass 3, L2); this change does not remove that timing case.
- A task beyond the batch is not read in the next pass; it keeps its place in the rotation, which the requirement states instead of promising the next pass.
- The unit tests script the placement outcomes; only the integration test runs real placement transactions.

## Archive

Checked state: the tree of the archive commit (`docs: archive the placement-backoff-preserves-rotation change`), on top of `447d2725`, which is the working tree these checks ran on. Environment and `TMPDIR` as in "Checks".

- `npm run openspec -- archive placement-backoff-preserves-rotation --yes`: archived as `2026-10-27-placement-backoff-preserves-rotation`; `execution-placement` 1 modified.
- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line passes (`change/2026-10-27-placement-backoff-preserves-rotation`).
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `openspec/specs/execution-placement/spec.md`, the "Placement backoff" requirement with the fleet capacity exception, the narrowed scenario "Repeated waiting", and the new scenario "Capacity decline".
- The moved change has `findings.jsonl` (11 lines); `make findings ARGS="validate"`: every findings file is valid, 20 files.
- `make verify`: exit 0; 2115 tests, 2068 pass, 0 fail, 47 skipped; coverage lines 99.24%, branches 92.15%, functions 98.92%; every active OpenSpec change archives into strictly valid specs.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
