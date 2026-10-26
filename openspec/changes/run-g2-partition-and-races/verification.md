## Scope and source

G2 work item 24, third part (24c), `run-g2-partition-and-races`, assigned by the coordinator on 2026-10-26: partition and reconnect through Toxiproxy (worker to NATS, control plane to PostgreSQL), the cancellation races a to h, and a stale ownership generation and a stale recovery epoch with two workers and seeded ordering. The owner's delegate decided that the scenarios run on test-side compositions of the real modules against the `make` services, with target `harness-composition`, without a crash seam in product code, an operator cancel API, a contract change, or a Compose override. The coordinator asked this change to adopt the 24a recorder (commit `3f9777d`, cherry-picked as `2fbbfe4`) and its requirements "Scenario result records" and "Opt-in scenario results file". Excluded: product fixes, the Compose scenarios (24a), and the process-launch crash windows (24b). Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 24; [launch authorization](../../../docs/contracts/launch-authorization.md); [execution wire contracts](../../../docs/contracts/execution-wire-contracts.md); [worker journal](../../../docs/contracts/worker-journal.md); the [24a change](../run-g2-failure-scenarios-composition/proposal.md).

## Revision and environment

- Base: `origin/dev` at `f9ba7a5`, plus the cherry-picked 24a recorder. Branch `run-g2-partition-and-races`. Evidence runs at `415ecea`, the commit every record of `results.jsonl` names.
- Host: Linux 6.8.0-147-generic, x86_64, 8 CPUs; Docker 27.3.1; Node.js 24.22.1 from `.nvmrc`.
- Services: `make services-up` (PostgreSQL, NATS, Toxiproxy with routes `postgres` and `nats`). No delegated cgroup v2 subtree, so workers launch through the test-side process-group launch host (design decision 3).

## Author self-check and evidence check

- Only files under `test/` and this change directory are added; no product code, contract, Compose file, or dependency changes. The only crash point is the test-side transport wrapper `test/g2-scenarios/ack-interception.ts`.
- Each scenario draws its ordering from `TASKELITH_TEST_SEED`, prints the rerun hint, and records its result with target `harness-composition` through `scenarioRecorderFromEnvironment`, `failed` before a rethrow.
- Evidence runs: the three scenario files together, once with seed `20261026` and once with seed `7`, with `TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-partition-and-races/results.jsonl`: 32 records, 26 `passed` and 6 `failed`, every `failed` one an expected failure below. Each run: 17 tests, 13 passed, 1 skipped (g), 3 todo, 0 failed, 0 cancelled.

## Scenario results

| Scenario | How it is driven | Seeded choice | Result |
| --- | --- | --- | --- |
| `partition-worker-nats-before-offer` | Worker's broker route cut before the submit | submit before or after lost contact | passed (both) |
| `partition-worker-nats-while-running` | Route cut after the recorded start | heal before or after the exit | passed (both) |
| `partition-worker-nats-inventory-settles` | Route cut until lost contact, task submitted, healed | ids and draws | expected failure, product bug 1 |
| `partition-control-plane-postgres-authorization` | PostgreSQL route cut with the request held | 1 to 3 unavailable answers | passed (2 and 3 answers, same `operationId`) |
| `partition-control-plane-postgres-while-running` | Route cut after the journaled start | heal before or after the exit | passed (historical start in both runs) |
| `partition-control-plane-postgres-beyond-redelivery` | Route cut until the start and the exit used their 5 deliveries | redrive order | passed (both orders) |
| `cancel-before-offer` (a) | Broker route cut, submit, `cancelInTransaction`, heal | heal before or after lost contact | passed (both) |
| `cancel-during-authorization` (b) | Request or grant held at an `OrderedAuthority` gate, cancel, release | request or grant held | passed (both) |
| `cancel-after-w4` (c) | Cancel once W4 or the start is journaled | W4 or start | passed (both, `SIGTERM`) |
| `cancel-during-admission-pressure` (d) | Disk floor crossed after W1, cancel, relief | relief 0, 500, or 1000 ms later | passed (500 and 1000 ms) |
| `cancel-crash-before-ack` (e) | Worker process `SIGKILL`s itself instead of acking the cancellation; restarted in-process | restart before or after the ack wait | passed (both; redelivery acked once) |
| `invalidation-racing-grant` (f) | Held request and cancel released at offsets within 25 ms, 3 rounds | offsets | passed (seed 7 had a granted-then-revoked round) |
| adopting macOS supervisor ignores a cancel (g) | Skipped | — | N/A on Linux: adoption is macOS observe-only, and the Linux process-group platform reports the record unusable; native acceptance item 25 covers it |
| `unauthorized-start-cancels-only-that-execution` (h) | W2 to W5s of a new execution under the owning grant, written through the worker's journal | ids | expected failure, product bug 2 |
| `rejected-launch-frees-slot` | One-slot worker, request held, cancel, release | ids | expected failure, product bug 3 |
| `stale-ownership-generation` | Worker A held and cut off, A's assignment superseded, B owns generation 3 | A answered before or after B | passed (A: `assignment-not-active`; forged B request at A's generation: `stale-ownership-generation`) |
| `stale-recovery-epoch` | Both requests held; one granted; `installation.recovery_epoch` advanced; the other released | which worker goes first | passed (both) |

