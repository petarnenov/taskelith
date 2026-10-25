## Purpose

The JetStream transport of commands and observations: topology, outbox publication, validating consumers, receiver deduplication, and quarantine with redrive.

## ADDED Requirements

### Requirement: Addressed topology
The adapter SHALL publish commands on `taskelith.<installationId>.workers.<workerId>.commands` and observations on `.observations`. It SHALL read each worker's commands through a durable pull consumer filtered to that worker's subject, and observations through independent durable consumers. It SHALL refuse an `installationId` or `workerId` outside 1-64 letters, digits, `_`, or `-`.

#### Scenario: Two workers
- **WHEN** outbox rows address two workers
- **THEN** each worker's consumer receives only its own command

#### Scenario: Subject syntax in an identifier
- **WHEN** a `workerId` contains `.`, `*`, or `>`
- **THEN** the adapter refuses the subject and the consumer

### Requirement: Outbox publication
The publisher SHALL publish an outbox row with `Nats-Msg-Id` set to its event identity, and SHALL mark it published only after the broker acknowledged it. A row the broker did not acknowledge SHALL be published again with the same identity. A later row of the same subject SHALL wait until the earlier one is marked.

#### Scenario: Killed after the broker acknowledgement
- **WHEN** the publisher is killed after the broker stored a row but before the outbox marked it
- **THEN** a rerun publishes it again under the same identity, the broker reports a duplicate, and the worker receives the command once

#### Scenario: Lost connection
- **WHEN** a publication runs while the connection to the broker is lost
- **THEN** it fails as `unavailable`, and its retry after the heal stores the message once

### Requirement: Acknowledgement after commit
A consumer SHALL acknowledge a message only after its handler reported the commit. It SHALL redeliver a message whose commit failed after a backoff, during which later messages MAY pass it, and SHALL extend `ack_wait` while a commit runs.

#### Scenario: Failed commit
- **WHEN** the handler fails the first delivery of a command
- **THEN** the command is delivered again with delivery count 2

#### Scenario: Long commit
- **WHEN** a commit takes twice `ack_wait`
- **THEN** the message is not delivered again meanwhile

### Requirement: Validation and quarantine
A consumer SHALL validate every message against its contract schema before the handler, and SHALL terminate a message that fails with the reason. A message terminated, or delivered `max_deliver` times, SHALL be copied into the quarantine stream with its source, subject, sequence, `Nats-Msg-Id`, consumer, delivery count, and reason. A command of an unsupported protocol version SHALL pass with its stable part.

#### Scenario: Malformed command
- **WHEN** a command subject carries a body that is not JSON
- **THEN** the handler never sees it, and the quarantine records it with the reason `not UTF-8 JSON`

#### Scenario: Exhausted command
- **WHEN** every commit of a command fails
- **THEN** after `max_deliver` deliveries the quarantine records it with the reason `max-deliveries`

### Requirement: Controlled redrive
A redrive SHALL publish a quarantined message on its original subject under the `Nats-Msg-Id` `<original>.redrive.<n>`, where `n` counts the redrives of that message, and SHALL remove the record.

#### Scenario: Redrive
- **WHEN** a quarantined command `command-1` is redriven
- **THEN** it is delivered with delivery count 1 under `command-1.redrive.1`, and the record is gone

### Requirement: Receiver deduplication
A receiver SHALL apply a message at most once per consumer by the identity in its body, through the `Inbox` port, independently of the broker's duplicate window.

#### Scenario: Repeat after the window
- **WHEN** the same command arrives twice under different `Nats-Msg-Id` values
- **THEN** the first delivery is `accepted` and the second `duplicate`

### Requirement: Transport bounds
Streams and consumers SHALL take the provisional bounds of the operational targets: 7 days or 10 GiB per stream, 1 MiB per message, `ack_wait` 30 s, `max_deliver` 5, `max_ack_pending` 4 per worker, and 10,000 queued commands per worker subject, rejecting new ones when full.

#### Scenario: Stream configuration
- **WHEN** the streams are created again
- **THEN** they are updated in place and carry these bounds
