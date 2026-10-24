## Why

Starting a process and recording its handle are not atomic (architecture F03), so a worker that crashes around a launch can lose track of a running process or start a second one. Architecture section 15 requires the pre-G2 contract "supervisor identity and adoption" to be a reviewed protocol contract before G2 execution code starts, and the G2 work plan makes it item 4, serving invariant 8 and R06. Decision D7 (c) chose one supervisor process per execution; the launch authorization contract (item 3) relies on this contract for the single spawn per execution identity and the seal before `not-started`.

## What Changes

- Add `docs/contracts/supervisor-identity.md`: the execution identity and its creation before spawn, the per-execution record, the launch sequence with named crash points, the single spawn decision (claim or seal), recovery and adoption by proven process identity, uncertainty, process groups, descendants and cancellation evidence, what survives a worker service restart, an upgrade, or a reboot on each OS, and the native evidence each OS must supply.
- Add the `execution-supervisor` capability with its requirements.

## Capabilities

### New Capabilities
- `execution-supervisor`: the stable execution identity, the single spawn decision, adoption or uncertainty after a crash, termination evidence, and survival across worker service restarts and upgrades.

### Modified Capabilities

## Impact

Documentation and specification only; no execution code. Items 7, 8, 14, and 15 build on the contract, and items 24 and 25 test it. Items 3, 5, and 6 are written in parallel and are cross-referenced by item name.
