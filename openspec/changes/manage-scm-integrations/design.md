## Context

G3 plan item 20 is split; this is its sixth change, 20f `manage-scm-integrations`, briefed by the coordinator for the worker Zaki after the owner's decision of 2026-11-03. Sources: the operations `listScmIntegrations`, `createScmIntegration`, `readScmIntegration`, and `updateScmIntegration` and the schemas `ScmIntegration`, `ScmIntegrationCreation`, `ScmIntegrationUpdate`, `ScmIntegrationPage`, `AllowedOrigin`, `NormalizedOrigin`, `SettingName`, `ScmSettings`, and `ScmSecrets` of `packages/contracts/documents/control-plane.openapi.json`; [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) sections 2 (order and failures), 3 (roles), 4 ("SCM integrations", "Compare-and-set"), 4.1 (remote origin), 5 (receiver), 6 (minted identifiers and pages), and 7 (write-only secrets, logs); the [source control contract](/docs/contracts/source-control.md) sections 2, 6.1, and 10; [ADR 0006](/docs/decisions/0006-github-first-scm.md); the archived changes [implement-github-scm-plugin-core](/openspec/changes/archive/2026-11-03-implement-github-scm-plugin-core/design.md) and [receive-scm-webhooks](/openspec/changes/archive/2026-11-03-receive-scm-webhooks/design.md), whose pass 2 finding 7 this change resolves; and the 13d precedent of a control-plane key, `session-output-tail.key`.

**Goals.** The four operations over a store with sealed secrets; the plugin checks its own settings and secrets; the receiver verifies deliveries of stored integrations; the composition copies no fact of the GitHub plugin.

**Non-goals.** `bindRepository` and `readRepositoryBinding` (11b); `createRun` and the G2 bridge (11c); deletion, and rotation beyond an update; 20d live conformance; delivery to runs (item 21); the SPA screen (item 34); any change of an OpenAPI operation, response, or schema, or of the receiver's answers, limit, or deduplication; a foreign key from `scm_webhook_deliveries`; audit events for an integration's creation, update, and secret change, a named follow-up in the scope of 11b (coordinator decision, Niki, 2026-11-03).

## Decisions

### 1. Operations (scope point 1)

`apps/control-plane/src/api/scm-integration-api.ts` maps the operations to `ScmIntegrationService` of `@taskelith/integrations` (`packages/modules/integrations/src/application/scm-integration-service.ts`), and `routes.ts` declares them on both listeners with `browserSession` or `operatorToken`, the CSRF header on a browser mutation, as the document's `security` says. The roles are those `ACCESS_REQUIREMENTS` already holds: any authenticated principal lists and reads, and only an `installation-owner` creates and updates; the server checks them before the body. The command does not check the role again in a transaction, because the owner role is installation-wide and kept outside the integrations module; a role removed between the check and the write is the one gap, which the wire contract does not close for this operation either.

- **List.** At most 100 integrations in code-unit order of the identifier, with `next` while more remain; the store reads one more than the page, and PostgreSQL compares `COLLATE "C"`. An `after` that is not an `Identifier` answers 400.
- **Create.** 201 with the integration at revision 1 and a minted identifier, `i` and 32 lowercase hexadecimal digits from 128 random bits; 404 for a `pluginId` that names no registered plugin.
- **Read.** 404 for an unknown integration.
- **Update.** Compare-and-set on `expectedRevision`: settings replace every setting, secrets replace only the named ones, label and origin replace their own; 404 for an unknown integration and 409 when the revision moved. The PostgreSQL store reads and writes in one SERIALIZABLE transaction, so of two concurrent updates the second's write meets the first's row, is retried by `PostgresDatabase`, and then fails with `conflict`; `scm-integrations.integration.test.ts` holds both transactions after their read until both have arrived, and `scm-integration-routes.test.ts` sends two concurrent requests.

