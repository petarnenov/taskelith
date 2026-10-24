## Why

A review of the UI proof of concept against the repository on 2026-10-24 found two inconsistencies in the documentation itself: ADR 0008 and the `product-ui` spec call the board columns "the platform lifecycle stages" but use names that governance does not define (Propose, Specify, Archived), and the architecture's lifecycle illustration places Independent Review before Verify, while governance and ADR 0008 place Verify first. The owner asked that design, code, and documentation be synchronized and any mismatch fixed.

## What Changes

- ADR 0008 and the `product-ui` requirement name each column as a short label for governance's stage (Propose for Propose and inspect, Specify for Specify and design, Archived for Close).
- The architecture's lifecycle illustration puts Verify before Independent Review and points to governance for the order.

## Capabilities

### New Capabilities

### Modified Capabilities
- `product-ui`: the board requirement maps its column labels to governance's stage names.

## Impact

Documentation only. No decision changes; the labels and order already decided are stated consistently.
