## Scope and source

G2 work item 24, third part (24c), `run-g2-partition-and-races`, assigned by the coordinator on 2026-10-26: partition and reconnect through Toxiproxy (worker to NATS, control plane to PostgreSQL), the cancellation races a to h, and a stale ownership generation and a stale recovery epoch with two workers and seeded ordering. The owner's delegate decided that the scenarios run on test-side compositions of the real modules against the `make` services, with target `harness-composition`, without a crash seam in product code, an operator cancel API, a contract change, or a Compose override. The coordinator asked this change to adopt the 24a recorder (commit `3f9777d`, cherry-picked as `2fbbfe4`) and its requirements "Scenario result records" and "Opt-in scenario results file". Excluded: product fixes, the Compose scenarios (24a), and the process-launch crash windows and duplicate delivery, which the coordinator decided stay with 24b. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 24; [launch authorization](../../../docs/contracts/launch-authorization.md); [execution wire contracts](../../../docs/contracts/execution-wire-contracts.md); [worker journal](../../../docs/contracts/worker-journal.md); the [24a change](../archive/2026-10-26-run-g2-failure-scenarios-composition/proposal.md).

## Revision and environment

- Base: `origin/dev` at `f9ba7a5` with the cherry-picked 24a recorder, then `origin/dev` merged four times: `3321cf2` (`3c66b09`), `c7f546a` (`5c6f2a8`), which archives the 24a change, so its active directory left this branch with that merge, the UI proof-of-concept documents (`72003c4`), and, after review pass 1, `448be11` (`108bb9c`) with `fix-unclaimed-launch-liveness`, a worker change that checks the liveness of a launch record left unclaimed past its spawn deadline (`apps/worker/src/execution-watch.ts`, `apps/worker/src/launch-orchestrator.ts`). Branch `run-g2-partition-and-races`. Evidence runs at `5972389`, the commit every record of `results.jsonl` names; only `verification.md` and `results.jsonl` change after it.
- Host: Linux 6.8.0-147-generic, x86_64, 8 CPUs; Docker 27.3.1; Node.js 24.22.1 from `.nvmrc` through `scripts/with-pinned-node.sh`, for the evidence runs and `make verify`.
- Services: `make services-up` (PostgreSQL, NATS, Toxiproxy with routes `postgres` and `nats`). No delegated cgroup v2 subtree, so workers launch through the test-side process-group launch host (design decision 3).

## Author self-check and evidence check

- Only files under `test/` and this change directory are added; no product code, contract, Compose file, or dependency changes. The only crash point is the test-side transport wrapper `test/g2-scenarios/ack-interception.ts`.
- Each scenario draws its ordering from `TASKELITH_TEST_SEED`, prints the rerun hint, and records its result with target `harness-composition` through `scenarioRecorderFromEnvironment`, `failed` before a rethrow.
- Evidence refresh after pass 1: the `108bb9c` merge is a verification input, so both seeds ran again on the merged head (`9169312`). No outcome changed against the pass 1 evidence at `31a2f00`, B3 and the crash-before-ack scenario e included. `make verify` then failed in the database partition beyond the redelivery budget; the diagnosis below found a race in the test, fixed in `5972389`, and both seeds ran again at `5972389` and replaced `results.jsonl`, with the same outcomes.
- Evidence runs: the three scenario files together, once with seed `20261026` and once with seed `7`, with `TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-partition-and-races/results.jsonl`: 34 records, 26 `passed` and 8 `failed`, every `failed` one an expected failure B1 to B4 below. Each run: 18 tests, 13 passed, 1 skipped (g), 4 todo, 0 failed, 0 cancelled.

## Scenario results

