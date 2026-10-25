## ADDED Requirements

### Requirement: Execution facts with wire fields
The journal SHALL store each execution fact with the assignment, attempt, and ownership generation of the launch intent its execution belongs to, read in the commit itself; a start SHALL carry its process identity and the intent's recovery epoch, and an exit its start proof, spawn failure, and termination evidence. A fact derived again SHALL keep its `observationId`.

#### Scenario: Start fact
- **WHEN** W5s commits a start with a process identity
- **THEN** the outbox entry names the intent's assignment, attempt, generation, and recovery epoch, with the process
