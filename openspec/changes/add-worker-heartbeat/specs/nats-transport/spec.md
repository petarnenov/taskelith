## ADDED Requirements

### Requirement: Heartbeat receiver
The adapter SHALL receive every worker's heartbeats on `taskelith.<installationId>.workers.*.heartbeats` through one core NATS queue group, so that each heartbeat reaches one receiver, and SHALL keep them in no stream. It SHALL handle them one at a time, and SHALL drop and log a heartbeat that fails its schema, one that arrives while more than the pending bound wait, and one whose handler fails or throws, without retrying it. After a stop it SHALL handle no waiting heartbeat, and a subscription that closes without a stop SHALL fail the receiver.

#### Scenario: Two receivers in one group
- **WHEN** two receivers share the queue group and four workers each send a heartbeat
- **THEN** the receivers together handle four heartbeats, and no stream matches the heartbeat subject

#### Scenario: Malformed heartbeat
- **WHEN** a heartbeat fails the `WorkerHeartbeat` schema
- **THEN** its handler is not called and `nats.heartbeat.dropped` is logged with the reason

#### Scenario: Too many pending
- **WHEN** a heartbeat arrives while more than the pending bound wait
- **THEN** it is dropped with the reason `too many pending`

#### Scenario: Subscription closed by the server
- **WHEN** the heartbeat subscription closes with an error and no stop was requested
- **THEN** the receiver fails with that cause