| Scenario | How it is driven | Seeded choice | Result |
| --- | --- | --- | --- |
| `partition-worker-nats-before-offer` | Worker's broker route cut before the submit | submit before or after lost contact | passed (both) |
| `partition-worker-nats-while-running` | Route cut after the recorded start | heal before or after the exit | passed (both) |
| `partition-worker-nats-inventory-settles` | Route cut until lost contact, task submitted, healed | ids and draws | expected failure B1 |
| `partition-control-plane-postgres-authorization` | PostgreSQL route cut with the request held | 1 to 3 unavailable answers | passed (2 and 3 answers, same `operationId`) |
| `partition-control-plane-postgres-while-running` | Route cut after the journaled start | heal before or after the exit | passed (both; historical start in the latest evidence runs, current start in earlier runs) |
| `partition-control-plane-postgres-beyond-redelivery` | Supervisor start held until the route is cut; route cut until the start and the exit used their 5 deliveries | redrive order | passed (both orders) |
| `cancel-before-offer` (a) | Broker route cut, submit, `cancelInTransaction`, heal | heal before or after lost contact | passed (both) |
| `cancel-during-authorization` (b) | Request or grant held at an `OrderedAuthority` gate, cancel, release | request or grant held | passed (both) |
| `cancel-after-w4` (c) | Cancel once W4 or the start is journaled; for W4 the supervisor start waits at a test-side gate until the cancel is journaled | W4 or start | passed (both): journal state `authorized` (seed `7`) or `started` (seed `20261026`) at the cancel; `SIGTERM` |
| `cancel-during-admission-pressure` (d) | Disk floor crossed after W1, cancel, relief | relief 0, 500, or 1000 ms later | passed (500 and 1000 ms) |
| `cancel-crash-before-ack` (e) | Worker process `SIGKILL`s itself instead of acking the cancellation; restarted in-process | restart before or after the ack wait | passed (both; redelivery acked once) |
| `invalidation-racing-grant` (f) | Held request and cancel released at offsets within 25 ms, 3 rounds | offsets | passed (both seeds had a granted-then-revoked round) |
| adopting macOS supervisor ignores a cancel (g) | Skipped | — | N/A on Linux: adoption is macOS observe-only, and the Linux process-group platform reports the record unusable; native acceptance item 25 covers it |
| `unauthorized-start-cancels-only-that-execution` (h) | W2 to W5s of a new execution under the owning grant, written through the worker's journal | ids | expected failure B2 |
| `rejected-launch-frees-slot` | One-slot worker, request held, cancel, release | ids | expected failure B3 |
| `stale-ownership-generation` | Worker A held and cut off, A's assignment superseded, B owns generation 3 | A answered before or after B | passed (A: `assignment-not-active`; forged B request at A's generation: `stale-ownership-generation`) |
| `stale-recovery-epoch` | Both requests held; one granted; `installation.recovery_epoch` advanced; the other released | which worker goes first | passed (both): rejected `stale-recovery-epoch`, old-epoch start not recorded, no cancellation |
| `stale-epoch-exit-is-evidence` | Same steps, then the earlier worker's exit at the old epoch | which worker goes first | expected failure B4 |

## Product bugs

Each is a node:test `todo` that runs, records `failed`, and does not fail `make verify`; its `todo` reason names it. Every reproducer needs `make services-up` running and its printed variables exported (`TASKELITH_POSTGRES_URL`, `TASKELITH_NATS_URL`, `TASKELITH_TOXIPROXY_URL`, `TASKELITH_POSTGRES_PROXY_URL`, `TASKELITH_NATS_PROXY_URL`, `TASKELITH_SERVICES_SECRETS`), Node.js from `.nvmrc`, and the worktree root as the working directory. The commands below are `node --experimental-strip-types --no-warnings --test --test-name-pattern=<filter> <file>` with `TASKELITH_TEST_SEED` set; `TASKELITH_SCENARIO_RESULTS` is optional.

### B1: inventory request loop after a reconnect

- Reproducer: `TASKELITH_TEST_SEED=7 node --experimental-strip-types --no-warnings --test --test-name-pattern="inventory exchange" test/g2-partition.test.ts`; seed `20261026` reproduces too.
- Steps: the worker's broker route is cut until the control plane marks the worker lost (3 s), a task is submitted, the route is healed, the task exits, and the test counts `worker.inventory.requested` outbox rows over two 3 s windows.
- Expected: at most 1 further request in 3 s after the task ended. Observed: 80 (seed `20261026`) and 79 (seed `7`) in the evidence runs, with the last reports (requestId prefix, snapshot) `(060997f0, 473) (3aebcda5, 474) (ec434a34, 475) (7917482b, 476)` and `(1a68bb03, 369) (dea29fc6, 370) (67a0df3e, 371) (2b967739, 372)`: each answers a different request at the next snapshot; 76 to 80 in other runs; one diagnostic run counted 264, 525, and 789 rows at 10 s intervals, each request answered by a report with a new `requestId` and a higher `snapshot`.
- Rate: intermittent. Failed in every evidence run of this change (12 of 12 at seeds `20261026` and `7`) and in 4 of 6 consecutive reruns of the filter alone (seeds alternating); the 2 passing reruns sent at most 1 request.
- Hypothesis, unconfirmed: `receivePart` (`apps/control-plane/src/application/inventory-reconciliation.ts:70` to `88`, the `unsolicited` test at line 86) treats a report answering a superseded request, whose `snapshot` is still the highest, as unsolicited and requests again; once two requests are outstanding (a reconnect report and a request for an omitted unfinished assignment, in separate transactions), every answer is stale and the loop sustains itself.

