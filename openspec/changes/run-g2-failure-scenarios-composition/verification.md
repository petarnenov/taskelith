## Scope and source

G2 work item 24, first part (24a), `run-g2-failure-scenarios-composition`, assigned by the coordinator on 2026-10-26: the fresh-composition happy path on arm64, a results recorder that 24b and 24c adopt, worker disk loss in Compose ending in re-enrolment, and an untimed `SIGKILL` of the worker container with a check of reconciliation. Excluded: the process-launch crash windows (24b, `run-g2-crash-windows`), partition and reconnect, cancellation races, stale generations, and duplicate delivery (24c, `run-g2-partition-and-races`), product code, and any contract change. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 24; the [harness archive](../archive/2026-10-25-build-deterministic-test-harness/proposal.md); the [item 23b archive](../archive/2026-10-26-compose-installation-end-to-end/proposal.md).

## Revision and environment

- Base: `origin/dev` at `f9ba7a5`. Branch `run-g2-failure-scenarios-composition`. Phase 1 (the recorder): `3f9777d`. Phase 2 (the scenarios): `d0479ea`, the commit every evidence record names; the evidence runs ran on that tree, with only `results.jsonl` added.
- Host: Apple Silicon Mac, macOS 26.6.2 (build 25G83, Darwin 25.6.0), `arm64`; Node.js 24.22.1 from `.nvmrc`.
- Engine: Docker Desktop, Docker Engine 29.6.1 (client and server), server architecture `aarch64`, kernel 6.12.76-linuxkit. The images are built for linux/arm64.

## Author self-check and evidence check

- No product code, OpenAPI, AsyncAPI, JSON schema, contracts document, or npm dependency changes. Changed: `scripts/installation.sh` (scenario commands), `scripts/installation-smoke.ts` (the task is a parameter; the smoke behaves as before), the new `scripts/installation-scenario.ts` and its test, the test-only `infra/installation/scenarios/`, three `make` targets, and `docs/local-installation.md`.
- The scenarios delete only files inside the throwaway project's worker volume, from a one-off container of the worker image; they remove no volume other than their own project's (`down --volumes`, as the smoke does) and run no prune. After the runs, `docker volume ls` and `docker images` list nothing of `taskelith-<id>-installation-*`.
- No Toxiproxy and no second worker were added to the composition (24c).
- The recorder writes only when `TASKELITH_SCENARIO_RESULTS` is set, so `make verify` leaves the tree unchanged.

## Scenario evidence runs

Each command ran with `TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-failure-scenarios-composition/results.jsonl` on 2026-10-26, in this order, each on a fresh throwaway project that it removed at the end; every one exited 0. The records are in [results.jsonl](results.jsonl).

| Command | Scenario | Seed | Outcome | Observed |
| --- | --- | --- | --- | --- |
| `make scenario-fresh-composition` | `fresh-composition` | 4164776517 | passed | The task was submitted, assigned to the enrolled Linux worker, executed, and stored as `ended`, exited with code 0 and a proven start. |
| `make scenario-worker-disk-loss` | `worker-disk-loss` | 687943406 | passed | Worker killed with the execution `started`. With the journal deleted and the identity kept, the worker logged `{"error":{"code":"precondition-failed","message":"the journal /var/lib/taskelith/worker/journal/journal.sqlite is missing","details":{...,"reason":"journal-loss"}}}` and stopped; the identity stayed and no journal was created. After the data root was deleted and the worker revoked (`{"revoked":"w9292c8b38a3733364a7db87ccd2c0b51"}`), a new worker enrolled under a new identity; the old execution stayed `started` with `uncertain` evidence, its assignment `accepted` and held, the task `pending`; a new task exited 0 on the new worker, whose assignment ended and released its reservation. |
| `make scenario-worker-kill` | `worker-kill` | 2847360482 | passed | Kill 10482 ms after the submission, before any execution; after the restart the task ran: execution `exited`, result `ended exited code 0 start-proven`, the same in the journal; no `worker.execution` events after the restart. |
| `make scenario-worker-kill` | `worker-kill` | 1747017005 | passed | Kill 17005 ms after the submission, execution `started`; after the restart the worker logged `worker.execution.recovered` (fact `uncertain`) and `worker.execution.uncertain` ("the old namespace may still run"); the control plane held `started` with `uncertain` evidence, result `pending`, the same in the journal (`started`, uncertain). |
| `make scenario-worker-kill` | `worker-kill` | 2376698795 | passed | Kill 23795 ms after the submission, execution already `exited`; after the restart the worker logged `worker.execution.record-removed`; `exited`, result `ended exited code 0 start-proven`, the same in the journal. |

Development runs before the evidence runs (same scripts, records discarded) also passed: the smoke on this arm64 host (`make installation-smoke`), the disk loss once, and the kill with seeds 7000 (no execution yet, then `exited`), 13000, and 17000 (both `started` with `uncertain` evidence).

The three kill outcomes match the specs: a kill before any journaled command leaves nothing to reconcile and the redelivered command runs; a kill of a started execution whose supervisor is gone is reconciled as uncertain by the recovery table (worker runtime, "Uncertain recovery"; worker journal, "Uncertain started execution": the state stays `started`, the uncertainty is evidence); a kill after the exit was reported leaves the exit, and the record is removed. The disk loss matches the worker journal's "Journal missing with an identity" and "Whole data root lost" and launch reconciliation's "Attempts of a revoked worker" ("Started execution").

## Product bugs found

None. Every asserted behaviour matched the specs in every run.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-failure-scenarios-composition --strict` | valid |
| `make verify` | passed on 2026-10-26 at `d0479ea` before the evidence runs (coverage 99.26 % lines, 91.86 % branches, 98.89 % functions) and again with the records and this file (99.26 %, 91.87 %, 98.89 %); each time 1770 tests, 1768 passed, 2 skipped, 0 failed |

## Independent review

Pending.

## Limitations and remaining gates

- The Compose scenarios ran on one host, Apple Silicon with Docker Desktop; on Docker Desktop the Linux worker runs in a virtual machine. They have not been run on the x86_64 iMac in this change.
- The kill moment is reproducible from the seed, but what the worker is doing at that moment depends on the services' timing; on this host placement took more than ten seconds after the submission, so kills before about 11 s found no execution.
- The disk loss deletes the data root's files rather than replacing the volume; a host disk failure is modelled, not reproduced. A new journal incarnation without re-enrolment has no operator action in G2, so the scenario re-enrolls.
- The Linux supervisor crash windows run in 24b on the x86_64 iMac; multi-arch tooling for `make verify-linux-cgroup` is a follow-up.
- Remaining gates: the independent review, integration by the coordinator, and the archive.
