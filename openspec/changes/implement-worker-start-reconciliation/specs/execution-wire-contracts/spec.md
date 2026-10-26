## ADDED Requirements

### Requirement: Recovery termination evidence
In document version 0.5.0, an `execution.exited` observation that is not a spawn failure SHALL also accept the termination evidence `boot-changed` and `namespace-ended`, which only recovery on start proves, with status `unknown`.

#### Scenario: Exit proven by a changed boot
- **WHEN** an exit observation reports `boot-changed` with status `unknown` and an unproven start
- **THEN** validation succeeds
