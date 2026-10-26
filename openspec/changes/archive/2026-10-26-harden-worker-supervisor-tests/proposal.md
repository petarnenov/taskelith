## Why

The [start reconciliation change](../archive/2026-10-26-implement-worker-start-reconciliation/verification.md) left two follow-ups. A failed assertion in the macOS real-process supervisor tests leaves the supervisor child running, so `make verify` hung for about two hours instead of failing. And the journal port's `recordExit` still accepts the recovery evidence `boot-changed` or `namespace-ended` with a known exit status, although the supervisor record reader and the wire contract reject that combination.

## What Changes

- **Reaped real-process tests.** The macOS supervisor tests and the privileged Linux cgroup tests kill, after each test, every live process they started, directly or through a supervisor, found by a marker on its command line, and each test has a run-time bound. A failed assertion or a wait that never ends then fails the test instead of hanging the suite.
- **Narrowed exit types.** `ExecutionExit`, which the journal port's `recordExit` takes, and the supervisor's `ExitRecord` become unions in which `boot-changed` and `namespace-ended` carry only status `unknown`, as the supervisor's `readExit` already requires. The reader builds the narrowed type. Type-level negative tests (`@ts-expect-error`) keep the combination unrepresentable.

No runtime behaviour, contract, schema, or wire message changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-supervisor`: the exit record type and the real-process tests.
- `worker-journal-adapter`: the exit type the journal port takes.

## Impact

- `packages/modules/execution` (`ExecutionExit` type), `packages/adapters/worker-supervisor` (`ExitRecord` type and `readExit`), and tests in `packages/adapters/worker-supervisor`, `packages/adapters/worker-journal`, and `apps/worker`.
- No change to `docs/contracts`, AsyncAPI, OpenAPI, the journal format, or the record format.
