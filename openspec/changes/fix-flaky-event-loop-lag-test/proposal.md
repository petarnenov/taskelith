## Why

The test "an idle window reads below the resolution" in `packages/adapters/node-observability/test/node-observability.test.ts` failed in 1 of 7 full `make verify` runs on Linux and once in a macOS pre-push run, while it passes alone (coordinator finding F2). It measured a real 100 ms window of the test process's own event loop with a 10 ms histogram resolution, so the window held only eight or nine timer intervals and its p99 was in effect its maximum: one interval delayed by 10 ms or more, by garbage collection, coverage collection, or CPU contention from parallel test files, failed it. The monitor measured that delay correctly; the test assumed an idle process that a shared test run does not guarantee.

## What Changes

- `EventLoopLagMonitor` takes an optional histogram, typed `LoopDelayHistogram` (the part of Node's `ELDHistogram` it reads), and defaults to `monitorEventLoopDelay` as before; production callers are unchanged.
- The idle test feeds the monitor Node's own HDR histogram (`createHistogram`) filled with an idle window's intervals and checks that it reads below the resolution, the p99 interval less the resolution within the histogram's precision, and that the monitor enables and disables its histogram.
- A new test checks that each sample covers only its own window: the histogram is reset after each sample, and a blocked interval does not carry into the next window.
- The blocked-loop test keeps Node's real histogram and proves the integration with `monitorEventLoopDelay`; load can only raise the measured delay, so its lower bound cannot fail spuriously. Its upper bound of 5 s, which a long process pause could break, becomes a finiteness check.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `execution-observability` requirement "Event-loop lag and JSON lines" and its scenarios are unchanged; the change makes their tests deterministic, so it sets `skip_specs: true`.

## Impact

Test reliability of `make verify`. `@taskelith/node-observability` is a private workspace package, and its behavior is unchanged.
