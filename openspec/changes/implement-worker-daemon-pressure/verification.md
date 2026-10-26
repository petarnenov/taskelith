# Verification

Date: 2026-10-26. Author verification is recorded below; the independent review follows.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, split by the coordinator; this is 20e2, named in the Non-Goals of the archived `implement-worker-admission-pressure` design (20e). It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `a698f11` on `dev`.
- Scope: the daemon overhead causes (`daemon-memory`, `event-loop-lag`) on the 20e pressure path through injected sensors, and the log truncation and retry of a journal write refused for lack of space ([worker journal contract](../../../docs/contracts/worker-journal.md) section 7).
- Out of scope: 20d2 (`implement-worker-contact-and-offline`), the `unrecorded-process` scan, supervisor test hygiene, UI, a space retry of the launch writes (design, Risks), and any contract change.

### Values used

Every value comes from an existing document or constant; none was invented.

- `512 MiB` resident and event-loop lag `p99` at most `200ms`: [capacity reservation contract](../../../docs/contracts/capacity-reservation.md) section 8, [operational targets](../../../docs/operational-targets.md) section 1; `DAEMON_MEMORY_MEBIBYTES` in `apps/worker/src/settings.ts`.
- The sample window of `15s` and the histogram resolution of `20ms`: operational targets section 4 (`event-loop.lag`, "of each process over the sample window"); `SAMPLE_INTERVAL_MILLISECONDS` and `EVENT_LOOP_RESOLUTION_MILLISECONDS` in `@taskelith/node-observability`.
- The command redelivery backoff after a failed commit (`5s` doubling to `60s`, jitter): operational targets section 2; `TRANSPORT_LIMITS`, unchanged.
- The fact retry backoff (`5s` to `60s` with jitter): operational targets section 1, automatic retry row; `LAUNCH_RETRY_DELAY`.

## Evidence

- Revision: `9739dbe` for the author check (code as committed; verification.md drafted during the run).
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, Docker with the Compose services of `make verify`.
- Dependencies: no package added.
- Contracts: no change to `docs/contracts`, `docs/operational-targets.md`, `execution.asyncapi.json`, or the OpenAPI document; journal format 3 unchanged.

## Author self-check

- **Causes:** a resident set above `512 MiB` is `daemon-memory`, a lag above `200 ms` `event-loop-lag`, the limit itself is within it, an unreadable value is `unmeasurable-limit`, and the causes keep the contract order with the disk floor and the backlog (`admission-pressure.test.ts`).
- **Reporting:** a refresh reads the fake sensor and journals each change until the overhead subsides, and only the disk floor sheds logs (`admission-pressure.test.ts`); the started worker reports the overhead through the watch and runs the sensor until the stop (`worker-start.test.ts`).
- **Production sensor:** the resident set is read and a throwing read is a failure; the watch closes a lag window each interval and disables the histogram on stop (`daemon-overhead.test.ts`); the lag window reads the open window until the first close and then the last closed one (`node-observability.test.ts`).
- **Writes refused for space:** the adapter rolls back, calls the hook once, and answers a space refusal (`worker-journal.test.ts`); a W1 refused for space is not acknowledged and its redelivery is journaled (`command-intake.test.ts`); a W5s and W5e refused for space are derived again after backoffs of 7.5 s, 15 s, and 30 s and committed once, a recovered `not-started` is recovered again in the same round, and a stop ends the retries with the fact left in the record, none of them reported as a failure (`start-reconciliation.test.ts`).
- **Comment rule:** `npm run verify:comments` passes.
- **OpenSpec:** `npm run openspec -- validate implement-worker-daemon-pressure --strict` passes; every requirement is under 400 characters.
- **make verify:** passed at `9739dbe` (1656 tests, 0 failures; coverage 99.24% lines, 91.77% branches, 98.73% functions).

## Review passes

Pending.

## Limitations and remaining gates

- Remaining gates: the independent review, the coordinator's integration into `dev`, and the archive of this change.
- A launch write (W2 to W4, or a W6 after a launch's own seal) refused for space sheds the logs but is not retried in place; the next pass or the next start continues as before (design, Risks).
- The worker's event-loop lag is not published as a metric.
