## MODIFIED Requirements

### Requirement: Worker channels
The AsyncAPI document SHALL define a command channel, an observation channel, and a heartbeat channel per installation and worker. The command channel SHALL carry the assignment offer, cancellation request, and assignment end commands, the observation confirmation, the inventory request, and the credential rotation notice. The observation channel SHALL carry every observation and the inventory report. The heartbeat channel SHALL carry only the worker heartbeat, over core NATS without a stream.

#### Scenario: Channel per worker
- **WHEN** a channel address is resolved
- **THEN** it names the installation and the worker

#### Scenario: Heartbeat channel
- **WHEN** the heartbeat channel address is resolved
- **THEN** it is `taskelith.<installationId>.workers.<workerId>.heartbeats`, and its only message is `worker.heartbeat`

## ADDED Requirements

### Requirement: Credential rotation notice
The AsyncAPI document SHALL define `worker.credentials.rotation-requested` on the command channel with the worker, the requested `credentialGeneration`, and the `deadline`, and no secret. The OpenAPI document SHALL define `renewWorkerCredentials` and `confirmWorkerCredentials` under the worker credential. A renewal request SHALL carry only the NKey public key and the SHA-256 of the bearer secret, and its answer the user JWT and the deadline.

#### Scenario: Notice with a secret
- **WHEN** a rotation notice carries a field beyond its schema, such as a bearer secret
- **THEN** validation fails

#### Scenario: Renewal with a secret
- **WHEN** a renewal request carries the bearer secret instead of its SHA-256
- **THEN** the request body is invalid
