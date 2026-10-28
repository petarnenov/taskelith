## ADDED Requirements

### Requirement: Scenarios through the Linux cgroup supervisor
When the delegated cgroup and the execution account are set, as the privileged runner of `make verify-linux-g2-scenarios` sets them, each scenario worker, the crash-before-ack worker included, SHALL launch through the worker's own Linux launch host, the cgroup supervisor with the execution account, instead of the test-side process-group launch host. A partial launch, or a missing one under that runner, SHALL fail the scenario file.

#### Scenario: Privileged Linux runner
- **WHEN** `make verify-linux-g2-scenarios` runs the cancellation races
- **THEN** the scripted process of race h, and of race c when its cancel lands after the start, runs in a containment directly below its worker's own containment parent, and a check fails the scenario otherwise

#### Scenario: Launch required by the runner
- **WHEN** the runner requires the Linux launch and a launch variable is missing, or only some launch variables are set
- **THEN** the scenario file fails when it loads, naming the missing variables, and no scenario falls back to the process-group launch host

#### Scenario: Unprivileged run
- **WHEN** `make verify` runs the same files on a Linux host without those settings
- **THEN** the scenario workers launch through the process-group launch host and the containment check is skipped

## MODIFIED Requirements

### Requirement: Cancel after W4
A cancel of an assignment whose record is written SHALL terminate its process through the cancel file, and a worker that dies between journaling a cancellation (W1) and acknowledging it SHALL apply it once after restart and acknowledge its redelivery once.

#### Scenario: Cancel file
- **WHEN** the cancel commits after W4 or after the start, as the seed chooses
- **THEN** the attempt ends cancelled, a started process exits by `SIGKILL` under the cgroup supervisor, which kills the containment, and by `SIGTERM` under the process-group launch host, and no scripted process remains

#### Scenario: Crash before the ack
- **WHEN** the worker is killed after W1 of the cancellation and restarted before or after the ack wait
- **THEN** the attempt ends cancelled, the cancellation is journaled once with its evidence, and the redelivery is acknowledged once
