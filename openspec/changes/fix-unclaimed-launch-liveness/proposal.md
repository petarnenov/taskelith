## Why

The crash-window scenario of G2 item 24b found defect O1: when the process supervisor dies at CP5 ([supervisor identity contract](../../../docs/contracts/supervisor-identity.md) section 4), after it took `lock` and before it claims the launch record, and the worker keeps running, the execution stays `authorized` with no observation until the worker restarts. `ExecutionWatch.observe` asks the recovery table about the supervisor's liveness only for a claimed record. The owner's delegate decided in away run `20261026T161148Z-opencode-90873` that this is a defect, fixed in G2: the liveness check extends to a record that is authorized but not claimed, past its spawn deadline, so a dead supervisor is found without a worker restart.

## What Changes

- **Check.** `ExecutionWatch.observe` also asks the recovery table, through the existing liveness check, about a launch's record without a launch record on every tenth poll once its spawn deadline is no longer proven ahead on the deadline clock. The launch orchestrator passes that deadline in the watch target.
- **Outcome.** Unchanged paths: the recovery table seals a record without a launch record (contract section 6), the next read sees the seal, and the worker reports `execution.not-started` and launches the intent again; a lost seal race is decided from the winning claim; `uncertain` is reported as before.
- No contract, AsyncAPI, OpenAPI, or journal format change: the contract's recovery table already seals a record without a launch record and states no claim-only liveness rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: "Supervisor liveness" covers a launch's record left unclaimed past its spawn deadline.

## Impact

- `apps/worker`: `execution-watch.ts` (`WatchTarget.spawnDeadline`, `WatchOptions.clock`, `#livenessDue`, `#pastDeadline`) and `launch-orchestrator.ts` (passes the deadline).
- Tests: `apps/worker/test/launch-orchestrator.test.ts`.
- No new dependency. Out of scope: launch authorization and relaunch reauthorization (D1, another change) and the crash-window tests of 24b.
