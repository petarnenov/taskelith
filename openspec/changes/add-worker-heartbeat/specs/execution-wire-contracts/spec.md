## MODIFIED Requirements

### Requirement: Worker channels
The AsyncAPI document SHALL define a command channel, an observation channel, and a heartbeat channel per installation and worker. The command channel SHALL carry the assignment offer, cancellation request, and assignment end commands and the observation confirmation. The observation channel SHALL carry every observation and the inventory report. The heartbeat channel SHALL carry only the worker heartbeat, over core NATS without a stream.

#### Scenario: Channel per worker
- **WHEN** a channel address is resolved
- **THEN** it names the installation and the worker

#### Scenario: Heartbeat channel
- **WHEN** the heartbeat channel address is resolved
- **THEN** it is `taskelith.<installationId>.workers.<workerId>.heartbeats`, and its only message is `worker.heartbeat`

## ADDED Requirements

### Requirement: Worker heartbeat
The AsyncAPI document SHALL define `WorkerHeartbeat` with `messageType` `worker.heartbeat`, `schemaVersion`, `protocolVersion`, `workerId`, `journalId`, and `sentAt`, and no other property. A heartbeat SHALL be outside the journal sequence and SHALL be neither confirmed nor deduplicated. Adding it SHALL raise the document's `info.version` to `0.4.0`.

#### Scenario: Capacity in a heartbeat
- **WHEN** a heartbeat also carries a capacity field
- **THEN** it fails its schema

#### Scenario: Missing journal
- **WHEN** a heartbeat has no `journalId`
- **THEN** it fails its schema
