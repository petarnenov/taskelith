## ADDED Requirements

### Requirement: Owner decisions recorded in the plan
When the owner decides an open decision listed in a gate work plan, the plan SHALL mark that decision as decided with its date and chosen option, and SHALL remove it from the "Blocked by" entries of the items it blocked.

#### Scenario: A decision is made
- **WHEN** the owner chooses an option for an open decision in the plan
- **THEN** the plan's decision row names the option and the date, and no item lists that decision as blocking
