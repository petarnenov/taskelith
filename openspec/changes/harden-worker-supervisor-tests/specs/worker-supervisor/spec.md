## ADDED Requirements

### Requirement: Exit record type
The supervisor's exit record type SHALL allow the termination evidence `boot-changed` or `namespace-ended` only with status `unknown`, and the exit reader SHALL build a value of that type, so that a combination the reader rejects cannot be written in code.

#### Scenario: Recovery evidence with a known status in code
- **WHEN** code builds an exit record with `boot-changed` and an exit code
- **THEN** type checking fails

### Requirement: Reaped real-process tests
Every test that starts a real supervisor SHALL, after it ends, kill each supervisor it started and each supervisor and child that its execution record names while the process still has the recorded identity, and SHALL have a run-time bound, so that a failed assertion or a stuck wait fails the test instead of hanging the suite.

#### Scenario: Failed assertion with a live supervisor
- **WHEN** an assertion fails while the test's supervisor and child are running
- **THEN** the test fails, both processes are killed, and the test run ends
