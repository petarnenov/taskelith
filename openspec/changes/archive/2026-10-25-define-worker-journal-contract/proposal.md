## Why

A worker that acknowledges a command, requests a launch, or reports a fact must not lose it across a crash, a full disk, or a lost disk, and publish and commit are not atomic across systems (architecture section 9). Architecture section 15 requires the pre-G2 contract "local journal durability" to be a reviewed protocol contract before G2 execution code starts, and ADR 0007 deferred the data namespace rules to G2; the G2 work plan makes both item 5. The launch authorization contract (item 3) and the supervisor identity contract (item 4) rely on this journal for the journaled operation and execution identities, the journaled grant, and the durable seal before `not-started`.

## What Changes

- Add `docs/contracts/worker-journal.md`: the `worker/` subtree rules, the SQLite store and its durability settings under decision D4 (a), the durable file rule for files outside the journal, the journal records and their write order before each action, the local outbox of observations, interrupted writes, flush failure, full disk and the disk floor, corrupt, missing, or rolled-back journals, lock ownership, format versioning, disk loss after acknowledgement, obligations on other items, and the required tests.
- Add the `worker-journal` capability with its requirements.

## Capabilities

### New Capabilities
- `worker-journal`: what the worker persists before acknowledging, requesting, or reporting, how durably, and how it behaves when its journal or disk fails.

### Modified Capabilities

## Impact

Documentation and specification only; no code. Items 7, 8, 13, 14, 15, 20, and 21 build on the contract, and items 24 and 25 test it. Items 3, 4, and 6 are written in parallel and are cross-referenced by item name.
