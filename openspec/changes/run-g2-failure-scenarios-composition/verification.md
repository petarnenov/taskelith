## Scope and source

G2 work item 24, first part (24a), `run-g2-failure-scenarios-composition`, assigned by the coordinator on 2026-10-26: the fresh-composition happy path on arm64, a results recorder that 24b and 24c adopt, worker disk loss in Compose ending in re-enrolment, and an untimed `SIGKILL` of the worker container with a check of reconciliation. Excluded: the process-launch crash windows (24b, `run-g2-crash-windows`), partition and reconnect, cancellation races, stale generations, and duplicate delivery (24c, `run-g2-partition-and-races`), product code, and any contract change. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 24; the [harness archive](../archive/2026-10-25-build-deterministic-test-harness/proposal.md); the [item 23b archive](../archive/2026-10-26-compose-installation-end-to-end/proposal.md).

## Revision and environment

- Base: `origin/dev` at `f9ba7a5`. Branch `run-g2-failure-scenarios-composition`. Phase 1 (the recorder): `3f9777d`. Phase 2 (the scenarios): `d0479ea` and `1cbf490` (first evidence). Review pass 1 fixes: `07fce6d`, the commit every current evidence record names; the evidence runs ran on that tree, with only `results.jsonl` changed. The records of `d0479ea` were replaced.
- Host: Apple Silicon Mac, macOS 26.6.2 (build 25G83, Darwin 25.6.0), `arm64`; Node.js 24.22.1 from `.nvmrc`.
- Engine: Docker Desktop, Docker Engine 29.6.1 (client and server), server architecture `aarch64`, kernel 6.12.76-linuxkit. The images are built for linux/arm64.

## Author self-check and evidence check

- No product code, OpenAPI, AsyncAPI, JSON schema, contracts document, or npm dependency changes. Changed: `scripts/installation.sh` (scenario commands), the new `scripts/installation-scenarios.sh` (the scenario steps, sourced by `installation.sh`) and its test `test/installation-scenarios.test.ts`, `scripts/installation-smoke.ts` (the task is a parameter; the smoke behaves as before), the new `scripts/installation-scenario.ts` and its test, the test-only `infra/installation/scenarios/`, three `make` targets, and `docs/local-installation.md`.
- The scenarios delete only files inside the throwaway project's worker volume, from a one-off container of the worker image; they remove no volume other than their own project's (`down --volumes`, as the smoke does) and run no prune. After the runs, `docker volume ls` and `docker images` list nothing of `taskelith-<id>-installation-*`.
- No Toxiproxy and no second worker were added to the composition (24c).
- The recorder writes only when `TASKELITH_SCENARIO_RESULTS` is set, so `make verify` leaves the tree unchanged.

## Scenario evidence runs

Each command ran at `07fce6d` with `TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-failure-scenarios-composition/results.jsonl` on 2026-10-26, in this order, each on a fresh throwaway project that it removed at the end; every one exited 0. The records are in [results.jsonl](results.jsonl). The last kill ran with `TASKELITH_TEST_SEED=23800`, chosen so that the pause falls after the execution's end, the case of review finding M1; the other seeds are random.

| Command | Scenario | Seed | Outcome | Observed |
| --- | --- | --- | --- | --- |
| `make scenario-fresh-composition` | `fresh-composition` | 906599561 | passed | The task was submitted, assigned to the enrolled Linux worker, executed, and stored as `ended`, exited with code 0 and a proven start. |
| `make scenario-worker-disk-loss` | `worker-disk-loss` | 607870444 | passed | Worker killed with the execution `started`. With the journal deleted, the identity kept, and the restart policy off, the worker logged `{"error":{"code":"precondition-failed","message":"the journal /var/lib/taskelith/worker/journal/journal.sqlite is missing","details":{...,"reason":"journal-loss"}}}` and exited by itself with code 1 (container state `exited 1`, started 2026-10-26T15:52:43Z); the identity stayed and no journal was created. After the data root was deleted and the worker `w7f623eb81c9be080f44b558d094919c7` revoked, a new worker enrolled under a new identity; the old execution stayed `started` with `uncertain` evidence, its assignment `accepted` and held, the task `pending`; a new task exited 0 on the new worker, whose assignment ended and released its reservation. |
| `make scenario-worker-kill` | `worker-kill` | 4046216523 | passed | Planned pause 16523 ms, measured 16762 ms; execution `started` just after the kill. The new worker process reconciled and stayed up, logging `worker.execution.recovered` and `worker.execution.uncertain`; `started` with `uncertain` evidence, result `pending`, the same in the journal. |
| `make scenario-worker-kill` | `worker-kill` | 349530197 | passed | Planned pause 5197 ms, measured 5379 ms; no execution yet. After the restart the task ran: `exited`, result `ended exited code 0 start-proven`, the same in the journal; no `worker.execution` events. |
| `make scenario-worker-kill` | `worker-kill` | 1875631402 | passed | Planned pause 6402 ms, measured 6606 ms; no execution yet; then as above, `exited`, `ended exited code 0 start-proven`. |
| `make scenario-worker-kill` | `worker-kill` | 23800 | passed | Planned pause 23800 ms, measured 24017 ms; execution already `exited`. The new worker process reconciled and stayed up, logging `worker.execution.record-removed`; `exited`, `ended exited code 0 start-proven`, the same in the journal. |

