## Scope and source

G2 work item 24, first part (24a), `run-g2-failure-scenarios-composition`, assigned by the coordinator on 2026-10-26: the fresh-composition happy path on arm64, a results recorder that 24b and 24c adopt, worker disk loss in Compose ending in re-enrolment, and an untimed `SIGKILL` of the worker container with a check of reconciliation. Excluded: the process-launch crash windows (24b, `run-g2-crash-windows`), partition and reconnect, cancellation races, stale generations, and duplicate delivery (24c, `run-g2-partition-and-races`), product code, and any contract change. Sources: [docs/g2-plan.md](/docs/g2-plan.md) item 24; the [harness archive](/openspec/changes/archive/2026-10-25-build-deterministic-test-harness/proposal.md); the [item 23b archive](/openspec/changes/archive/2026-10-26-compose-installation-end-to-end/proposal.md).

## Revision and environment

- Base: `origin/dev` at `f9ba7a5`. Branch `run-g2-failure-scenarios-composition`. Phase 1 (the recorder): `3f9777d`. Phase 2 (the scenarios): `d0479ea` and `1cbf490` (first evidence). Review pass 1 fixes: `07fce6d` and `6608301` (second evidence). Review pass 2 fixes: `8e1c4d8`, the commit every current evidence record names; the evidence runs ran on that tree, with only `results.jsonl` changed. The records of `d0479ea` and `07fce6d` were replaced.
- Host: Apple Silicon Mac, macOS 26.6.2 (build 25G83, Darwin 25.6.0), `arm64`; Node.js 24.22.1 from `.nvmrc`.
- Engine: Docker Desktop, Docker Engine 29.6.1 (client and server), server architecture `aarch64`, kernel 6.12.76-linuxkit. The images are built for linux/arm64.

## Author self-check and evidence check

- No product code, OpenAPI, AsyncAPI, JSON schema, contracts document, or npm dependency changes. Changed: `scripts/installation.sh` (scenario commands), the new `scripts/installation-scenarios.sh` (the scenario steps, sourced by `installation.sh`) and its test `test/installation-scenarios.test.ts`, `scripts/installation-smoke.ts` (the task is a parameter; the smoke behaves as before), the new `scripts/installation-scenario.ts` and its test, the test-only `infra/installation/scenarios/`, three `make` targets, and `docs/local-installation.md`.
- The scenarios delete only files inside the throwaway project's worker volume, from a one-off container of the worker image; they remove no volume other than their own project's (`down --volumes`, as the smoke does) and run no prune. After the runs, `docker volume ls` and `docker images` list nothing of `taskelith-<id>-installation-*`.
- No Toxiproxy and no second worker were added to the composition (24c).
- The recorder writes only when `TASKELITH_SCENARIO_RESULTS` is set, so `make verify` leaves the tree unchanged.

## Scenario evidence runs

Each command ran at `8e1c4d8` with `TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-failure-scenarios-composition/results.jsonl` on 2026-10-26, in this order, each on a fresh throwaway project that it removed before it recorded the pass; every one exited 0. The records are in [results.jsonl](results.jsonl). The last kill ran with `TASKELITH_TEST_SEED=23800`, chosen so that the pause falls after the execution's end, the case of review finding M1; the other seeds are random.

| Command | Scenario | Seed | Outcome | Observed |
| --- | --- | --- | --- | --- |
| `make scenario-fresh-composition` | `fresh-composition` | 4204782353 | passed | The task was submitted, assigned to the enrolled Linux worker, executed, and stored as `ended`, exited with code 0 and a proven start. |
| `make scenario-worker-disk-loss` | `worker-disk-loss` | 305919345 | passed | Worker killed with the execution `started`. With the journal deleted, the identity kept, and the restart policy off, the worker logged `{"error":{"code":"precondition-failed","message":"the journal /var/lib/taskelith/worker/journal/journal.sqlite is missing","details":{...,"reason":"journal-loss"}}}` and exited by itself with code 1 (container state `exited 1`, started 2026-10-26T16:10:00Z); the identity stayed and no journal was created. After the data root was deleted and the worker `weec736f1f861e17370b0668d0c46b7fd` revoked, a new worker enrolled under a new identity; the old execution stayed `started` with `uncertain` evidence, its assignment `accepted` and held, the task `pending`; a new task exited 0 on the new worker, whose assignment ended and released its reservation. |
| `make scenario-worker-kill` | `worker-kill` | 3534000135 | passed | Planned pause 135 ms, measured 292 ms; no execution yet. The new worker process reconciled and stayed up and ran the task: `exited`, result `ended exited code 0 start-proven`, the same in the journal; event `worker.execution.record-removed`. |
| `make scenario-worker-kill` | `worker-kill` | 893362200 | passed | Planned pause 12200 ms, measured 12391 ms; execution `started` just after the kill. The new process logged `worker.execution.recovered` and `worker.execution.uncertain`; `started` with `uncertain` evidence, result `pending`, the same in the journal. |
| `make scenario-worker-kill` | `worker-kill` | 817311872 | passed | Planned pause 11872 ms, measured 12048 ms; execution `authorized` just after the kill, between the grant and the start. The new process logged `worker.execution.recovered` and `worker.execution.uncertain`; `authorized` with `uncertain` evidence, result `pending`, the same in the journal. |
| `make scenario-worker-kill` | `worker-kill` | 23800 | passed | Planned pause 23800 ms, measured 23978 ms; execution already `exited`. The new process reconciled and stayed up, logging `worker.execution.record-removed`; `exited`, `ended exited code 0 start-proven`, the same in the journal. |