### B2: an execution cancellation stops the whole intent

- Reproducer: `TASKELITH_TEST_SEED=7 node --experimental-strip-types --no-warnings --test --test-name-pattern="unauthorized start" test/g2-cancellation-races.test.ts`; deterministic, both seeds.
- Steps: a 6 s scripted process starts under its grant; the test writes W2 to W5s of a new execution under that grant through the worker's journal API, so the worker publishes a start the authority did not grant to that execution.
- Expected: one `execution.cancellation.request` naming only the new execution, and the owning execution exits 0 in the only attempt ([execution wire contracts](../../../docs/contracts/execution-wire-contracts.md) section 4, "with it, only that execution"; [launch authorization](../../../docs/contracts/launch-authorization.md) section 7, "never for another execution of the attempt").
- Observed: the authority writes the one cancellation with `reason` `launch-revoked` and the new execution's `executionId`, as required; the worker then stops the owning execution too (`SIGTERM` about 2 s into its 6 s run in a diagnostic run), its attempt ends `cancelled: false`, and a retry attempt opens. The assertion "one attempt" fails with 2.
- Cause: `LaunchOrchestrator.#forward` (`apps/worker/src/launch-orchestrator.ts:287` to `291`) cancels every live launch of the assignments that `targetedAssignments` (line 310) derives from an execution target, and both executions share the assignment.

### B3: a finally rejected launch keeps its worker slot

- Reproducer: `TASKELITH_TEST_SEED=7 node --experimental-strip-types --no-warnings --test --test-name-pattern="frees its worker slot" test/g2-cancellation-races.test.ts`; deterministic, both seeds.
- Steps: a one-slot worker's authorization request is held, its assignment is cancelled, the request is released and rejected `assignment-not-active`.
- Expected: the slot is free, the worker accepts the re-placement, and the task exits once. Observed: the task does not end within 30 s; the re-placement ends `refused` with `worker-slots-exhausted`, and the task stays without an assignment. With two slots, two rejected rounds of scenario f exhausted both slots the same way in a debugging run, so f runs with one slot per round.
- Cause: `countedAttempts` (`apps/worker/src/assignment-admission.ts:25` to `33`) counts every execution whose state is neither `exited` nor `not-started`, and a finally rejected execution has no state, although the orchestrator's `isSettled` (`apps/worker/src/launch-orchestrator.ts:342`) treats it as settled.

### B4: an old-epoch exit ends its task

- Decision: the owner's delegate decided in away run `20261026T164615Z-opencode-20899` that this is a G2 product defect.
- Reproducer: `TASKELITH_TEST_SEED=7 node --experimental-strip-types --no-warnings --test --test-name-pattern="old-epoch exit" test/g2-stale-generations.test.ts`; deterministic, both seeds.
- Steps: two one-slot workers hold their requests; one is granted; the test advances `installation.recovery_epoch` (standing for a restore); the other is rejected `stale-recovery-epoch`; the granted worker runs its 1 s process to its exit.
- Expected: the exit at the old epoch is kept as evidence and changes no current state, so the task stays `pending`. Observed: the start is evidence only, as the contract requires, but the exit is recorded on the execution and ends the task; the assertion "no exit recorded" fails.
- Cause: the epoch check exists for start observations only (`decideStartObservation`, `packages/modules/execution/src/domain/start-observation.ts:44`); `exit` in `apps/control-plane/src/application/observation-effects.ts:114` records the exit without one, and the exit payload carries no `recoveryEpoch`.
- Fix direction from the decision, out of scope here: extend the start rule's evidence-only gate to every execution observation (exited, not-started, uncertain, termination-unproven, cancellation not applied, unrecorded process): with an epoch that is not current, or in quarantine, the observation is kept as evidence and changes no current state. That is a future contract and wire change (launch authorization section 7, execution wire contracts section 5, `recoveryEpoch` on the observation payloads); this change touches no contract or product code.

