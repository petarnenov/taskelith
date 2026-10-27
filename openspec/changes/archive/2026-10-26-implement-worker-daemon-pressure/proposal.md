## Why

[G2 work plan](/docs/g2-plan.md) item 20 builds the worker application, split by the coordinator into changes; this is 20e2, named in the Non-Goals of the archived `implement-worker-admission-pressure` design (20e). The worker reports admission pressure for its disk floor and journal backlog, but not for its own overhead, and a journal write refused for lack of space (`SQLITE_FULL`) neither sheds the buffered logs nor retries an execution fact: the watch of that execution ends until the next start. The [capacity reservation contract](/docs/contracts/capacity-reservation.md) section 8 ("Daemon overhead") and the [worker journal contract](/docs/contracts/worker-journal.md) section 7 ("Full disk") require both.

## What Changes

- **Daemon overhead.** Each pressure refresh reads the daemon's resident set size and the p99 event-loop delay of its sample window through an injected sensor; above `512 MiB` it reports `daemon-memory`, above `200ms` `event-loop-lag`, through the 20e pressure path, so offers are refused and launches wait until the overhead subsides.
- **Unmeasurable overhead**, including an event-loop window without a sample, counts as exceeded and is reported as `unmeasurable-limit`.
- **Production sensor.** `process.memoryUsage.rss()` and Node's event-loop delay histogram at a `20ms` resolution, whose window closes every `15s` (operational targets section 4).
- **Writes refused for lack of space.** The journal adapter tells the worker of each one, and the worker empties the buffered logs under `worker/logs/`. A command is not acknowledged, so the broker redelivers it after the failed-commit backoff; an execution fact stays in its record, and the watch or the orchestrator derives it again and retries after a backoff of `5s` to `60s` with jitter; a launch write (W2 to W4) is retried unchanged with the same backoff before the request, the grant's use, or the supervisor start it precedes.
- No contract, AsyncAPI, OpenAPI, or journal format change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: pressure reporting with the daemon overhead, the daemon overhead limit, and journal writes refused for lack of space.
- `worker-journal-adapter`: the hook for writes refused for lack of space and their failure reason.

## Impact

- `apps/worker`: `AdmissionPressure` takes a `DaemonOverheadSensor`; a new `ProcessDaemonOverhead` adapter; the worker start runs it and sheds the logs on a refused write; `ExecutionWatch` and `LaunchOrchestrator` retry a fact refused for space through `space-retry.ts`.
- `@taskelith/execution`: `isSpaceRefusal` and `SPACE_REFUSAL_REASON` beside the journal port.
- `@taskelith/worker-journal`: the `onSpaceRefused` hook of the journal and the worker root.
- `@taskelith/node-observability`: `EventLoopLagWindow`, sharing the p99 reading with `EventLoopLagMonitor`.
- `apps/control-plane`: its worker integration test fixes the daemon overhead.
- No new dependency.
