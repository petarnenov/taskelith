## 1. Domain and journal

- [x] 1.1 `@taskelith/execution`: pressure causes, `worker-admission-pressure` refusal with causes, `admission-pressure-changed` fact, `OutboxBacklog`, port methods `recordAdmissionPressure` and `backlog`
- [x] 1.2 `@taskelith/worker-journal`: the two methods, the fact's identity, `readVolumeSpace`, `truncateBufferedLogs`
- [x] 1.3 Journal tests: pressure refusal fact, pressure changes with distinct identities, backlog counts and bytes; volume space and log truncation tests

## 2. Worker

- [x] 2.1 `AdmissionPressure`: causes in contract order, disk floor, backlog limit, unmeasurable limits, report on change and once per start, log truncation, watch loop, logs
- [x] 2.2 Intake: pressure refusal after the capacity limits
- [x] 2.3 Orchestrator: launches wait before W2 and before a retried request
- [x] 2.4 Worker start: build the pressure, refresh before connecting, run the watch
- [x] 2.5 Observation mapping: retryable refusal with causes, pressure change
- [x] 2.6 Tests: pressure unit tests, intake, orchestrator, worker start, observation mapping; existing tests take a fake pressure
- [x] 2.7 Control-plane integration test: the pressure observation and a fixed free space

## 3. Records and checks

- [x] 3.1 proposal.md, design.md, spec deltas (worker-runtime, worker-journal-adapter)
- [x] 3.2 `npm run openspec -- validate implement-worker-admission-pressure --strict`
- [x] 3.3 `make verify`
- [x] 3.4 Review pass 1 (Codex): no-follow and single-link truncation, cancellation before W2, one-instance retry test, 20e2 non-goals, D2 rationale
- [ ] 3.4b Further review passes, at most 3 in total (the session runs them)
- [ ] 3.5 Handoff to the coordinator
