# delivery-planning Specification

## Purpose
Record, for each delivery gate, the work plan that decomposes it into tracked work items and names the owner decisions that block them.

## Requirements

### Requirement: Gate work plan
From G1 onward, before implementation work for a delivery gate starts, the repository SHALL contain a work plan for that gate that lists its work items with scope, purpose, item dependencies, and the open owner decisions that block each item, and that states how items are authorized. A work item blocked by an open owner decision SHALL NOT start until the owner decides it.

#### Scenario: An item depends on an open decision
- **WHEN** a work item depends on an owner decision that is not yet made
- **THEN** the plan names that decision in the item's row and lists the decision's options

#### Scenario: A recommendation is recorded
- **WHEN** the plan records the author's recommendation for an open decision
- **THEN** it is labelled as a proposal, not as the owner's decision

### Requirement: Owner decisions recorded in the plan
When the owner decides an open decision listed in a gate work plan, the plan SHALL mark that decision as decided with its date and chosen option, and SHALL remove it from the "Blocked by" entries of the items it blocked.

#### Scenario: A decision is made
- **WHEN** the owner chooses an option for an open decision in the plan
- **THEN** the plan's decision row names the option and the date, and no item lists that decision as blocking

### Requirement: Intent and council delivery gates
The delivery sequence SHALL include G9, intents, campaigns, and blueprint dispatch with human approvals, and G10, OpenCode's admission and the decision council, as [ADR 0016](/docs/decisions/0016-delivery-gates-for-intents-and-council.md) fixes them. G9 SHALL start only after G4 closes and SHALL close before the G6 pilot completes; G10 SHALL start only after G9 closes. G8 SHALL follow both. Until OpenCode is admitted, the council SHALL NOT be constituted and human approvals SHALL apply.

#### Scenario: G9 before G4 closes
- **WHEN** G4 has not closed
- **THEN** no G9 work item starts

#### Scenario: G6 pilot completion
- **WHEN** the G6 pilot completes
- **THEN** G9 has already closed

#### Scenario: Council before OpenCode
- **WHEN** OpenCode is not yet admitted within G10
- **THEN** the council is not constituted and human approvals apply

### Requirement: Authorized plans for G9 and G10
A G9 or G10 work item SHALL NOT start until that gate has its own work plan and the owner has authorized the plan. ADR 0016 SHALL NOT be read as authorizing any work item.

#### Scenario: Gate fixed without a plan
- **WHEN** ADR 0016 fixes G9 and no G9 plan has been authorized by the owner
- **THEN** no G9 work item starts

### Requirement: Forward-compatibility obligations traced
The G3 work plan SHALL list each forward-compatibility obligation of ADR 0013 and ADR 0014 with the G3 items that must honour it and one status: covered, with the file and line that meet it; partly covered, with that evidence for the met part and the item or the gate, G9 or G10, that meets the rest; open, with the item that closes it; or not a G3 item, with the gate, G9 or G10, that carries it. A brief for a listed item SHALL carry its obligations.

#### Scenario: Open obligation
- **WHEN** no merged contract meets an obligation
- **THEN** its row is marked open and names the item that closes it

#### Scenario: Partly met obligation
- **WHEN** a merged contract meets only part of an obligation
- **THEN** its row is marked partly covered, cites the evidence for that part, and names the item or the gate, G9 or G10, that meets the rest

#### Scenario: Brief for a bound item
- **WHEN** the coordinator briefs an item that a row names
- **THEN** the brief carries that row's obligation
