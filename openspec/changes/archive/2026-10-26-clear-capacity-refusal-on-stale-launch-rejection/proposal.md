## Why

Zaki's dump of the G2 item 24c scenarios found bug B5, a liveness defect that failed 2 in 6 runs. A worker accepts an assignment at ownership generation 2, and its launch authorization is in flight. A cancellation moves the task to generation 3, and the control plane offers the worker a new assignment. The worker refuses it with `worker-slots-exhausted`, and the control plane marks the worker capacity-refused. The earlier launch is then rejected with `assignment-not-active`, and the worker reports `execution.launch.rejected` at generation 2. That observation is rejected as `stale-ownership-generation`, whose effect rolls back, so nothing clears the refusal and the worker is never offered work again. A current-generation launch rejection never cleared the refusal either.

## What Changes

- **Contract.** [Capacity reservation](/docs/contracts/capacity-reservation.md) section 8, "Refusal": the worker stays ineligible until its next capacity declaration or an observation that frees a slot (an exit, a `not-started`, or a launch rejection), which clears the refusal even at a stale ownership generation when it is about the worker's own assignment, as evidence that changes no task, attempt, or assignment, under the refusal's sequence fence and the epoch gate of launch authorization section 7.
- **Control plane.** `observation-effects.ts` clears the producer's capacity refusal on every consumed launch rejection, and `rejectedEffect` keeps that clear for a stale launch rejection, `not-started`, or exit of the producer's own assignment, an exit or `not-started` under the epoch gate; `observation-service.ts` applies it in the transaction that records the rejected observation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `observation-consumption`: "Stale ownership generation" (the evidence clear, four scenarios), "Acceptance and refusal" (a slot-freeing observation ends the refusal), and "Report sequence fences" (a scenario for an older stale launch rejection).
- `launch-reconciliation`: "Launch rejections that reconcile or only record" (every launch rejection clears the producer's capacity refusal; one scenario).

## Impact

- Documents: `docs/contracts/capacity-reservation.md` section 8, the "Refusal" bullet only.
- Code: `apps/control-plane/src/application/observation-effects.ts` and `observation-service.ts`; tests in `apps/control-plane/test/observation.integration.test.ts` and `observation-service.test.ts`.
- Private workspace packages only; the published `taskelith` package does not change.
- Out of scope: the 24c scenario test and its B3 todo, which become a regular test after this change lands; the worker ending an assignment locally on `assignment-not-active`, as section 8 "Ended assignments" states (backlog item `end-assignment-on-not-active`); stale-epoch and quarantine evidence, which still applies nothing.
