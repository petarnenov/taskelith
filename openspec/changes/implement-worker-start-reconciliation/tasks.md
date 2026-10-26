## 1. Contract and journal

- [x] 1.1 AsyncAPI 0.5.0: `boot-changed` and `namespace-ended` exit evidence, wire contracts doc, contract test
- [x] 1.2 Journal format 3: `expired` outcome, terminal sequence, record removal, termination unproven, cancellation not applied; migration 2 to 3 chained after 1 to 2
- [x] 1.3 Journal tests: migration from format 2, expiry, removable records, new facts
- [ ] 1.4 docs/contracts/worker-journal.md: format 3, `expired`, recovery table row, removal query

## 2. Worker

- [x] 2.1 Mapping of `termination-unproven` and `cancellation.not-applied`, all exit evidence
- [x] 2.2 Supervisor: survivors carry their process group; reported facts read the event log
- [x] 2.3 Port: `recover(round)`, `retry`, `remove()`, record listing
- [x] 2.4 `ExecutionWatch`: observe with liveness checks, reconcile on start
- [x] 2.5 Orchestrator: inherited executions reconciled once, seal, resume, removal, leftovers, logs
- [x] 2.6 Deadline cycle and expired answer: W3 `expired`, same execution, `reportsNotStarted`
- [x] 2.7 Existing tests updated (orchestrator, supervision adapter, observations)
- [ ] 2.8 New tests: start reconciliation (seal, recover, retry, adopt, uncertain once), liveness, removal, leftovers, logs, not-applied and survivors through the watch, supervisor termination survivors
- [ ] 2.9 Worker start wiring test with logger and records

## 3. Records and checks

- [ ] 3.1 proposal.md, design.md (coordinator decisions Q1 A, Q2 A, journal format approved), spec deltas (worker-runtime, worker-journal-adapter, execution-wire-contracts, worker-journal contract spec if any)
- [ ] 3.2 `make dependency-inventory` (worker now depends on @taskelith/observability)
- [ ] 3.3 `make verify`
- [ ] 3.4 OpenCode review (kimi-k3.1-pro#high), at most 3 passes
- [ ] 3.5 verification.md and handoff to Niki

## State for a context reset

- Branch `implement-worker-start-reconciliation`, worktree `../taskelith-worktrees/implement-worker-start-reconciliation`.
- Scope per coordinator (2026-10-26): Q1 A (heartbeat, status watcher, offline mode, inventory on reconnect, first-connect change go to 20d2 `implement-worker-contact-and-offline`); Q2 A (unrecorded-process is a separate follow-up); journal format changes approved with a migration and a spec delta.
- Per-file test runs pass: worker app, worker-journal, contracts. Run with `node --experimental-strip-types --test --test-reporter=tap --test-timeout=20000 <file>` after `npm run -s build`.
