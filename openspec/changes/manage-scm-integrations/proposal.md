## Why

G3 plan item 20 ([G3 plan](/docs/g3-plan.md) row 20) needs SCM integrations that an `installation-owner` sets up: until now the webhook receiver of sub-change 20e (`receive-scm-webhooks`) refuses every delivery with 401, because no integration is stored. The owner decided on 2026-11-03 that SCM integration management is 20f, the sixth change of item 20. The same change resolves the finding that 20e deferred (pass 2 finding 7): the composition copied the GitHub plugin's signature header, its form, and its eventless events.

## What Changes

- Handlers for the four existing operations of `control-plane.openapi.json`: `listScmIntegrations`, `createScmIntegration`, `readScmIntegration`, and `updateScmIntegration` ([control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) sections 3, 4, 4.1, and 6); no operation, response, or schema changes.
- In `@taskelith/integrations`: the domain's `normalizeOrigin` and `ScmSecrets`, the store port `ScmIntegrations`, `ScmIntegrationService`, `StoredScmIntegrationVerifiers`, an in-memory store, and the draft plugin descriptor `SourceControlPlugin` in the port entry.
- The plugin SDK re-exports the descriptor in its `draft` namespace and raises the plugin API to `0.4.0`; the GitHub and OpenSpec manifests declare `^0.4.0`. The GitHub plugin implements the descriptor with its settings `app-id`, `installation-id`, and `merge-methods` and its secrets `private-key` and `webhook-secret`, and owns its decoy and eventless rule.
- Migration `1792934000000_scm-integrations` with the PostgreSQL store; secrets are sealed with AES-256-GCM under the new control-plane key `scm-integration-secrets.key`, which installation initialization creates and the start requires.
- The composition serves store-backed verifiers, cached per revision, and takes the decoy and the eventless rule from the plugin.
- Documents: the source control contract sections 2, 6.1, 6.2, and 10, the wire contracts section 4, the installation contract's key table, and the G3 plan rows 11, 15, and 20.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scm-port`: the plugin descriptor, integration management, and store-backed verifiers.
- `control-plane-api`: the four operations, secrets in no answer or log, the secret key, and the GitHub webhook composition.
- `postgres-state`: the integration tables and sealed secrets.
- `plugin-registration`: plugin API `0.4.0` and the descriptor in the `draft` namespace.

## Impact

Private workspace packages only (`@taskelith/integrations`, `@taskelith/plugin-sdk`, `@taskelith/scm-github`, `@taskelith/sdlc-openspec`, `@taskelith/postgres`, `@taskelith/secrets`, `@taskelith/control-plane-store`, `@taskelith/control-plane`); the published `taskelith` package is unchanged, so the commit types are `chore`, `test`, and `docs`. `@taskelith/scm-github` becomes a runtime dependency of the control plane. Size L. Not in this change: `bindRepository` and `readRepositoryBinding` (11b), `createRun` and the G2 bridge (11c), deletion and rotation beyond an update, 20d live conformance, delivery to runs (item 21), the SPA screen (item 34), any change of the receiver's answers, limit, or deduplication, and a foreign key from `scm_webhook_deliveries`.
