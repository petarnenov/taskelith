## ADDED Requirements

### Requirement: Declared capacity bounds
The `WorkerCapacity` schema SHALL bound `slots`, `cpuMillicores`, and `memoryMebibytes` to at most `2147483647`, the largest PostgreSQL `integer`, in both the OpenAPI and the AsyncAPI execution document.

#### Scenario: Enrollment above the bound
- **WHEN** an enrollment request declares a slot count, CPU, or memory above `2147483647`
- **THEN** the request body is invalid

#### Scenario: Capacity declaration above the bound
- **WHEN** a `worker.capacity.declared` observation declares a slot count, CPU, or memory above `2147483647`
- **THEN** the observation is invalid

#### Scenario: Largest value
- **WHEN** a capacity value is `2147483647`
- **THEN** the enrollment request and the observation are valid
