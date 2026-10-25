## 1. Harness package

- [x] 1.1 Add the private workspace package `@taskelith/testing` and list it in the workspaces and the architecture's package layout.
- [x] 1.2 Add `SimulatedHost` with the wall, deadline, and uptime clocks.
- [x] 1.3 Add `SeededRandom`, `seedFromEnvironment`, `rerunHint`, and the sequential and seeded identifier sources.
- [x] 1.4 Add `CrashPoints`, `SimulatedCrash`, and arming through `TASKELITH_CRASH_POINT`.
- [x] 1.5 Add `ScenarioProcess` with group kill, pause, and resume.
- [x] 1.6 Add the `Toxiproxy` client over `fetch`.
- [x] 1.7 Reject imports of the harness from product sources in the boundary check.

## 2. Services

- [ ] 2.1 Add the digest-pinned Toxiproxy service to the item 9 Compose project, with its API on loopback only.
- [ ] 2.2 Add the integration test that partitions PostgreSQL and NATS through Toxiproxy and observes failure and recovery.
- [ ] 2.3 Update the Toxiproxy row of the dependency register.

## 3. Verification and review

- [ ] 3.1 Run `make verify` and record the results.
- [ ] 3.2 Obtain independent review (Claude Code, `claude-fable-5-1`, medium) and record results.
