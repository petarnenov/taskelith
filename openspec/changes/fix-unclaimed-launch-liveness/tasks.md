## 1. Worker

- [x] 1.1 `ExecutionWatch.observe`: check the liveness of a record without a launch record after `UNCLAIMED_LIVENESS_POLLS`, through the existing liveness check
- [x] 1.2 Tests: no check before the bound; a supervisor lost before its claim is sealed after it and the intent launched again; a live supervisor at the check keeps the watch going
- [x] 1.3 Show that the two tests after the bound fail on the base revision's code

## 2. Records and checks

- [x] 2.1 proposal.md, design.md, spec delta (worker-runtime)
- [x] 2.2 `npm run openspec -- validate fix-unclaimed-launch-liveness --strict`
- [x] 2.3 `make verify`
- [ ] 2.4 Independent review (OpenCode, kimi-k3.1-pro)
- [ ] 2.5 Handoff to the coordinator
