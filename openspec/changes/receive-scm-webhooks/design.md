## Context

G3 plan item 20 is split; this is its sub-change 20e, `receive-scm-webhooks`, briefed by the coordinator for the worker Zaki. The operation is the existing `receiveScmWebhook` of the control-plane document ([wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 5, `WebhookRejection` in section 2, logs in section 7); the verification is the GitHub plugin's `verifyWebhookDelivery` ([implement-github-scm-plugin-core](/openspec/changes/archive/2026-11-03-implement-github-scm-plugin-core/design.md) decision 5), behind the draft port of the [source control contract](/docs/contracts/source-control.md) section 6. Coordinator decisions in force: the port stays draft; verification runs on the raw bytes with lower-case header names, before anything is parsed; a verified ping and `installation` or `installation_repositories` delivery answers 2xx without the port's event; `X-GitHub-Delivery` stays a string; credential state stays in memory.

Out of scope: SCM integration CRUD and secret storage, 20d live conformance, event consumers (items 23 and the board), ingress and TLS for an external sender (items 26 and 37), and any change of `verifyWebhookDelivery`.

## Goals / Non-Goals

**Goals:** a handler for the existing operation with the section 5 order, one indistinguishable refusal, deduplication that holds under concurrency, and ports that keep GitHub out of the kernel and modules.

**Non-goals:** a new or changed OpenAPI operation or response; consumers of the recorded events; integrations that a request can create.

## Decisions

### 1. Receiver in the Integrations module (Q1)

`ScmWebhookReceiver` (`packages/modules/integrations/src/application/webhook-receiver.ts`) takes three ports: `ScmIntegrationVerifiers`, a read port from an `ScmIntegrationId` to the integration's `WebhookVerifier` or none; `ScmWebhookDeliveries`, which records an event and answers `recorded` or `repeated`; and a decoy `WebhookVerifier`. The ports live in `src/ports/webhook-receipt.ts` and are exported from the module's root, not from its `./port` entry, because plugins do not implement them. The module names no SCM; the control plane's composition fills the verifiers with `InMemoryScmIntegrationVerifiers`, empty until integrations are stored, and the same adapter serves the tests.

### 2. Order and the body limit (Q2)

The route declares `signedBodyLimit`, which makes `api-server.ts` read the body as bytes up to that limit, with the request's headers, whose names Node gives in lower case, and never parse it. The limit is `MAX_SCM_WEBHOOK_BODY_BYTES`, 25 MiB, after GitHub's documented 25 MB payload cap, used by this route only; `MAX_BODY_BYTES` stays 1 MiB for JSON bodies. A body over the limit fails with reason `body-too-large`, which only this route maps to 413, before any verifier runs. The receiver then verifies, and only after that does anything read the payload. The route has no session, CSRF, or role step: its security is `none`.

### 3. One refusal and constant work (scope point 3)

An identifier that `parseIdentifier` refuses is never looked up; an unknown one is looked up and not found. In both cases the receiver runs the decoy, `DecoyWebhookVerifier` of the composition: HMAC-SHA256 over the raw body under a random per-process key and a `timingSafeEqual`, the work of the plugin's own check, and then answers the same failure as a missing or failed signature: `forbidden`, reason `signature-invalid`, one fixed message. A path parameter that is not valid percent-encoding reaches this route undecoded and is then an unknown integration, where other routes answer 400. The tests check identical status and body text for all of these, and that the decoy saw each delivery of an unknown or invalid integration; they assert no timing, which would be flaky.

### 4. Parse failures and deliveries without an event

The plugin checks the signature before anything else, so its `invalid` comes only for a verified delivery; it uses `invalid` both for a body it cannot parse and for a delivery without a `repository`, such as `ping` (core design decision 5). Without changing the plugin, the receiver tells them apart by the raw body alone: a body that decodes as strict UTF-8 JSON to an object is a verified delivery that the port's event cannot carry, the receipt is `no-event`, answered 202 and not recorded; any other body answers 400 `invalid` and is not recorded. The rule names no SCM. A consequence: a verified JSON object without the plugin's delivery or event header also answers 202 without a record, where it could have been 400; GitHub always sends both headers.

### 5. Deduplication (scope point 5)

`scm_webhook_deliveries` is keyed by `(integration_id, delivery_id)`. `CommittingScmWebhookDeliveries` records in one SERIALIZABLE transaction with `INSERT … ON CONFLICT (integration_id, delivery_id) DO NOTHING` and answers `recorded` when it inserted a row, else `repeated`. When two identical deliveries race, the second insert waits for the first and, its snapshot not seeing the committed row, fails to serialize; `PostgresDatabase` retries it and the retry answers `repeated`. The integration test holds both transactions after their first statement until both have arrived, and checks one row, one `recorded`, one `repeated`, and three attempts. Every verified delivery answers 202 regardless.

### 6. Migration (scope point 7)

`1792933700000_scm-webhook-deliveries` creates only the table: `kind` limited to the port's four `WEBHOOK_EVENT_KINDS`, identifiers of 1 to 1024 characters as the port's external identifiers, `received_at` from the database clock, and no foreign key, since integrations are not stored yet. The down migration drops the table.

### 7. Logs (scope point 8)

The request log is unchanged: its allowlist (wire contracts section 7) holds the method, the operation, the redacted path parameters, the status, and the failure code and reason; a delivery's body and headers, its signature included, never reach it. `failureResponse` redacts every failure, the receiver's messages are fixed texts, and a defective plugin event is reported by its field problems, not its values.

## Risks / Trade-offs

- The decoy matches the GitHub plugin's work, HMAC-SHA256 over the body; a later plugin with other work leaves a timing difference between its unknown and known integrations until the decoy matches it.
- A verified JSON body that the plugin rejects for another reason than a missing repository answers 202 without a record (decision 4).
- A GitHub webhook configured with the `application/x-www-form-urlencoded` content type verifies but answers 400, as its body is no JSON object; the integration must use `application/json`.
- No integration is served until integrations are stored, so the installed receiver refuses every delivery with 401.
