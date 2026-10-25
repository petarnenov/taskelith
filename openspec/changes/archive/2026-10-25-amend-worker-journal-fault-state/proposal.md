## Why

G2 item 14 (`implement-worker-journal`) keeps a worker stopped after a flush failure across worker restarts in the same host boot by recording the stop in `worker/journal-fault`. The worker journal contract does not list that control record in its section 2 subtree table, and section 7 does not say how the stop outlives a worker restart, which item 14's verification recorded as a remaining gate.

## What Changes

- List `worker/journal-fault` in the subtree table of `docs/contracts/worker-journal.md` section 2: its content, writer, and retention.
- State in section 7, step 4, how the record keeps a restarted worker stopped in the same boot, when it is removed, and what happens when it is unreadable or cannot be written.
- Modify the `worker-journal` requirement "Flush failure stops the journal" to require recording the stop with the host boot identity, with a scenario for a restart in the same boot.

## Capabilities

### New Capabilities

### Modified Capabilities
- `worker-journal`: the flush failure requirement records the stop with the host boot identity.

## Impact

Documentation and specification only; the behavior is what item 14 implemented in `@taskelith/worker-journal`. Item 20 inherits the rule that a worker is not restarted automatically when the record cannot be written.
