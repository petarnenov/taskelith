## Why

Architecture section 15 requires capacity reservations to be a reviewed protocol contract before G2 execution code. G2 work plan item 6 asks for it: transactional reservation of worker slots and requested resources, project and run quotas, delegated child budgets, release only with a justified lifecycle transition, capacity held by lost-contact attempts, races between scheduler replicas, worker-side hard admission limits, and fail-closed behavior for unenforceable controls, with the numbers of the operational targets, and subscription account slots named as an extension point for G3.

## What Changes

- Add `docs/contracts/capacity-reservation.md`, the capacity reservation contract.
- Add the `capacity-reservation` capability with the contract's normative rules.

## Capabilities

### New Capabilities
- `capacity-reservation`: transactional capacity reservations, quotas, shared delegation budgets, justified release, worker-side admission limits, and fail-closed controls.

### Modified Capabilities

## Impact

Documentation and specification only; no code. G2 items 7, 18, 20, and 24 build on it. It keeps the names the launch authorization contract uses for the reservation: the reservation the assignment holds, still held for this attempt on this worker; release as a serializable invalidating writer by assignment; and `capacity-not-reserved`.
