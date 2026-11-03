## ADDED Requirements

### Requirement: Webhook receipt ports
The integrations module SHALL receive webhook deliveries through `ScmWebhookReceiver` over the ports `ScmIntegrationVerifiers`, which gives an integration's `WebhookVerifier` or none, and `ScmWebhookDeliveries`, which records a verified event, both outside the `./port` entry and naming no SCM. The receiver SHALL check a verified event's shape before it records it.

#### Scenario: Event of another shape
- **WHEN** a verifier returns an event whose kind is not one of `WEBHOOK_EVENT_KINDS`
- **THEN** the receipt fails with `internal` and nothing is recorded

### Requirement: One refusal for unauthenticated deliveries
The receiver SHALL refuse an integration identifier that is not a kernel identifier, an unknown integration, and a delivery that its verifier refuses with `forbidden` with one failure: `forbidden`, reason `signature-invalid`, and one message. For an unknown or invalid integration it SHALL first run a decoy verifier over the delivery.

#### Scenario: Unknown integration
- **WHEN** a delivery names an integration that the verifiers do not know
- **THEN** the decoy verifies the delivery and the receipt fails exactly as for a failed signature

### Requirement: Verified deliveries without an event
When a verifier fails with `invalid`, the receiver SHALL accept the delivery as `no-event` without recording it if its raw body is a JSON object in strict UTF-8, and SHALL otherwise fail with `invalid` and record nothing.

#### Scenario: Ping
- **WHEN** a verified delivery has a JSON object body without a repository
- **THEN** the receipt is `no-event` and nothing is recorded

#### Scenario: Unparseable payload
- **WHEN** a verified delivery's body is not valid UTF-8
- **THEN** the receipt fails with `invalid` and nothing is recorded

### Requirement: Webhook deduplication
The receiver SHALL record a verified event at most once per integration and `deliveryId`, answering `recorded` for the first delivery and `repeated` for every redelivery, also when identical deliveries arrive concurrently.

#### Scenario: Concurrent redelivery
- **WHEN** two identical deliveries are recorded at the same time
- **THEN** one answers `recorded`, the other `repeated`, and one event is stored
