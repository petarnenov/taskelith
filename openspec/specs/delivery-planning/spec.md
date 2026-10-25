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
