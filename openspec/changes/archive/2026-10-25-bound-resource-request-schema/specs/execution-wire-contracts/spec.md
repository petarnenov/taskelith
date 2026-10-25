## ADDED Requirements

### Requirement: Requested resource bounds
The `ResourceRequest` schema SHALL bound `cpuMillicores` and `memoryMebibytes` to at most `2147483647`, the largest PostgreSQL `integer`, in the AsyncAPI execution document. The per-attempt ceiling of the capacity reservation contract SHALL still apply.

#### Scenario: Offer above the bound
- **WHEN** an `execution.assignment.offer` command requests CPU or memory above `2147483647`
- **THEN** the command is invalid and validation names the field

#### Scenario: Largest requested value
- **WHEN** an offer requests CPU or memory of `2147483647`
- **THEN** the command is valid
