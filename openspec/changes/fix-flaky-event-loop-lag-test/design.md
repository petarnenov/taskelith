## Context

`EventLoopLagMonitor.sample` records the p99 of Node's event-loop delay histogram over the window, less the histogram's resolution, then resets it. Node's histogram records whole timer intervals, so an idle loop records intervals close to the resolution. In a 100 ms window at 10 ms resolution there are only eight or nine of them (measured), and p99 is the largest.

## Goals / Non-Goals

Make the tests of the idle and blocked scenarios deterministic without weakening what they prove about the monitor. Do not change the monitor's behavior, its default resolution, or the requirement.

## Decisions

- **Inject the histogram.** The monitor reads only `count`, `percentile`, `reset`, `enable`, and `disable`, so it takes that slice of `ELDHistogram` as an optional constructor argument, defaulting to Node's histogram. This is a test seam at the adapter's boundary with Node, not a new mode.
- **Recorded intervals for the idle scenario.** An idle window cannot be produced reliably inside a shared test process; recorded intervals can. The test asserts the exact value, so it checks the subtraction of the resolution and the conversion from nanoseconds, not only an upper bound.
- **Keep the real histogram for the blocked scenario.** Contention only adds delay, so "at least 30 ms after a 60 ms block" cannot fail spuriously, and the test proves that the real histogram is wired in.
- **A window test.** Resetting after each sample is part of "each sample window" in the requirement and was untested.
- **Diagnosis before the fix.** Under load the real monitor in a separate process read no idle window at 10 ms or more in 200 windows, while the full test file with coverage failed 1 of 40 and 1 of 60 runs. That locates the delay in the shared test process, not in the monitor.

## Risks / Trade-offs

The idle scenario no longer runs against Node's real histogram; the blocked scenario and the default constructor still do.
