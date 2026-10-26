## ADDED Requirements

### Requirement: Exit record type
The supervisor's exit record type SHALL allow the termination evidence `boot-changed` or `namespace-ended` only with status `unknown`, and the exit reader SHALL build a value of that type, so that a combination the reader rejects cannot be written in code.

#### Scenario: Recovery evidence with a known status in code
- **WHEN** code builds an exit record with `boot-changed` and an exit code
- **THEN** type checking fails

### Requirement: Reaped real-process tests
Every test that starts a real supervisor SHALL, after it ends, kill every live process it started, directly or through a supervisor, found by a marker unique to the test file on the command line, and SHALL have a run-time bound, so that a failed assertion or a stuck wait fails the test instead of hanging the suite.

#### Scenario: Failed assertion with a live supervisor
- **WHEN** an assertion fails while the test's supervisor and child are running
- **THEN** the test fails, both processes are killed, and the test run ends

#### Scenario: Child before its handle
- **WHEN** a supervisor is killed after the spawn and before `handle`, and an assertion then fails
- **THEN** the child is killed although no record names it
