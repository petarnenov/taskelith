## Why

G3 plan item 20 (`docs/g3-plan.md`, row 20) needs "a webhook receiver that verifies the raw body and handles redeliveries". The item 9a document already declares `receiveScmWebhook` (`POST /scm-integrations/{integrationId}/webhooks`), and the item 20 change `implement-github-scm-plugin-core` built the GitHub plugin's `verifyWebhookDelivery` (its design decision 5); no handler serves the operation yet. This fifth sub-change of item 20, `receive-scm-webhooks` (20e), builds it. It does not wait for the live conformance of 20d.

## What Changes

- The control plane serves `receiveScmWebhook` with no credential, in the order of the wire contract's section 5: it reads at most 25 MiB of raw bytes (`MAX_SCM_WEBHOOK_BODY_BYTES`, GitHub's documented payload cap; 413 beyond it), passes them with the lower-case headers to the integration's verifier, and only then parses. The general 1 MiB limit stays for the other operations.
- One identical 401 `WebhookRejection` (`signature-invalid`) for an unknown integration, an identifier that is not an `Identifier` or not valid percent-encoding, a missing signature, and a failed signature; an unknown or invalid integration's delivery first goes through a decoy verifier that does the GitHub plugin's work for the same signature header.
- A verified delivery that carries no event of the port answers 202 and records nothing only when it is eventless, for GitHub a `ping`, `installation`, or `installation_repositories` event, and its body is a JSON object; any other answers 400 `invalid` and records nothing.
- Every verified delivery answers 202; its event is recorded once per integration and `deliveryId`, also under two concurrent identical deliveries.
- The Integrations module gains the `ScmWebhookReceiver` use case and its ports `ScmIntegrationVerifiers` (integration to verifier, filled by the composition, empty until SCM integrations are stored) and `ScmWebhookDeliveries`; a third port, `EventlessDeliveries`, tells eventless deliveries; the control plane provides an in-memory verifier map, the GitHub decoy verifier, and GitHub's eventless events; the PostgreSQL adapter implements the deliveries.
- Migration `1792933700000_scm-webhook-deliveries` adds the table `scm_webhook_deliveries` with its down migration and no foreign key, storing the external identifiers as UTF-16LE bytes.
- The source control contract gains section 6.1 on receipt; the wire contract's section 5 names the limit and the no-event case.

## Capabilities

### Modified Capabilities

- `scm-port`: webhook receipt in the Integrations module, with its ports, one refusal for every unauthenticated case, the no-event case, and deduplication.
- `control-plane-api`: the receiver served over HTTP with its limit, order, statuses, and logs.
- `postgres-state`: the SCM webhook deliveries table.

## Impact

- Code: `packages/modules/integrations` (ports, use case), `packages/adapters/postgres` (migration, repository, dependency on `@taskelith/integrations`), `apps/control-plane` (route, raw body, handler, composition, dependency on `@taskelith/integrations`, development dependency on `@taskelith/scm-github` for tests), tests in all three and in `packages/plugins/scm-github`.
- Docs: `docs/contracts/source-control.md` sections 6 and 10, `docs/contracts/control-plane-wire-contracts.md` section 5 (prose only), and the regenerated inventory under `docs/dependencies/`.
- No OpenAPI, AsyncAPI, schema, or published `taskelith` package change; `verifyWebhookDelivery` and the draft port are unchanged.