## Product bugs

Each is a `todo` test that runs, records `failed`, and does not fail `make verify`. The test names point here.

1. **Inventory request loop after a reconnect** (`test/g2-partition.test.ts`, "the inventory exchange settles after a reconnect"; seeds `20261026` and `7`). Observed: after the worker reconnects with an assignment in flight and the task has ended, the control plane keeps sending `worker.inventory.requested`: 80 and 77 requests in 3 s after the task ended; an earlier run counted 264, 525, and 789 outbox rows at 10 s intervals, each answered by a report with a new `requestId` and a higher `snapshot`. Expected: at most one further request once a report answers the current one. Hypothesis, unconfirmed: `receivePart` (`apps/control-plane/src/application/inventory-reconciliation.ts:86`) treats an answer to a superseded request as unsolicited and requests again; once two requests are outstanding, every answer is stale. It reproduces with a partition and an in-flight assignment, not always.
2. **An execution cancellation stops the whole intent** (`test/g2-cancellation-races.test.ts`, h; seeds `20261026` and `7`). Observed in a diagnostic run of the same steps: the authority wrote one `execution.cancellation.request` with `reason` `launch-revoked` and `executionId` of the forged execution only, as the contract requires; the worker then stopped the owning execution as well: it exited by `SIGTERM` about 2 s into a 6 s run, its attempt ended `cancelled: false`, and the control plane opened a retry attempt. In the evidence runs the scenario's assertion "one attempt" fails with 2 attempts. Expected: "with `executionId`, only that execution" ([execution wire contracts](../../../docs/contracts/execution-wire-contracts.md) section 4) and "never for another execution of the attempt" ([launch authorization](../../../docs/contracts/launch-authorization.md) section 7). Cause: `LaunchOrchestrator.#forward` cancels every live launch of the assignments that `targetedAssignments` derives from the target (`apps/worker/src/launch-orchestrator.ts:287` to `291` and `310`), and the forged execution shares the owning execution's assignment.
3. **A finally rejected launch keeps its worker slot** (`test/g2-cancellation-races.test.ts`, "a launch rejected after a cancel frees its worker slot"; seeds `20261026` and `7`). Observed: after the request of a cancelled assignment is rejected `assignment-not-active`, the journal keeps that execution without a state, and `countedAttempts` (`apps/worker/src/assignment-admission.ts:25` to `33`) counts it as running; a one-slot worker refuses the re-placement `worker-slots-exhausted`, and the task does not end within 30 s. In a debugging run of f with two slots, two rejected rounds exhausted both slots, the third assignment ended `refused` `worker-slots-exhausted`, and the task stayed without an assignment. Expected: a launch whose last authorization is a final rejection holds no slot, as the orchestrator's own `isSettled` treats it. Scenario f therefore runs with one slot per round.

## Observations that are not bugs

- A partition of the control plane's database longer than the redelivery budget (five deliveries, about 75 s at the targets, 11 s at the scenario limits) quarantines the start and the exit `max-deliveries`. In the evidence runs the task stayed pending until the redrive, which applied both once in either order; a reconnect inventory can also end it first.
- After a database partition the exit can be applied before the redelivered start, which is then a historical start, as the contract allows.
- In the stale epoch scenario the earlier worker's exit at the old epoch was applied and ended its task. The contract defines the epoch check for start observations only; a real restore would also quarantine the installation, which the test-side epoch write does not do.
- In the stale ownership scenario the cut-off worker's request is rejected `assignment-not-active`, because the assignment check precedes the generation check; `stale-ownership-generation` is reached by a request that names the current assignment at the superseded generation, which the scenario sends.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-partition-and-races --strict` | valid |
| `npm run verify:comments` | every comment within the rule |
| `make verify` | passed on 2026-10-26 at `415ecea` plus this change directory: 1776 tests, 1756 passed, 17 skipped, 3 todo, 0 failed, 0 cancelled; coverage 99.22 % lines, 91.99 % branches, 98.86 % functions; OpenSpec 69 items valid |

## Independent review

pending: independent review by Claude Code (claude-fable-5-1)

## Limitations and remaining gates

- The scenarios run on a test-side composition against the `make` services, not on the Compose installation, with scaled worker timers and the process-group launch host; the Linux cgroup supervisor and macOS adoption are not exercised.
- The unauthorized start and the epoch advance are test-side writes; no G2 product path writes either.
- Duplicate delivery is exercised only as the redelivered cancellation of e and the redelivered observations of the database partitions; the 24a proposal names duplicate delivery under 24c, and the coordinator's brief for this change did not list a separate scenario.
- Remaining gates: the independent review, fixes of the three product bugs in their own changes, integration by the coordinator, and the archive.
