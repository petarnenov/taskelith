## Context

G3 plan item 20 is split; this is its sub-change 20e, `receive-scm-webhooks`, briefed by the coordinator for the worker Zaki. The operation is the existing `receiveScmWebhook` of the control-plane document ([wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 5, `WebhookRejection` in section 2, logs in section 7); the verification is the GitHub plugin's `verifyWebhookDelivery` ([implement-github-scm-plugin-core](/openspec/changes/archive/2026-11-03-implement-github-scm-plugin-core/design.md) decision 5), behind the draft port of the [source control contract](/docs/contracts/source-control.md) section 6. Coordinator decisions in force: the port stays draft; verification runs on the raw bytes with lower-case header names, before anything is parsed; a verified ping and `installation` or `installation_repositories` delivery answers 2xx without the port's event; `X-GitHub-Delivery` stays a string; credential state stays in memory.

Out of scope: SCM integration CRUD and secret storage, 20d live conformance, event consumers (items 23 and the board), ingress and TLS for an external sender (items 26 and 37), and any change of `verifyWebhookDelivery`.

## Goals / Non-Goals

**Goals:** a handler for the existing operation with the section 5 order, one indistinguishable refusal, deduplication that holds under concurrency, and ports that keep GitHub out of the kernel and modules.

**Non-goals:** a new or changed OpenAPI operation or response; consumers of the recorded events; integrations that a request can create.

## Decisions

### 1. Receiver in the Integrations module (Q1)

`ScmWebhookReceiver` (`packages/modules/integrations/src/application/webhook-receiver.ts`) takes four ports: `ScmIntegrationVerifiers`, a read port from an `ScmIntegrationId` to the integration's `WebhookVerifier` or none; `ScmWebhookDeliveries`, which records an event and answers `recorded` or `repeated`; a decoy `WebhookVerifier`; and `EventlessDeliveries`, which tells by its headers whether a verified delivery is one its service sends without an event of the port (decision 4). The ports live in `src/ports/webhook-receipt.ts` and are exported from the module's root, not from its `./port` entry, because plugins do not implement them. The module names no SCM; the control plane's composition fills the verifiers with `InMemoryScmIntegrationVerifiers`, empty until integrations are stored, and the same adapter serves the tests.

### 2. Order and the body limit (Q2)

The route declares `signedBodyLimit`, which makes `api-server.ts` read the body as bytes up to that limit, with the request's headers, whose names Node gives in lower case, and never parse it. The limit is `MAX_SCM_WEBHOOK_BODY_BYTES`, 25 MiB, after GitHub's documented 25 MB payload cap, used by this route only; `MAX_BODY_BYTES` stays 1 MiB for JSON bodies. A body over the limit fails with reason `body-too-large`, which only this route maps to 413, before any verifier runs. The receiver then verifies, and only after that does anything read the payload. The route has no session, CSRF, or role step: its security is `none`. Because any sender reaches it, a declared `content-length` over the limit answers 413 before a byte is read, and at most `MAX_CONCURRENT_WEBHOOKS`, 4, signed bodies are read and handled at once, as `MAX_CONCURRENT_UPLOADS` bounds evidence uploads; the others wait with their bodies held back by the socket (review pass 2 finding 1). The route's `keepsUndecodablePathParameters` flag, not its body limit, keeps an undecodable path parameter (finding 5).

### 3. One refusal and constant work (scope point 3)

An identifier that `parseIdentifier` refuses is never looked up; an unknown one is looked up and not found. In both cases the receiver runs the decoy, `GithubWebhookDecoy` of the composition, and then answers the same failure as a missing or failed signature: `forbidden`, reason `signature-invalid`, one fixed message. The decoy repeats the GitHub plugin's header-dependent work under a random per-process key: for a missing or malformed `x-hub-signature-256` it computes nothing, as the plugin returns before any HMAC; for a well-formed one it computes HMAC-SHA256 over the raw body and compares the digests with `timingSafeEqual` (review pass 1 finding 1). It names GitHub's header, so it lives in the composition, not the module. A path parameter that is not valid percent-encoding reaches this route undecoded and is then an unknown integration, where other routes answer 400. The tests check identical status and body text for all of these, that the decoy saw each delivery of an unknown or invalid integration, and, by counting the `node:crypto` HMAC and comparison calls, that an unknown and a known integration do the same work for a missing, malformed, short, wrong, and upper-case wrong signature; they assert no timing, which would be flaky.

### 4. Parse failures and deliveries without an event

The plugin checks the signature before anything else, so its `invalid` comes only for a verified delivery; it uses `invalid` both for a body it cannot parse and for a delivery without a `repository`, such as `ping` (core design decision 5). Without changing the plugin, the receiver accepts such a delivery as `no-event`, answered 202 and not recorded, only when the `EventlessDeliveries` port calls it eventless and its raw body decodes as strict UTF-8 JSON to an object; any other one answers 400 `invalid` and is not recorded. The composition's `GithubEventlessDeliveries` calls a delivery eventless when its `x-github-event` header is in the named set `GITHUB_EVENTLESS_EVENTS`: `ping`, `installation`, and `installation_repositories`, the events without a repository that core design decision 5 names (coordinator decision, 2026-11-03). So a verified `push` without a repository, or a verified `ping` whose body is no JSON object, answers 400. The module names no SCM. GitHub's signature covers the body only, not the headers (review pass 2 finding 2): a sender who has a signed body can resend it under another event or delivery header, so the event header is trusted only as far as TLS and the secret keep signed bodies from others. Such a resend adds at most one record per delivery identifier and never a payload that GitHub did not sign.

### 5. Deduplication (scope point 5)

`scm_webhook_deliveries` is keyed by `(integration_id, delivery_id)`. `CommittingScmWebhookDeliveries` records in one SERIALIZABLE transaction with `INSERT … ON CONFLICT (integration_id, delivery_id) DO NOTHING` and answers `recorded` when it inserted a row, else `repeated`. When two identical deliveries race, the second insert waits for the first and, its snapshot not seeing the committed row, fails to serialize; `PostgresDatabase` retries it and the retry answers `repeated`. The integration test holds both transactions after their first statement until both have arrived, and checks one row, one `recorded`, one `repeated`, and three attempts. Every verified delivery answers 202 regardless.

### 6. Migration (scope point 7)

`1792933700000_scm-webhook-deliveries` creates only the table: `kind` limited to the port's four `WEBHOOK_EVENT_KINDS`, `received_at` from the database clock, and no foreign key, since integrations are not stored yet. The port's external identifiers are any 1 to 1024 UTF-16 code units, and a `text` column rejects a NUL and cannot keep an unpaired surrogate through UTF-8, so the delivery identifier, repository, change request, and commit are `bytea` columns holding the identifier's UTF-16LE code units, checked to 2 to 2048 bytes of even length; the encoding is injective, so the key deduplicates exactly, and decoding it gives back the identifier (review pass 1 finding 2). The down migration drops the table.

### 7. Logs (scope point 8)

The request log is unchanged: its allowlist (wire contracts section 7) holds the method, the operation, the redacted path parameters, the status, and the failure code and reason; a delivery's body and headers, its signature included, never reach it. `failureResponse` redacts every failure, the receiver's messages are fixed texts, and a defective plugin event is reported by its field problems, not its values.

## Risks / Trade-offs

- The decoy repeats the GitHub plugin's work for each signature form, which a test compares with the plugin; a later plugin with other work leaves a timing difference between its unknown and known integrations until the composition gives it a matching decoy.
- The eventless rule is GitHub's: a later SCM plugin needs its own rule in the composition, or its eventless deliveries answer 400.
- The stored identifiers are UTF-16LE bytes, so reading them in SQL needs decoding; nothing reads them yet (items 23 and the board).
- A GitHub webhook configured with the `application/x-www-form-urlencoded` content type verifies but answers 400, as its body is no JSON object; the integration must use `application/json`.
- No integration is served until integrations are stored, so the installed receiver refuses every delivery with 401.
