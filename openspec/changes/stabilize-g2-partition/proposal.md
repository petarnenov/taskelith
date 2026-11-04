## Why

The G2 partition scenario file `test/g2-partition.test.ts` is intermittent. In past `make verify` logs, the broker scenario "a partition while the process runs keeps its observations, published once after the heal" failed three times with `AssertionError [ERR_ASSERTION]: the exit waits in the local outbox`, `'ended' !== 'pending'` (line 108 at the base `3d40034c`), once with `the start is recorded not met within 20000 ms` (line 103), and the PostgreSQL scenario "a partition while the process runs delays its observations, applied once after the heal" twice with `the start is journaled not met within 20000 ms` (line 168). All six predate #446.

The broker start timeout (`the start is recorded`) may belong to the mechanism that #446 removed, a start whose apply lost five serialization races to heartbeats and waited for its redelivery; that is a hypothesis, as its log holds no control plane log. The PostgreSQL start timeout (`the start is journaled`) waits on the worker's local journal, which the worker writes without the control plane applying the observation, so #446 does not explain it; it is unreproduced and unexplained. The outbox assertion does not depend on either. The scripted process ran 2.5 s from its launch, and the scenario cut the broker route only after the control plane recorded the start. When the start was recorded late, for any reason, the process had already exited and its exit had been published before the cut, so the control plane had ended the task. On `3d40034c` the time from the grant to the cut was 0.9 to 1.9 s under load, against the 2.5 s run, and a start publication delayed by 3 s reproduced the exact assertion in all six recorded base runs of a seed that heals after the exit.

## What Changes

- The broker while-running scenario holds its scripted process (`HELD_RUN`) and releases it once the worker reports its contact offline: before the heal when the seed heals after the exit, after the heal otherwise. It asserts that the execution is still `started` at that moment. The other assertions, the seed's draws, and every timeout are unchanged.
- The `g2-failure-scenarios` requirement "Worker broker partition" gains the scenario "Exit while the worker is offline", the contract the held process pins; the requirement text is unchanged.
- No product code changes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `g2-failure-scenarios`: requirement "Worker broker partition", one added scenario.

## Impact

Test reliability of `make verify` and `make verify-linux-g2-scenarios`. No package, contract, or configuration change.