Both bodies reach the `writeOnly` schema `ScmSecrets`, so the routes are `writeOnlyBody`, and a schema failure names only the fields at fault.

### 2. Setting and secret names (scope point 2)

The names are kebab-case `SettingName` values that the plugin defines. For GitHub:

| Kind | Name | Valid value |
| --- | --- | --- |
| Setting | `app-id` | The App's identifier: a positive decimal number of at most 20 digits |
| Setting | `installation-id` | The installation's identifier, in the same form |
| Setting | `merge-methods` | A comma-separated list, without spaces, of distinct port merge methods (`merge-commit`, `squash`, `rebase`) that the repositories allow |
| Secret | `private-key` | The App's private key, which `crypto.createPrivateKey` parses |
| Secret | `webhook-secret` | The webhook secret, not empty |

The module checks the settings as a whole set through the plugin, every secret it is given through the plugin, and on creation that every secret of the plugin's `secretNames` is given. A refusal is `invalid` with `details.setting` naming the setting or secret; the module answers with its own message, which names it and never quotes the plugin's message or the value. A body that the document's schema already refuses, such as an empty secret, a name that is not kebab-case, or a value that is no string, never reaches the plugin: the API server checks each entry of `settings` and `secrets` alone against `ScmSettings` or `ScmSecrets` and names the first refused one in `details.setting`, beside `details.violations`.

### 3. Allowed origin (scope point 3)

`normalizeOrigin` lives in the module's domain (`src/domain/normalized-origin.ts`), so that 11b reuses it for `bindRepository`. It accepts `https` in any case, a host name of labels of letters, digits, and inner hyphens, and an optional port from 1 to 65535, and gives `https://`, the host in lower case, `:`, and the port, 443 by default. Anything else fails with `invalid` and `details.field` `allowedOrigin`, without quoting the origin: another scheme, an IPv6 literal, user information, a path, a query, a fragment, or port 0. The document's `AllowedOrigin` admits 300 characters and `NormalizedOrigin` holds 300, so an origin whose normalized form would exceed 300 characters, such as one of 300 without a port, is refused rather than answered with an invalid response.

### 4. Persistence (scope point 4)

`packages/adapters/postgres/migrations/1792934000000_scm-integrations.sql` creates:

- `scm_integrations(integration_id text PRIMARY KEY CHECK (minted form), plugin_id, label CHECK (1 to 1024 characters), allowed_origin CHECK (normalized form with a port from 1 to 65535, the pattern of `NormalizedOrigin`, at most 300), settings jsonb CHECK (an object), revision integer CHECK (>= 1))`.
- `scm_integration_secrets(integration_id REFERENCES scm_integrations, name CHECK (SettingName), nonce bytea, sealed bytea, PRIMARY KEY (integration_id, name))`, one row per integration and name, like `slot_credentials`.

The down migration drops both. `scm_webhook_deliveries` keeps no foreign key, as the brief requires, so recorded deliveries do not depend on the integration's row. The store is `packages/adapters/postgres/src/scm-integrations.ts`, with its rows on `PostgresTransaction.scmIntegrations`. One conformance suite, `SCM_INTEGRATIONS_CONFORMANCE` in the module's ports, runs against both the PostgreSQL and the in-memory store: creation and readback, a missing integration, pages, whole-settings and named-secret replacement, and revision conflicts; the sealing and transaction-overlap tests stay PostgreSQL-specific.

### 5. Secrets at rest (scope point 5)

The secrets are sealed with `AesGcmSlotCredentialCipher` of `@taskelith/secrets` through `scmSecretCipher`, under the new control-plane key `scm-integration-secrets.key` (`ScmIntegrationSecretKeyFile`, a `ControlPlaneKeyFile`), never the slot credential key. Installation initialization creates it with `ensure()` when it is missing, also on a rerun, and the start reads it and refuses when it is missing, naming `init`, or of another size; the key never enters the database. The authenticated data is `taskelith-scm-integration-secret`, the integration, the secret's name, and the integration's revision. An update opens every kept secret and re-seals all of them under the new revision in its transaction, so a ciphertext of an earlier revision put back into a row no longer opens; a secret that does not open fails with `internal`, naming the secret.

