## Why

G2 crash scenario 24c found bug B3: a worker keeps counting the slot of a launch that the control plane rejected finally before any grant. `countedAttempts` in `apps/worker/src/assignment-admission.ts` treats every execution that is not `exited` or `not-started` as running, including one with no state at all. Such an execution never started and never can, yet a worker with one slot refuses the scheduler's next placement with `worker-slots-exhausted` after the rejected assignment has ended.

The [capacity reservation contract](../../../docs/contracts/capacity-reservation.md) section 8 counts, once per attempt, every assignment that has not ended and every non-terminal execution; section 6 treats an execution for which no launch authorization was ever granted as no obstacle to a release. An execution without a grant has no state ([launch authorization contract](../../../docs/contracts/launch-authorization.md) section 4, [worker journal contract](../../../docs/contracts/worker-journal.md) section 5), so it is not a non-terminal execution.

## What Changes

- **Slot counting.** An execution under an ended assignment holds its attempt's slot only while it is `authorized` or `started`, or while it has no grant and its launch authorization request is still pending. A launch rejected finally, or one whose operations are all closed without a grant, holds nothing.
- **Tests.** A regression test reproduces 24c with a one-slot worker, and tests keep a pending, `authorized`, or `started` execution holding its slot.
- **Spec.** The worker-runtime requirement "Worker-side admission limits" gains the two scenarios.

No contract, schema, wire message, or journal format changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: scenarios for the slot of a finally rejected launch and of a live execution.

## Impact

- `apps/worker/src/assignment-admission.ts` and `apps/worker/test/command-intake.test.ts`.
- Out of scope: the inventory loop, per-execution cancellation, stale recovery epochs, launch authorization, and the relaunch path of the launch orchestrator.
