## Why

G2 crash scenario 24c, scenario h, found bug B2: the launch orchestrator widens a cancellation that names one execution to the execution's whole intent. `#forward` in `apps/worker/src/launch-orchestrator.ts` cancelled the intent's live launch, which forwards `cancel` to the execution that launch runs, even when that is another execution, and it filed the `cancel` file for every open execution of the intent. An `unauthorized-start` cancellation of a stray execution therefore stopped the owning execution, and the control plane then created a retry.

The [execution wire contracts](/docs/contracts/execution-wire-contracts.md) section 4 says: "A cancellation without `executionId` targets the attempt; with it, only that execution." The [launch authorization contract](/docs/contracts/launch-authorization.md) section 7 says an unauthorized start makes the authority write "a cancellation command for that execution only, never for another execution of the attempt".

## What Changes

- **Execution target.** A cancellation that names an execution stops a live launch only while that launch runs the named execution, files `cancel` only for the named execution, and records its evidence once the named execution is settled and no launch runs it.
- **Attempt target.** Unchanged: the intent's launch stops, and the evidence waits for every execution of the intent.
- **Tests.** Regression tests for both execution-target rules and one for the attempt target; the earlier test that encoded the widening is rewritten.
- **Spec.** The worker-runtime requirement "Cancellation forwarding" is scoped by target and gains three scenarios.

No contract, schema, wire message, or journal format changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: "Cancellation forwarding" stops only the named execution for an execution target.

## Impact

- `apps/worker/src/launch-orchestrator.ts` and `apps/worker/test/launch-orchestrator.test.ts`.
- Out of scope: the recovery plan in `packages/modules/execution` (see design, Risks), the relaunch path of the launch orchestrator, which another change covers, and scenario 24c itself.
