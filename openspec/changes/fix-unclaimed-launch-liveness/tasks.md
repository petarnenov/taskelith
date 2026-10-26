## 1. Worker

- [x] 1.1 `ExecutionWatch.observe`: check the liveness of a record without a launch record past the launch's spawn deadline, through the existing liveness check
- [x] 1.2 Tests: no check before the deadline at a short poll interval; a supervisor lost before its claim is sealed past it and the intent launched again; a live supervisor at the check keeps the watch going
- [x] 1.3 Show that the tests fail on the base revision's code or on the thirty-poll bound of review pass 1
- [x] 1.4 Review pass 1: gate the check on the deadline, not a poll count; reword the scenario before the bound

## 2. Records and checks

- [x] 2.1 proposal.md, design.md, spec delta (worker-runtime)
- [x] 2.2 `npm run openspec -- validate fix-unclaimed-launch-liveness --strict`
- [x] 2.3 `make verify`
- [x] 2.4 Independent review (OpenCode, kimi-k3.1-pro): pass 1 (1 Medium, 1 Low, fixed), pass 2 clean
- [x] 2.5 Handoff to the coordinator
