## ADDED Requirements

### Requirement: SCM webhook receiver served
The control plane SHALL serve `receiveScmWebhook` without a credential: it SHALL read at most 25 MiB of raw body, answering 413 beyond it before any verification and, for a declared length beyond it, before reading, read and handle at most a fixed number of deliveries at once, pass the bytes and the lower-case headers to the receiver, and answer 202 without a body for every accepted delivery, a repeat included. Other operations SHALL keep their body limits.

#### Scenario: Oversized delivery
- **WHEN** a delivery's body exceeds 25 MiB
- **THEN** the answer is 413 and no verifier sees the delivery

#### Scenario: Concurrent deliveries
- **WHEN** more deliveries arrive at once than the receiver handles
- **THEN** the others wait, unread, until one is answered

#### Scenario: Redelivery over HTTP
- **WHEN** a signed delivery arrives twice
- **THEN** both answers are 202 and its event is recorded once

### Requirement: Identical webhook rejection
The receiver SHALL answer 401 `WebhookRejection` with one identical body for an unknown integration, an identifier that is not an `Identifier` or not valid percent-encoding, a missing signature, and a failed signature, and SHALL answer 400 `invalid` for a verified delivery that carries no event and is not an eventless one with a JSON object body.

#### Scenario: Undecodable identifier
- **WHEN** the path's integration identifier is not valid percent-encoding
- **THEN** the answer is the same 401 as for a failed signature, not 400

#### Scenario: Verified push without a repository
- **WHEN** a verified GitHub `push` delivery has no repository
- **THEN** the answer is 400 `invalid` and nothing is recorded

### Requirement: GitHub webhook composition
For GitHub integrations the control plane's composition SHALL give the receiver a decoy that does the GitHub plugin's verification work for the same headers, and SHALL call eventless only a delivery whose `x-github-event` header is `ping`, `installation`, or `installation_repositories`.

#### Scenario: Missing signature of an unknown integration
- **WHEN** a delivery without a signature names an unknown integration and the same delivery a known GitHub one
- **THEN** both compute the same number of HMACs and comparisons, none

#### Scenario: Verified ping over HTTP
- **WHEN** a verified GitHub `ping`, `installation`, or `installation_repositories` delivery has a JSON object body
- **THEN** the answer is 202 and nothing is recorded

### Requirement: Webhook request logs
A request log line of `receiveScmWebhook` SHALL hold only the allowlisted parts of wire contracts section 7, never the delivery's body or any of its headers.

#### Scenario: Logged signed delivery
- **WHEN** a signed delivery is answered
- **THEN** its log line names the operation and status, and holds no signature or payload text