The measured interval runs from the submission's answer to the kill's return on the monotonic clock and includes the start of one Node.js process per timestamp, so it exceeds the planned pause by about 0.2 s.

Development runs before the evidence (same scripts, records discarded) also passed: at `d0479ea` the smoke (`make installation-smoke`), the disk loss, and the kill with seeds 7000, 13000, and 17000, and five records that `1cbf490` committed and this evidence replaced; at the fixes, the disk loss and the kill with seed 17000 (`started` with `uncertain` evidence).

The kill outcomes match the specs: a kill before any journaled command leaves nothing to reconcile and the redelivered command runs; a kill of a started execution whose supervisor is gone is reconciled as uncertain by the recovery table (worker runtime, "Uncertain recovery"; worker journal, "Uncertain started execution": the state stays `started`, the uncertainty is evidence); a kill after the exit was reported leaves the exit, and the record is removed. The disk loss matches the worker journal's "Journal missing with an identity" and "Whole data root lost" and launch reconciliation's "Attempts of a revoked worker" ("Started execution").

## Product bugs found

None. Every asserted behaviour matched the specs in every run.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-failure-scenarios-composition --strict` | valid |
| `make verify` | passed on 2026-10-26 at `07fce6d` before the evidence runs, and again with the records and this file; 1780 tests, 1778 passed, 2 skipped, 0 failed; coverage 99.26 % lines, 91.87 % branches, 98.89 % functions, and 99.27 %, 91.88 %, 98.89 % on the second run (earlier at `d0479ea` and `1cbf490`: 1770 tests, all passing but 2 skipped) |

## Independent review

### Pass 1

Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only, session `01a178dd-8a33-7410-bf46-9b9f637bac65`, reviewed `HEAD` `1cbf490`. Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`; the output header confirmed model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only. The SHA-256 snapshot of the worktree was `dcbe26024ddf4d95aac46c39632a13c22e8b64355d5998209f567f8dd68569ab` before and after the pass, unchanged. Findings: 0 Critical, 0 High, 3 Medium, 1 Low; all four were fixed in `07fce6d`.

| Finding | Severity | Resolution |
| --- | --- | --- |
| M1 `scripts/installation.sh:526`: the worker kill passed without proof that the restarted worker started; with an execution `exited` before the kill, a restarted worker that crashed at once still recorded `passed`. | Medium | `await_restarted_reconciliation` (`scripts/installation-scenarios.sh`) first waits for a new worker process: running, with a start time other than the killed one's, that logged `worker.reconciliation.planned` and `worker.contact.online` (`back_since`); then for the executions; then checks that the same process still runs (`running_since`). Tests: "an execution that had ended does not hide a restart that failed", "the killed process itself never counts as the restarted worker", and "an execution left running without uncertainty fails the kill check". Spec: requirement "Restarted worker proven". |
| M2 `scripts/installation.sh:430`: the disk loss waited only for a `journal-loss` log line and then stopped the worker itself, so a worker that logged the refusal and kept running passed. | Medium | `lose_journal` turns the container's restart policy off for the one start, waits until the container started after the kill has exited with a non-zero code (`exited_since`), requires the refusal in the logs since that start, and restores `unless-stopped`; it no longer stops the worker. Tests: "a worker that logs the refusal but keeps running fails the journal check", "a worker that exits without the refusal fails the journal check", and the passing case. |
| M3 `scripts/installation.sh:397`: `await_condition 120` was 120 probes plus 120 s of pauses, and a blocked probe had no timeout; the same for the 60 s waits. | Medium | `await_condition` keeps its deadline on the monotonic clock (`process.hrtime`), runs each probe through `bounded_probe` for at most the remaining time, and then kills the probe with its children (`kill_tree`). Tests: a slow probe and a blocked `sleep 30 | cat` probe both time out within the deadline. |
| L1 `scripts/installation.sh:521`: the recorded "SIGKILL $delay ms after the submission" was the requested pause, not the measured time, with an SQL check and Docker lookups between the pause and the kill. | Low | The container is looked up before the submission, the SQL read moved after the kill, and `detail` names the planned pause and the measured interval separately; [design.md](design.md) decision 10 and the evidence above describe both. |

The scenario steps moved from `scripts/installation.sh` to `scripts/installation-scenarios.sh`, which `installation.sh` sources, so that the tests run them against stubbed `compose`, `docker`, and `psql`.

### Pass 2

Pending.

## Limitations and remaining gates

- The Compose scenarios ran on one host, Apple Silicon with Docker Desktop; on Docker Desktop the Linux worker runs in a virtual machine. They have not been run on the x86_64 iMac in this change.
- The kill moment is reproducible from the seed, but what the worker is doing at that moment depends on the services' timing; on this host placement took more than ten seconds after the submission, so kills before about 7 to 11 s found no execution.
- The disk loss deletes the data root's files rather than replacing the volume; a host disk failure is modelled, not reproduced. A new journal incarnation without re-enrolment has no operator action in G2, so the scenario re-enrolls.
- The Linux supervisor crash windows run in 24b on the x86_64 iMac; multi-arch tooling for `make verify-linux-cgroup` is a follow-up.
- Remaining gates: independent review pass 2, integration by the coordinator, and the archive.
