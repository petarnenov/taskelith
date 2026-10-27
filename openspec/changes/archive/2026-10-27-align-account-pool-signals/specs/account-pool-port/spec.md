## MODIFIED Requirements

### Requirement: Deterministic least-loaded order
The least-loaded rule SHALL order eligible slots by held reservations, then by usage fraction only when every tied slot has a usage report whose derived window end is after the selection time, then by least recent reservation, then by lowest identifier, and a selection SHALL record the time of the slot's reservation.

#### Scenario: Equal usage
- **WHEN** two eligible slots tie on held reservations and report the same usage fraction
- **THEN** the least recently reserved of the two is reserved

#### Scenario: Ended usage window
- **WHEN** two eligible slots tie on held reservations, report usage fractions 0.2 and 0.7, and the window of the 0.2 report has ended
- **THEN** the least recently reserved of the two is reserved

### Requirement: Cooldown bounds
A limit without a future reset time SHALL put a slot in cooldown for the installation's default, a setting from 1 to 1440 minutes, provisionally 60; a later limit SHALL never shorten a cooldown, and a cooldown SHALL end only at its stored end, because no signal ends it earlier.

#### Scenario: Shorter later limit
- **WHEN** a slot cooling down until 10:00 reports a limit with a reset time of 09:30
- **THEN** its cooldown still ends at 10:00

#### Scenario: No early end
- **WHEN** a slot cooling down until 10:00 reports a usage fraction of 0 at 09:00
- **THEN** its cooldown still ends at 10:00

### Requirement: Slot store compare-and-set
`AccountSlots` SHALL store a new slot only at revision 1, SHALL replace a slot only at its expected revision with the next revision, failing with `conflict` for another stored revision and `invalid` for another new revision, and SHALL return a project's pool for a harness as its active allowed slots in the code-unit order of their identifiers, which for ASCII identifiers is the order of the "C" collation.

#### Scenario: Concurrent replaces
- **WHEN** two replaces of one slot run at the same expected revision
- **THEN** exactly one succeeds and the other fails with `conflict`

## ADDED Requirements

### Requirement: Session reports applied to the reserving slot
The control plane SHALL apply a session's usage and limit signals and its credential authentication failures, by compare-and-set, to the slot that the reservation of the session's attempt records, and SHALL never query a harness plugin outside a session; the add-slot command SHALL check a slot's mechanism against the control plane's admitted pairs of harness plugin and mechanism.

#### Scenario: Limit signal without a slot name
- **WHEN** the plugin of a session whose attempt's reservation records slot S reports a limit
- **THEN** slot S enters cooldown

#### Scenario: Mechanism check without the plugin
- **WHEN** an operator adds a slot
- **THEN** its mechanism is checked against the admitted pairs of its harness, and no harness plugin is called

### Requirement: Usage window derived by the pool
The pool SHALL derive a usage report's window end as the database time at which the control plane applies the report plus the usage window length that the pool configuration sets for the slot's harness; a report for a harness without a length SHALL clear the slot's usage, and the agent harness port's usage signal SHALL carry no window.

#### Scenario: Report within its window
- **WHEN** harness H has a usage window length of 300 minutes and a usage report for a slot of H is applied at 09:00
- **THEN** the slot's usage window ends at 14:00

#### Scenario: Harness without a window length
- **WHEN** a usage report is applied for a slot whose harness has no usage window length
- **THEN** the slot has no usage, and the usage tie-breaker is skipped for its ties

### Requirement: Health from session failures
A slot SHALL become unhealthy when a session on it reports that its credential fails authentication, through a turn that fails with `authentication` or a start or resume that fails with `forbidden`, and SHALL become healthy again only when a rotation switches it to a new credential.

#### Scenario: Authentication failure in a session
- **WHEN** a turn of a session on slot S fails with `authentication`
- **THEN** slot S becomes unhealthy and receives no new reservation

#### Scenario: Recovery by rotation
- **WHEN** an unhealthy slot is revoked, rotated to a new credential, and reinstated
- **THEN** it is healthy and eligible again