The measured interval runs from the submission's answer to the kill's return on the monotonic clock and includes the start of one Node.js process per timestamp, so it exceeds the planned pause by about 0.2 s.

Development runs before the evidence (same scripts, records discarded or replaced) also passed: at `d0479ea` the smoke (`make installation-smoke`), the disk loss, the kill with seeds 7000, 13000, and 17000, and the five records of `1cbf490`; at `07fce6d` the disk loss, the kill with seed 17000, and the six records of `6608301`.

The kill outcomes match the specs: a kill before any journaled command leaves nothing to reconcile and the redelivered command runs; a kill of an authorized or started execution whose supervisor is gone is reconciled as uncertain by the recovery table (worker runtime, "Uncertain recovery"; worker journal, "Uncertain started execution": the state stays `started`, the uncertainty is evidence); a kill after the exit was reported leaves the exit, and the record is removed. The disk loss matches the worker journal's "Journal missing with an identity" and "Whole data root lost" and launch reconciliation's "Attempts of a revoked worker" ("Started execution").

## Product bugs found

None. Every asserted behaviour matched the specs in every run.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-failure-scenarios-composition --strict` | valid |
| `make verify` | passed on 2026-10-26 at `8e1c4d8` before the evidence runs, and again with the records and this file; 1786 tests, 1784 passed, 2 skipped, 0 failed; coverage 99.27 % lines, 91.88 % branches, 98.89 % functions, and 99.26 %, 91.87 %, 98.89 % on the second run (earlier: 1770 tests at `d0479ea` and `1cbf490`, 1780 at `07fce6d` and `6608301`, all passing but 2 skipped) |

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

Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only, session `01a178f1-8fb7-7a63-8a3b-47d92ffa3483`, reviewed `HEAD` `6608301`. The SHA-256 snapshot of the worktree was `7c1039754083075762a3e2f653a9038e4a1aeb7a4df66555699a1facbdf53242` before and after the pass, unchanged. It confirmed pass 1's M1 (`scripts/installation-scenarios.sh:188`, `:303`), M2 (`:216`), M3 (`:98`, `:113`), and L1 (`:320`, `:323`, `:343`) as resolved. New findings: 0 Critical, 0 High, 2 Medium, 0 Low; both were fixed in `8e1c4d8`.

| Finding | Severity | Resolution |
| --- | --- | --- |
| M4 `scripts/installation-scenarios.sh:305`, `:308`: the reconciliation could take 180 s in total, 60 s for the new worker process and then a fresh 120 s for the executions, past the delta spec's two-minute bound. | Medium | `await_restarted_reconciliation` takes the restart's moment on the monotonic clock, taken just before `compose start`; both phases wait through the new `await_until` against one deadline, 120 s from the restart, and the first phase also against its own 60 s, whichever comes first. `await_condition` is now `await_until` from the current time. Test: "the restart and the reconciliation share one deadline from the restart", where each phase meets its own bound but the total exceeds it (fails), with a control run whose total fits (passes). Spec: the untimed kill counts two minutes from the restart, with the scenario "Phases within bounds, total over two minutes". |
| M5 `scripts/installation-scenarios.sh:276`, `:342`: a failed final cleanup recorded nothing, since `remove_throwaway` disarmed the failure trap before it removed the project and before the pass was recorded. | Medium | Both scenarios end with the new `finish_passed`: step `cleaning up`, `remove_project` (a failure fails the scenario through the armed trap), the `passed` record, and only then the trap's removal. `remove_throwaway` is unchanged for the smoke, `verify`, and other callers. Tests: for each of the disk loss and the kill, a full run against stubs that records `passed` only after the cleanup, and a run whose cleanup fails and records `failed: failed while cleaning up`. |

While adding these tests, a stubbed run that hit an unbound variable exited 0 without a record: bash passed status 0 to the `EXIT` trap after the expansion error under `set -u`. Since `finish_passed` disarms the trap, `finish_scenario` now treats any run of the trap as a failure (status 1 when 0 was passed), records `failed` with the step, and removes the project; test "an error the scenario did not expect is recorded as failed".

### Pass 3

Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only, session `01a178ff-ee7c-7b30-ae4a-938a9a286e75`, reviewed `HEAD` `c615c98`, with the same invocation as pass 1. The SHA-256 snapshot of the worktree was `1fa84adf6cbd472b730d1643eb859207f2f93def359a12fa29692a1e345673ae` before and after the pass, unchanged. It confirmed M1 to M5 and L1 as resolved, including the shared reconciliation deadline, the `failed` record of a failed cleanup, and the trap fix in `8e1c4d8`, which the prompt named. New findings: 0 Critical, 0 High, 0 Medium, 0 Low. The reviewer did not run the Docker scenarios or `make verify`; the recorded runs remain author evidence. No fixes followed this pass, so the change has no unreviewed fixes.

## Limitations and remaining gates

- The Compose scenarios ran on one host, Apple Silicon with Docker Desktop; on Docker Desktop the Linux worker runs in a virtual machine. They have not been run on the x86_64 iMac in this change.
- The kill moment is reproducible from the seed, but what the worker is doing at that moment depends on the services' timing; on this host placement took more than ten seconds after the submission, so kills before about 7 to 11 s found no execution.
- The disk loss deletes the data root's files rather than replacing the volume; a host disk failure is modelled, not reproduced. A new journal incarnation without re-enrolment has no operator action in G2, so the scenario re-enrolls.
- The Linux supervisor crash windows run in 24b on the x86_64 iMac; multi-arch tooling for `make verify-linux-cgroup` is a follow-up.
- Remaining gates: integration by the coordinator and the archive.
