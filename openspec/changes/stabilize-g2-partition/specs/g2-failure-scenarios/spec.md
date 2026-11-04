## MODIFIED Requirements

### Requirement: Worker broker partition
On a test-side composition against the `make` services, a Toxiproxy partition of the worker's broker connection SHALL only delay an attempt: after the heal the worker runs it once, publishes its observations once, and the inventory exchange settles.

#### Scenario: Partition before the offer or while the process runs
- **WHEN** the worker's broker connection is cut before the offer or while the process runs, and healed at a seeded moment
- **THEN** the attempt exits once with one started execution, and the result is recorded with target `harness-composition`

#### Scenario: Inventory after a reconnect
- **WHEN** the worker reconnects after the control plane marked it lost and the task has ended
- **THEN** the control plane sends at most one further inventory request in the following three seconds

#### Scenario: Exit while the worker is offline
- **WHEN** the process exits after the cut, once the worker reports its broker contact offline, and before the heal
- **THEN** the control plane has no exit and the task stays pending until the heal, and after it the exit is published from the local outbox and the attempt ends once
