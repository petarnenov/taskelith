## ADDED Requirements

### Requirement: Scenarios through the macOS supervisor
When `TASKELITH_MACOS_SCENARIOS` is `1` on macOS, as `make verify-macos-g2-scenarios` sets it, each scenario worker, the crash-before-ack worker included, SHALL launch through the worker's own launch host, the macOS supervisor. Set off macOS, the variable SHALL fail the scenario file. Without it the scenario files SHALL be skipped on macOS.

#### Scenario: macOS runner
- **WHEN** `make verify-macos-g2-scenarios` runs the cancellation races
- **THEN** the scripted process of race h, race g, and race c when its cancel lands after the start, is a child of a launch supervisor of its own worker, and a check fails the scenario otherwise

#### Scenario: Variable off macOS
- **WHEN** `TASKELITH_MACOS_SCENARIOS` is `1` on another platform
- **THEN** the scenario file fails when it loads, naming the platform

#### Scenario: Plain run on macOS
- **WHEN** `make verify` runs the same files on macOS
- **THEN** every scenario is skipped with its reason

### Requirement: Adoption cancel scenario
Through the macOS supervisor, race g SHALL kill the launching supervisor of a running execution, let the worker start an adopting supervisor, and cancel the attempt, before the adopter starts or while it observes, as the seed chooses. The adopter SHALL record the cancel as not applied and signal nothing. On any other launch host race g SHALL be skipped as not applicable.

#### Scenario: Adopter on macOS
- **WHEN** race g runs under `make verify-macos-g2-scenarios`
- **THEN** the execution gains the evidence `cancellation-not-applied` while its child keeps running, and after the child is released it stays `started` with the evidence `uncertain`, and the task result stays `pending`

#### Scenario: Other hosts
- **WHEN** the cancellation races run on Linux
- **THEN** race g is skipped as not applicable

## MODIFIED Requirements

### Requirement: Cancel after W4
A cancel of an assignment whose record is written SHALL terminate its process through the cancel file, and a worker that dies between journaling a cancellation (W1) and acknowledging it SHALL apply it once after restart and acknowledge its redelivery once.

#### Scenario: Cancel file
- **WHEN** the cancel commits after W4 or after the start, as the seed chooses
- **THEN** the attempt ends cancelled, a started process exits by `SIGKILL` under the cgroup supervisor, which kills the containment, and by `SIGTERM` under the macOS supervisor and the process-group launch host, and no scripted process remains

#### Scenario: Crash before the ack
- **WHEN** the worker is killed after W1 of the cancellation and restarted before or after the ack wait
- **THEN** the attempt ends cancelled, the cancellation is journaled once with its evidence, and the redelivery is acknowledged once

## REMOVED Requirements

### Requirement: Adoption cancel scenario on Linux
**Reason**: Race g now runs on macOS; the Linux skip is a scenario of "Adoption cancel scenario".
**Migration**: See "Adoption cancel scenario", scenario "Other hosts".
