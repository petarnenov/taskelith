## ADDED Requirements

### Requirement: Exit type of the journal port
The exit that the journal port's `recordExit` takes SHALL allow the termination evidence `boot-changed` or `namespace-ended` only with status `unknown`, so that the worker cannot journal recovery evidence with a known exit status.

#### Scenario: Recovery evidence with a known status passed to the journal
- **WHEN** code passes `recordExit` an exit with `namespace-ended` and an exit code
- **THEN** type checking fails
