## ADDED Requirements

### Requirement: Provider terms review
Before a harness is admitted, its qualification record SHALL review the provider's current terms that govern how Taskelith uses the harness, including automated use and pooled subscriptions (ADR 0005), quoting each relevant clause briefly with its URL, effective date, and access date, stating where the text is ambiguous for Taskelith's use, and leaving the acceptance of any remaining risk to the owner.

#### Scenario: Terms reviewed
- **WHEN** a harness qualification records its provider's terms
- **THEN** each finding quotes the clause, names its source and access date, and separates what the text says from where it is ambiguous

#### Scenario: Remaining risk
- **WHEN** the terms leave a risk for pooled or automated subscription use
- **THEN** the record or the design of the change that records the terms states the options and any recommendation as the author's proposal, and the owner decides
