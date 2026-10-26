## Context

20e (`implement-worker-admission-pressure`, archived) built the worker's admission pressure: `AdmissionPressure.refresh()` measures the limits, journals `worker.admission-pressure.changed` on a change, and is asked at start, every 5 seconds, before an offer is accepted, and before each launch authorization request. Its design names this change in its Non-Goals: the daemon overhead causes (`daemon-memory`, `event-loop-lag`) with injected sensors, and the retry with log truncation of a write refused for lack of space. The causes and the wire messages already exist (`ADMISSION_PRESSURE_CAUSES`, `execution.asyncapi.json`).

## Goals / Non-Goals

**Goals:** the daemon overhead causes on the 20e path, deterministic through injected sensors; log truncation on every journal write refused for lack of space; the retry of such a write for commands and execution facts.

**Non-Goals:**

- Any contract, AsyncAPI, OpenAPI, or journal format change; configuration variables for the limits.
- Contact, heartbeat, offline mode, reconnect inventory (20d2); `unrecorded-process`; supervisor test hygiene; UI.
- A space retry of the launch writes W2 to W4 and of the W6 a launch writes after its own seal (see Risks).
- Publishing the worker's `event-loop.lag` as a metric.

## Decisions

### D1: one sensor port, read on each refresh

`AdmissionPressure` takes a `DaemonOverheadSensor` with `residentBytes()` and `eventLoopLagMilliseconds()`, each a `Result`. A refresh reads both with the volume and the backlog into `PressureReadings`, and `pressureCauses` maps a value above its limit to its cause and a failure to `unmeasurable-limit`, in contract order. The limits are `DAEMON_MEMORY_MEBIBYTES` (512 MiB, already the daemon's share of host memory in the declared capacity) and 200 ms; at the limit is within it ("at most", capacity reservation section 8). Intake and launches need no change: any cause refuses an offer and holds a launch (20e D3 and D5).

### D2: the event-loop window

The contract limits the p99 of the event-loop delay; the operational targets (section 4, `event-loop.lag`) define it as the p99 "of each process over the sample window", sampled every `15s` with a histogram that resolves `20ms`. `EventLoopLagWindow` (node-observability) keeps the p99 of the last closed window, so every refresh within 15 seconds reads the same value; until the first window closes the open one stands in. `ProcessDaemonOverhead.watch` closes a window every 15 seconds and disables the histogram when the worker stops. As in `EventLoopLagMonitor`, the delay is what exceeds the resolution, and a window with no timer tick yet reads zero, so a worker that just started does not report `unmeasurable-limit`.

- **Alternative:** reset the window at each refresh. Refreshes come at irregular times (each offer, each launch request), so the window, and the value, would depend on traffic.

### D3: the resident set

`process.memoryUsage.rss()` is the daemon's own resident set; supervisors and agent processes are separate processes, so they are excluded as the operational targets require. A read that throws is a failure and so `unmeasurable-limit`.

### D4: the adapter tells, the worker sheds

`JournalConnection` already rolls back a write refused with `SQLITE_FULL` and answers the root failure `disk-full`. It now also calls the `onSpaceRefused` hook (journal hooks and worker root options). The worker start passes one that empties `worker/logs/` with 20e's `truncateBufferedLogs` and logs the result through `shedBufferedLogs`, the same function the disk floor uses. One hook covers every write: commands, facts, pressure, and launch writes.

`isSpaceRefusal` beside the journal port names the failure reason (`disk-full`), so the application can tell a refusal for space from a stopped journal without reading adapter details.

### D5: retries

- **A command** (W1) refused for space is not acknowledged: intake answers the failure, and the consumer naks it with the redelivery backoff after a failed commit (operational targets section 2: doubling from `5s` to `60s`, up to a quarter shorter by jitter). Nothing new is needed.
- **An execution fact** refused for space (W5s, W5e, W6 found by the watch or by recovery, `uncertain`, and the evidence beside them) no longer ends the watch. The watch backs off with `launchRetryDelay` (initial `5s`, maximum `60s`, with jitter; the automatic retry row of the operational targets) and derives the fact again: `observe` reads the record again, and `reconcile` asks the recovery table again in the same round. The backoff grows with consecutive refusals and resets after a poll without one. A refusal is logged as `worker.journal.space-refused` and not reported as a failure. A stop ends the retries; the fact stays in the record, and the next start derives it again.
- **The pressure fact** refused for space is retried by the next refresh (20e).

Both backoffs are 5 seconds to 60 seconds with jitter; the contract names no other.

## Risks / Trade-offs

- **Launch writes are not retried for space.** A refused W2 ends the launch, and the next pass starts it again with a new execution, as before; a refused W3 or W4, or a W6 after a launch's own seal, ends the launch, and the next start reconciles the execution. Their logs are still shed. A follow-up can add a retry if the coordinator wants one.
- **The first 15 seconds** read the open window, which holds only the delay measured since start.
- **The test host:** a busy control-plane test process could exceed the overhead, so its worker integration test fixes the sensor, as 20e fixed the free space.
- **Rollback:** nothing is persisted; the worker package is unreleased.
