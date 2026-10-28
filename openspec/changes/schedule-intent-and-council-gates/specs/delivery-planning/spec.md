## ADDED Requirements

### Requirement: Intent and council delivery gates
The delivery sequence SHALL include G9, intents, campaigns, and blueprint dispatch with human approvals, and G10, the OpenCode harness admission and the decision council, as [ADR 0016](/docs/decisions/0016-delivery-gates-for-intents-and-council.md) fixes them. G9 SHALL start only after G4 closes and SHALL close before the G6 pilot completes; G10 SHALL start only after G9 closes. G8 SHALL follow both.

#### Scenario: G9 before G4 closes
- **WHEN** G4 has not closed
- **THEN** no G9 work item starts

#### Scenario: G6 pilot completion
- **WHEN** the G6 pilot is about to complete
- **THEN** G9 has closed, so the pilot ran graph-driven workload

#### Scenario: Council before OpenCode
- **WHEN** OpenCode is not yet admitted within G10
- **THEN** the council is not constituted and human approvals apply

### Requirement: Authorized plans for G9 and G10
A G9 or G10 work item SHALL NOT start until that gate has its own work plan and the owner has authorized the plan. ADR 0016 SHALL NOT be read as authorizing any work item.

#### Scenario: Gate fixed without a plan
- **WHEN** ADR 0016 fixes G9 and no G9 plan has been authorized by the owner
- **THEN** no G9 work item starts

### Requirement: Forward-compatibility obligations traced
The G3 work plan SHALL list each forward-compatibility obligation of ADR 0013 and ADR 0014 with the G3 items that must honour it and its status: covered, with the file and line that meet it, or open, with the item that closes it. A brief for a listed item SHALL carry its obligations.

#### Scenario: Open obligation
- **WHEN** no merged contract meets an obligation
- **THEN** its row is marked open and names the item that closes it

#### Scenario: Brief for a bound item
- **WHEN** the coordinator briefs an item that a row names
- **THEN** the brief carries that row's obligation
