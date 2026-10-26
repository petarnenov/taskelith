## Why

In the G2 runs the control plane and a worker exchanged about 80 inventory requests every 3 seconds and never settled. The coordinator diagnosed the cause: the receipt of an inventory report part treats an answer to a superseded request as unsolicited and requests inventory again (`apps/control-plane/src/application/inventory-reconciliation.ts`, `receivePart`). With two requests outstanding, every answer is stale, and each one issues a new current request.

The specification already defines an unsolicited report as one without a `requestId` (requirement "Inventory request", scenario "Unsolicited report"), and the wire contract names only a reconnect and an unclassifiable omission as triggers of a request (execution wire contracts section 6, "Inventory request"). The code is wider than both.

The coordinator chose option A, the minimal fix, on 2026-10-26. The author then showed that the request of `applySnapshot` for an unclassifiable omission (line 162) still loops under two outstanding requests while the omitted assignment stays active. The coordinator then chose option 1: bound that path too, in this change.

## What Changes

- **Control plane.** Only a report part without a `requestId` is unsolicited. An answer to a superseded request is still stored and applied as before, but it requests no inventory by itself.
- **Control plane, omitted assignments.** `applySnapshot` requests inventory for an unclassifiable omission only when the snapshot has no `requestId`. An answer to a superseded request still re-sends the offer.
- **Specification.**
  - Requirement "Inventory request" states that a report with a `requestId` requests no inventory, with the scenarios "Answer to a superseded request" and "Overlapping requests settle".
  - Requirement "Omitted assignments" states that only an unsolicited snapshot requests inventory for an omission, with the scenarios "Superseded answer omits an offer" and "Omitted offer under overlapping requests".
- **Wire contract.** Section 6 "Inventory request" names an unsolicited snapshot, not one that is not fresh, as the omission trigger, and says that an answer to a request sends no request.
- **Tests.**
  - The integration test of two requests now expects no third request.
  - New tests show that two overlapping requests settle without an assignment, and while every answer omits an active offer never accepted.
  - A new test shows that a superseded answer omitting an offer re-sends it and requests nothing.
  - A new test shows that the exchange settles when the worker refuses the re-sent offer.

No wire schema changes.

## Capabilities

### Modified Capabilities
- `inventory-reconciliation`: requirements "Inventory request" and "Omitted assignments".

## Impact

`apps/control-plane` (receipt and application of inventory snapshots, and their integration tests), `docs/contracts/execution-wire-contracts.md` (one sentence), and the `inventory-reconciliation` specification. `@taskelith/control-plane` is a private workspace package and the published `taskelith` package is unchanged, so commits use `chore`, `test`, and `docs`.
