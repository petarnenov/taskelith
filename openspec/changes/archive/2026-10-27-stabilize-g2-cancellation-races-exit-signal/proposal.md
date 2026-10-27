## Why

A `make verify` run on a Linux host failed in `test/g2-cancellation-races.test.ts`: a cancelled attempt ended `exited` with code 0, while `assertCancelled` requires a started process to end by `SIGTERM`. The scripted process of scenarios c, e, and f ends on its own with code 0 after a fixed time (20 s in c and e, 5 s in f). The cancel reaches it asynchronously: the control plane's command, the worker's cancel file, and the supervisor's poll. When that path takes longer than the run, the process exits 0 first, and the product correctly reports that exit with `cancelled: true` (requirement "Cancellation requested versus termination observed" of `execution-model`). The test, not the product, assumed the cancel always wins.

## What Changes

- The scenario worker gains a held scripted process, `HELD_RUN`: it cannot end on its own and exits with code 0 only after its worker releases it (`releaseScriptedProcesses`, `holdScriptedProcesses`).
- Scenarios c, e, and f run held processes, so a cancelled attempt's started process can end only by the cancel's signal. Scenario f releases them only in a round whose held request was not granted, where the attempt must run to code 0 under a later assignment.
- The fixed run times `LONG_RUN_MILLISECONDS` and `RACE_RUN_MILLISECONDS` go away. No scenario bound or existing sleep is widened, and no product code changes.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `g2-failure-scenarios` requirements "Cancel after W4" and "Invalidation racing a grant" are unchanged; the change makes their test deterministic, so it sets `skip_specs: true` (see `design.md`).

## Impact

Test reliability of `make verify` only: `test/g2-cancellation-races.test.ts`, `test/g2-scenarios/scenario-worker.ts`, and `test/g2-scenarios/fixtures/crash-before-ack-worker.ts`. Other G2 test files keep their timed runs.
