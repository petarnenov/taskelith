## MODIFIED Requirements

### Requirement: First contact
An authenticated observation SHALL mark its worker reachable and SHALL move the worker's last contact to the database time, never backward. A duplicate that the inbox already holds SHALL record contact too.

#### Scenario: New worker
- **WHEN** a newly enrolled worker's first capacity declaration is applied
- **THEN** the worker is reachable and eligible for placement

#### Scenario: Duplicate after lost contact
- **WHEN** a worker marked unreachable republishes an observation that was already applied
- **THEN** it is a duplicate, and the worker is reachable again
