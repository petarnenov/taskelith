## Why

G2 work plan item 27 closes G2: reproduce the exit evidence from a fresh clone, update the foundation ledger, and record the closure with any deferrals in an ADR, as ADR 0007 did for G0 and ADR 0010 for G1. Items 1 to 23 and 26 are merged and archived, and items 24 and 25 have three parts still running: 24c `run-g2-partition-and-races`, 25c `run-g2-native-acceptance-x86_64`, and `run-g2-native-acceptance-linux-host`. This change is drafted now so that the work-item map and the deferrals can be reviewed before that evidence arrives.

## What Changes

- Add ADR 0015, status Proposed: the map of every G2 plan row to its archived changes, the exit evidence and native acceptance with marked placeholders for the three changes in progress and the fresh-clone reproduction, the deferrals with the decision each follows or marked as the author's assignment, and the closure statement as a placeholder.
- Add the G2 section of the foundation ledger, with placeholders.
- Later in this change, before the owner accepts the ADR: fill the placeholders, reproduce the exit evidence from a fresh clone, and update the G2 work plan, architecture sections 13 and 15, README, and the protocol version note of the execution wire contracts.

## Capabilities

### New Capabilities

### Modified Capabilities
- `foundation-closure`: adds the G2 closure rule.

## Impact

Documentation only. No runtime behavior changes. The closure claims no real agent harness, SCM integration, remote worker, TLS, or supported matrix entry. Promotion to `main` is not part of this change.
