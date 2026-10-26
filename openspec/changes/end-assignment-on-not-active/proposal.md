## Why

The [capacity reservation contract](../../../docs/contracts/capacity-reservation.md) section 8 (line 151) says the worker ends an acknowledged assignment locally when it receives an assignment-ended command or a launch authorization rejection with `assignment-not-active`, and stops counting it. The worker ended an assignment only on `execution.assignment.end`: after an `assignment-not-active` rejection it kept counting the assignment against its slots and reported it as `accepted` in its inventory until the end command arrived.

## What Changes

- **Local end.** A journaled launch rejection with `assignment-not-active` ends its assignment in the journal snapshot, exactly as a journaled assignment-ended command does: the assignment is no longer counted, never launched again, and reported as `ended`.
- **Domain rule.** `endsAssignment(reason)` in the execution domain names the rejection that ends an assignment; the SQLite worker journal applies it when it reads the snapshot.
- **Late end.** An `execution.assignment.end` that arrives after the local end is journaled once, changes nothing, and publishes nothing.
- **Tests and spec.** Regression tests for the local end, the late end command, and a reopen; a worker-runtime requirement for the local end.

No contract, wire message, observation, or journal format changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: a requirement that a launch rejection with `assignment-not-active` ends its assignment locally.

## Impact

- `packages/modules/execution/src/domain/launch-rejection.ts`, `packages/modules/execution/src/index.ts`, `packages/adapters/worker-journal/src/journal-reads.ts`.
- Tests in `apps/worker/test/command-intake.test.ts` and `packages/adapters/worker-journal/test/worker-journal.test.ts`.
- Out of scope: the control plane's handling of `assignment-not-active` (launch-reconciliation: only recorded), and every other rejection reason.
