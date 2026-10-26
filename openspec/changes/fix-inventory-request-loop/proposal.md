## Why

In the G2 runs the control plane and a worker exchanged about 80 inventory requests every 3 seconds and never settled. The coordinator diagnosed the cause: the receipt of an inventory report part treats an answer to a superseded request as unsolicited and requests inventory again (`apps/control-plane/src/application/inventory-reconciliation.ts`, `receivePart`). With two requests outstanding, every answer is stale, and each one issues a new current request.

The specification already defines an unsolicited report as one without a `requestId` (requirement "Inventory request", scenario "Unsolicited report"), and the wire contract names only a reconnect and an unclassifiable omission as triggers of a request (execution wire contracts section 6, "Inventory request"). The code is wider than both.

The coordinator chose option A, the minimal fix, on 2026-10-26.

## What Changes

- **Control plane.** Only a report part without a `requestId` is unsolicited. An answer to a superseded request is still stored and applied as before, but it requests no inventory by itself.
- **Specification.** Requirement "Inventory request" states that a report with a `requestId` requests no inventory by itself, with the scenarios "Answer to a superseded request" and "Overlapping requests settle".
- **Wire contract.** Section 6 "Inventory request" says that a snapshot answering an earlier request is not a reconnect.
- **Tests.** The integration test of two requests now expects no third request, and a new test shows that two overlapping requests settle.

Not changed: the request of a snapshot that is not fresh and omits an unclassifiable unfinished assignment (requirement "Omitted assignments", `applySnapshot`). The design records the residual risk this leaves.

No wire schema changes.

## Capabilities

### Modified Capabilities
- `inventory-reconciliation`: requirement "Inventory request".

## Impact

`apps/control-plane` (receipt of inventory parts and its integration tests), `docs/contracts/execution-wire-contracts.md` (one sentence), and the `inventory-reconciliation` specification. `@taskelith/control-plane` is a private workspace package and the published `taskelith` package is unchanged, so commits use `chore`, `test`, and `docs`.
