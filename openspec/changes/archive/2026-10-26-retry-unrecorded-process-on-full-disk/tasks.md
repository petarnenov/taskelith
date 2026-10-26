## 1. Worker

- [x] 1.1 `LaunchOrchestrator`: keep the start's unrecorded processes and journal the due ones on each pass through `HeldWrites`
- [x] 1.2 Test: a journal whose commits fail with `SQLITE_FULL` twice and then commit; the report is held back within the backoff and journaled once with its identity

## 2. Records and checks

- [x] 2.1 proposal.md, design.md, spec delta (worker-runtime)
- [x] 2.2 `npm run openspec -- validate retry-unrecorded-process-on-full-disk --strict`
- [x] 2.3 `make verify`
- [ ] 2.4 Independent review (OpenCode, kimi-k3.1-pro)
- [ ] 2.5 Handoff to the coordinator
