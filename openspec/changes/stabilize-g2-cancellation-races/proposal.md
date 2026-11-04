## Why

The G2 cancellation race scenarios e and h (`test/g2-cancellation-races.test.ts:238` and `:398`) are intermittent and on `make verify`'s known-flake list. Under load they fail waiting for the execution's start: e with `the start not met within 20000 ms` (`:251`) and h with `the authorized start not met within 20000 ms` (`:404`). The control plane's apply of `execution.started` lost five serialization races in a row (`postgres.serialization.exhausted`), and the observation was delivered again about 15 s later, past the scenarios' wait.

Each observation's SERIALIZABLE transaction wrote the worker's `workers` row to record contact (`apps/control-plane/src/application/observation-service.ts:79` and `:163` at the base `6dab1d26`, `packages/adapters/postgres/src/observation-repositories.ts:100`). Heartbeats write the same row, every 500 ms in the scenarios (`test/g2-scenarios/scenario-worker.ts:28`, ten-second interval at `TIME_SCALE` 20), so a busy worker's observations kept losing to its own heartbeats. The PostgreSQL log of one full run of the Node.js test files had 106 `concurrent update` serialization failures, 59 of them on `UPDATE workers SET reachable = true, last_contact_at = ...`, more than any other statement.

The coordinator (Niki) chose a product fix (option 1) on 2026-11-04.

## What Changes

- `ObservationService.apply` records an observation's contact in a transaction of its own after the observation's transaction committed, instead of inside it. That transaction authenticates the producer again as a heartbeat does (`recordCurrentContact`, shared with `HeartbeatService`), so a journal retired or a worker revoked meanwhile gets no contact. Its failure is logged as `execution.observation.contact-unrecorded` and does not fail or redeliver the observation.
- The not-consumed path keeps its own contact transaction, unchanged.
- Tests: a deterministic PostgreSQL test in which a heartbeat's transaction holds the worker row while an observation is applied, which failed at the base; the monotonic contact in memory and in PostgreSQL; the logged failure; and the retired or revoked worker that stays unreachable.
- `observation-consumption`: "One transaction per observation" no longer lists contact, and "First contact" states the separate, re-authenticated, never-backward contact and its logged failure, with five added scenarios.
- `worker-contact`: "Lost contact" makes an observation's contact best effort, as "First contact" states, with a qualified "Contact again" and an added scenario for a failed contact.

## Capabilities

### New Capabilities

### Modified Capabilities

- `observation-consumption`: requirements "One transaction per observation" and "First contact".
- `worker-contact`: requirement "Lost contact".

## Impact

`@taskelith/control-plane`, a private workspace package. An observation now takes two transactions, the second short. No migration, contract, or configuration change.
