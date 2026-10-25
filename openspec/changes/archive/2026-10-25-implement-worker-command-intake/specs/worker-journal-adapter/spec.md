## ADDED Requirements

### Requirement: Journal format 2
The journal SHALL be format 2, which records an offer's requested resources, assignment ends, the last capacity declaration, and the inventory snapshot counter. A worker SHALL migrate a format 1 journal to format 2 in one transaction on start.

#### Scenario: Format 1 journal
- **WHEN** a worker opens a format 1 journal
- **THEN** it is format 2 afterwards and keeps its records

### Requirement: Intake records
W1 SHALL append the acceptance observation of an accepted offer and the refusal or rejection observation of a refused or rejected command in the transaction that journals the command, and an inventory read SHALL return the snapshot with the last assigned sequence in one transaction.

#### Scenario: Accepted offer
- **WHEN** an offer is accepted
- **THEN** its launch intent and its `assignment-accepted` observation are committed together
