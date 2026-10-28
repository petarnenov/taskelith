## MODIFIED Requirements

### Requirement: Needs you items answered once by their source
Every item that waits on a person SHALL be an inbox item of a registered source, of kind permission-request, input-request, spec-approval, escalation, reconciliation, or delivery-acknowledgement; an answer SHALL go to the owning source, which consumes it once and rejects a duplicate or an answer for a newer attempt generation, and the inbox SHALL never answer an item itself.

#### Scenario: Duplicate answer
- **WHEN** a second answer arrives for a resolved item
- **THEN** it fails with `conflict` and changes nothing

## ADDED Requirements

### Requirement: Acknowledgement of an uncertain delivery
Each consumed response whose delivery is `delivery-uncertain` SHALL open one `delivery-acknowledgement` inbox item about its task, attempt, attempt generation, and native request, answerable by `project-operator` or above. Its only answer, `acknowledge`, SHALL record, audited, that a person has seen it, and SHALL resend nothing, answer no request, and start no turn.

#### Scenario: Delivery lost in a restart
- **WHEN** a generation ends while a consumed permission response has no delivery report
- **THEN** one `delivery-acknowledgement` item opens for that request

#### Scenario: Acknowledging
- **WHEN** an operator answers the item with `acknowledge`
- **THEN** the item is resolved, the audit records the operator, and nothing is sent to the harness
