## ADDED Requirements

### Requirement: Self-check at every start
At every start, before its broker session, a worker SHALL run each admission check it composes, the Linux containment check included, and, after its capacity declaration and pressure report, SHALL journal one `worker.self-check.reported` with every result. A check that throws SHALL be `failed`; a failed check SHALL NOT fail the start. Details SHALL be redacted and bounded. More than 8 checks, or a repeated or malformed check id, SHALL fail the start before it enrolls or opens its journal.

#### Scenario: Containment not delegated
- **WHEN** a Linux worker with a launch command starts and its containment parent is not delegated
- **THEN** it starts, and journals a report whose `linux-containment` result is `failed` with the problem

#### Scenario: macOS worker
- **WHEN** a macOS worker starts
- **THEN** it journals a report whose `linux-containment` result is `not-applicable` with `platform-not-covered`, without running the check

#### Scenario: Too many checks
- **WHEN** a worker composes 9 admission checks
- **THEN** its start fails before it enrolls or opens its journal, and no check runs

#### Scenario: Throwing check
- **WHEN** a check throws an error whose message holds a worker secret
- **THEN** the result is `failed`, its detail shows `[redacted]` in place of the secret, and the start succeeds

### Requirement: Not applicable decided only at the start
A worker SHALL decide that a check is `not-applicable` only at its start, only from its platform and whether a launch command is configured, and SHALL journal the result with its reason, `platform-not-covered` or `no-launch-command`, without running the check. A check that runs SHALL be `passed` or `failed`, never `not-applicable`.

#### Scenario: Linux worker without a launch command
- **WHEN** a Linux worker without a launch command starts
- **THEN** it journals `linux-containment` as `not-applicable` with `no-launch-command`, without running the check

#### Scenario: Check that tries to skip itself
- **WHEN** a check that runs answers with an outcome other than `passed`
- **THEN** the worker journals it as `failed`

### Requirement: No new work after a failed self-check
While the report of its current start holds a failed result, a worker SHALL refuse every new offer with `worker-self-check-failed` and SHALL request no launch authorization; it SHALL still apply cancellations and assignment ends, reconcile its executions, answer inventory requests, and send heartbeats.

#### Scenario: Offer after a failed self-check
- **WHEN** a worker whose current self-check failed receives an offer
- **THEN** it journals a refusal with `worker-self-check-failed` and requests no launch authorization