## Diagnosis of the redelivery budget failure after the `108bb9c` merge

- Symptom: `make verify` failed twice at `9169312` in `partition-control-plane-postgres-beyond-redelivery`, `the start and the exit quarantined not met within 31000 ms` (random seeds `3088253844` and `1500157364`); the scenario alone, with seed `3088253844`, and both evidence runs passed. Pre-merge `ea411ad` passed one `make verify`.
- Method: a temporary, uncommitted dump of the control plane's and the worker's logs and of the worker's journal states, sampled every 5 ms, plus the recorded starts read straight from the database right after the cut; `make verify` repeated until the failure came back, and runs of the scenario alone with 12 busy-loop processes as load.
- Failing timeline (ms from the worker's start): journal `authorized` 438, `started` 1009; the test saw `started` at 1050 and cut the route at 1066; the database already held the start (`1` recorded start at the cut); `exited` 2125; `execution.exited` deliveries 1 to 5 at 2143, 2907, 4450, 8105, 11532 (delays 839, 1621, 3264, 3682, 3347 ms), then nothing up to the 31 s limit. No `execution.started` delivery failed at all, so the count of last failed deliveries stayed at 1.
- Passing timeline (ms from the wait): `execution.started` deliveries 1 to 5 at -1131, -244, 1370, 5328, 8643 and `execution.exited` at 6, 784, 2721, 5800, 9641; both quarantined within 10.8 s.
- Worker side: the worker logged no event between `worker.contact.online` and the end in either run, journaled one execution, and published its start and exit once; the unclaimed-launch liveness check of `108bb9c` emitted no observation and changed no delivery count. The start deliveries progressed correctly whenever the start arrived after the cut.
- Verdict: a race in the test, not timing and not a product defect. The test cut the route after it saw the journaled start, and the control plane could record the start in the 50 ms poll gap before the cut; the redelivery itself stayed within its budget.
- Fix (`5972389`): the supervisor start waits at a test-side gate, the route is cut once the launch is journaled `authorized`, then the gate opens, so the start always meets the partition. Because other observations in flight at the cut (assignment accepted, admission pressure, inventory report) can now use their deliveries too, the wait counts only the start's and the exit's observation ids, and the quarantine checks and the redrive select those records by `originalMessageId`, the observation id the worker publishes as message id. The wait stays derived from `REDELIVERY_BUDGET_MILLISECONDS` plus 20 s.
- After the fix: 6 of 6 runs of the scenario alone under the busy-loop load passed, as did both evidence runs and four `make verify` runs at `5972389`, the scenario in 16 to 18 s each. One of those four failed in another scenario, below; the last two passed in a row.
- Other failure, not diagnosed: the second `make verify` after the fix failed in `partition-worker-nats-before-offer` with `fetch failed` (`read ECONNRESET`) after 52.8 s, random seed `751552851`, without an application frame in the stack, so it is open whether the control plane API or the Toxiproxy API reset the connection. It is the only such failure in 23 logged runs of this change, and it does not involve the code of `108bb9c` or of `5972389`.
- Follow-up on that failure: the scenario's HTTP helpers, the control plane API call (`ScenarioInstallation.call`) and the Toxiproxy admin request, now fail with `requestFailure` (`@taskelith/testing`), which names the target, method, URL, time to failure, and socket code, so a repeat names its call. Toxiproxy 2.13.0 keeps an idle keep-alive connection open for more than 30 s, so a stale admin connection is unlikely; the control plane's `node:http` server closes idle connections after its default 5 s and announces it, which leaves fetch's reuse a 1 s margin. Best hypothesis, unconfirmed: under `make verify` load an event-loop stall longer than that margin lets the server close a reused control plane connection as a request is written. 8 of 8 runs of the scenario alone under the busy-loop load passed (seed `751552851` and seeds 1 to 7), so it stays unexplained; no retry was added, as one could hide a product failure.
- A third failure seen once during the diagnosis, `the start is journaled not met within 20000 ms`, came from the same wait before the fix and left no dump; the fixed scenario no longer waits for the journaled start.

## Observations that are not bugs

- A partition of the control plane's database longer than the redelivery budget (five deliveries, about 75 s at the targets, 11 s at the scenario limits) quarantines the start and the exit `max-deliveries`. In the evidence runs the task stayed pending until the redrive, which applied both once in either order; a reconnect inventory can also end it first.
- After a database partition the exit can be applied before the redelivered start, which is then a historical start, as the contract allows.
- The test-side epoch write does not quarantine the installation, as a real restore would; the stale epoch scenarios check only what follows from the epoch.
- In the stale ownership scenario the cut-off worker's request is rejected `assignment-not-active`, because the assignment check precedes the generation check; `stale-ownership-generation` is reached by a request that names the current assignment at the superseded generation, which the scenario sends.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-partition-and-races --strict` | valid |
| `npm run verify:comments` | every comment within the rule |
| `make verify` | passed twice in a row on 2026-10-26 at `5972389` plus this change's `verification.md` and `results.jsonl`: each 1808 tests, 1787 passed, 17 skipped, 4 todo, 0 failed, 0 cancelled; coverage 99.22 % lines, 92.01 % branches, 98.86 % functions; OpenSpec 70 items valid; the archive dry run of every active change is strictly valid. An earlier run at the same commit failed once in `partition-worker-nats-before-offer` (see the diagnosis) |

## Independent review

### Pass 1

- Reviewer: Claude Code, model `claude-fable-5-1` (confirmed by the coordinator from the run's JSON output), effort medium, plan mode; session `d7dbd738-9cde-4678-95ff-4fbdbf4686ea`. Invocation, run from the worktree: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- Reviewed revision: `d0c81f6`. The worktree snapshots before and after the review are identical (`7931b89fadb23ae22464517ca5a6e3d6498aeeb872c4d00e7654c4e8745d88a9`).
- Findings: 0 Critical, 0 High, 2 Medium, 9 Low. It confirmed B2, B3, and B4 in the product code, and B1 as plausible with its hypothesis unconfirmed.

| Finding | Resolution | Commit |
| --- | --- | --- |
| M1: stale epoch negative assertions after a fixed 3 s delay | Wait for `execution.start.evidence` with decision `quarantine-evidence` for the early execution, and for the early worker's outbox to be confirmed, before the assertions of both stale epoch tests | `750d0db` |
| M2: scenario c did not prove the W4 ordering | The supervisor start waits at a test-side gate until the cancel is journaled; the journal state at the cancel is asserted and recorded | `91f79ea` |
| L3: B3 test named "b." | Renamed "a launch rejected after a cancel frees its worker slot (B3)" | `91f79ea` |
| L4: `quarantined()` returned `[]` on an error | It asserts status 200; only the wait while the database returns tolerates an error | `b38b8a6` |
| L5: literal `5` deliveries | `SCENARIO_LIMITS.maxDeliver` | `b38b8a6` |
| L6: dead restart branch, `environment(extra)`, `ExecutedTask.result` | Removed | `2bcee2d` |
| L7: task found by parsing `assignments.record` | Found by `installation.task` among the scenario's tasks | `750d0db` |
| L8: g has no record | Stated under limitations, with a `not-applicable` outcome as a possible 24a extension; recorder unchanged | this document |
| L9: a cleanup failure could mask the scenario failure | Cleanup failures after a failed body are logged, and the body's failure is rethrown | `2bcee2d` |
| L10: `pressured()` used the throwing `running` getter | A flag set while the worker runs | `91f79ea` |
| L11: B1 detail without the request trail | The failure detail carries the last four (requestId, snapshot) pairs | `b38b8a6` |

### Pass 2

pending: independent review by Claude Code (claude-fable-5-1)

## Limitations and remaining gates

- The 24a recorder knows only `passed` and `failed`, so scenario g, not applicable on Linux, has no record in `results.jsonl` and is recorded only in this document. A `not-applicable` outcome is a possible future extension of 24a; this change leaves the recorder unchanged.
- The scenarios run on a test-side composition against the `make` services, not on the Compose installation, with scaled worker timers and the process-group launch host; the Linux cgroup supervisor and macOS adoption are not exercised.
- The unauthorized start and the epoch advance are test-side writes; no G2 product path writes either.
- Duplicate delivery is out of scope; the coordinator decided it stays with 24b. It appears here only as the redelivered cancellation of e and the redelivered observations of the database partitions.
- Remaining gates: the independent review, fixes of B1 to B4 in their own changes (B4 with its contract and wire change), integration by the coordinator, and the archive.
