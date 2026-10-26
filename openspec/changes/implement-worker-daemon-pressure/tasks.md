## 1. Journal

- [x] 1.1 `@taskelith/execution`: `isSpaceRefusal` and `SPACE_REFUSAL_REASON` beside the journal port
- [x] 1.2 `@taskelith/worker-journal`: the `onSpaceRefused` hook of the connection, the journal hooks, and the worker root options
- [x] 1.3 Journal test: a refusal for space calls the hook once and is a space refusal

## 2. Worker

- [x] 2.1 `@taskelith/node-observability`: `EventLoopLagWindow`, sharing the p99 reading with `EventLoopLagMonitor`
- [x] 2.2 `AdmissionPressure`: `DaemonOverheadSensor`, `PressureReadings`, the `daemon-memory` and `event-loop-lag` limits, unmeasurable overhead
- [x] 2.3 `ProcessDaemonOverhead`: the resident set and the lag window, closed every 15 seconds until the stop
- [x] 2.4 Worker start: the daemon sensor and its watch; the hook sheds the buffered logs through `shedBufferedLogs`
- [x] 2.5 `ExecutionWatch`: a fact refused for space is derived again after the backoff
- [x] 2.6 Tests: limits and causes, refresh with a fake sensor, the worker start, the production sensor, the lag window, the space retries of the watch, a W1 refused for space; the control-plane integration test fixes the sensor

## 3. Records and checks

- [x] 3.1 proposal.md, design.md, spec deltas (worker-runtime, worker-journal-adapter)
- [x] 3.2 `npm run openspec -- validate implement-worker-daemon-pressure --strict`
- [x] 3.3 `make verify`
- [x] 3.4 Review pass 1 (OpenCode kimi-k3.1-pro): space retry of the orchestrator's facts at start and after a launch's own seal, an empty or unreadable lag window as unmeasurable, the histogram enabled only by the watch
- [x] 3.4b Review pass 2 (OpenCode kimi-k3.1-pro): space retry of W2, W3, and the W4 before the supervisor starts
- [ ] 3.4c Review pass 3
- [ ] 3.5 Handoff to the coordinator
