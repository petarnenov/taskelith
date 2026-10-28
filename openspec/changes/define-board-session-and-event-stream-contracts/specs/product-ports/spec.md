## MODIFIED Requirements

### Requirement: Needs you items answered once by their source
Every item that waits on a person SHALL be an inbox item of a registered source, of kind permission-request, input-request, spec-approval, escalation, reconciliation, or delivery-acknowledgement; the control plane SHALL resolve a repeated idempotency key before `NeedsYouSource`, which SHALL see only new keys, consume an answer once, and reject another answer to a resolved item or an answer for a newer attempt generation; the inbox SHALL never answer an item.

#### Scenario: Duplicate answer
- **WHEN** a second answer with a new idempotency key arrives for a resolved item
- **THEN** the source fails it with `conflict` and changes nothing

#### Scenario: Idempotent repeat
- **WHEN** the answer that resolved an item repeats with its idempotency key
- **THEN** the control plane returns the first outcome without calling the source, and nothing changes

#### Scenario: Key reused with another answer
- **WHEN** the idempotency key of a resolved item's answer comes with another answer
- **THEN** the control plane fails it with `conflict` without calling the source, and nothing changes

## ADDED Requirements

### Requirement: Acknowledgement of an uncertain delivery
Each consumed response whose delivery is `delivery-uncertain` SHALL open one `delivery-acknowledgement` inbox item about its task, attempt, attempt generation, and native request, named by its session, session generation, and native request ID, answerable by `project-operator` or above. Its only answer, `acknowledge`, SHALL record, audited, that a person has seen it, and SHALL resend nothing, answer no request, and start no turn.

#### Scenario: Delivery lost in a restart
- **WHEN** a generation ends while a consumed permission response has no delivery report
- **THEN** one `delivery-acknowledgement` item opens for that request

#### Scenario: Acknowledging
- **WHEN** an operator answers the item with `acknowledge`
- **THEN** the item is resolved, the audit records the operator, and nothing is sent to the harness