### 6. Store-backed verifiers (scope point 6)

`StoredScmIntegrationVerifiers` of the module reads the integration's revision on each delivery, without opening secrets, and reuses the verifier it built for that integration and revision; a new revision opens the secrets, has the plugin build a provider, and replaces the cached one, so a changed webhook secret verifies the next delivery. An unknown integration, and a stored one whose plugin is not registered or cannot build its provider, gives no verifier, so the receiver runs the decoy and answers the one 401: a sender cannot tell a broken integration from an unknown one. The receiver itself is unchanged.

### 7. Plugin descriptor (scope point 7)

The draft `SourceControlPlugin` (`packages/modules/integrations/src/ports/source-control-plugin.ts`) is in the module's port entry beside `SourceControlProvider`, and the plugin SDK re-exports it in its `draft` namespace. It holds the manifest identifier, `secretNames`, `checkSettings`, `checkSecret`, `createProvider`, `createDecoy`, and `isEventless`. The plugin API goes to `0.4.0`, and both bundled manifests, `scm-github` and `sdlc-openspec`, declare `^0.4.0`, which `test/plugin-manifests.test.ts` checks. `SOURCE_CONTROL_PORT_VERSION` stays `0.2.0`, because no operation of `SourceControlProvider` changes; the coordinator accepted this decision (Niki, 2026-11-03). The GitHub plugin's `githubSourceControlPlugin` and `registerGithubSourceControlPlugin` implement it; its decoy and its verifier share one signature check, and `GITHUB_EVENTLESS_EVENTS` moves into the plugin. The composition (`apps/control-plane/src/composition/scm-integrations.ts`) takes the decoy and the eventless rule from the registered plugin and no longer names `x-hub-signature-256`, its form, `x-github-event`, or the events; `scm-webhook-decoy.test.ts` keeps counting the HMACs and comparisons, now against the plugin's decoy. Only an app's composition root, `apps/<app>/src/composition/`, may import a plugin package: `npm run check:boundaries` refuses any other product source that does, so no module, adapter, handler, or API file names `scm-github` (coordinator condition, Niki, 2026-11-03).

### 8. No secret value anywhere (scope point 8)

`ScmSecrets` keeps the values private and prints `[redacted]` from `toString`, `toJSON`, and inspection; only `reveal` gives them, to the cipher and the plugin's factory. A read returns `secretNames`, the stored names. Refusals name settings, never values; the cipher's failures name only the key's size. No audit event is added by this change: audit events for an integration's creation, update, and secret change are a named follow-up in the scope of 11b (coordinator decision, Niki, 2026-11-03). The route test checks that no answer or request log line holds a secret, also for a refused body.

### 9. Plan and documents (scope points 9 and 10)

The G3 plan's row 20 lists 20a to 20f, row 11 its sub-changes 11a to 11c, and row 15 depends on 8, 11, 13, and 14. The source control contract gains section 6.2 and updates rule 7, section 6.1, and section 10; the wire contracts section 4 states what is served; the installation contract lists the new key.

## Risks / Trade-offs

- The composition registers one SCM plugin, GitHub, whose decoy and eventless rule the receiver uses for every integration; a second plugin needs a receiver that picks them per integration. The coordinator accepted this limitation (Niki, 2026-11-03).
- No audit event records an integration's creation, update, or secret change; the wire contract asks for none, and they are a named follow-up in the scope of 11b (coordinator decision, Niki, 2026-11-03).
- Settings are stored as `jsonb`, which cannot hold a NUL; the GitHub plugin's checks refuse one first, and a later plugin that accepts one would answer 500.
- Every delivery reads the integration's revision from PostgreSQL before verification; an unknown integration costs the same read.
