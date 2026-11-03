## Why

G3 plan item 11 ([G3 plan](/docs/g3-plan.md) row 11), sub-change 11b, binds a project to one repository of an SCM integration. `bindRepository` and `readRepositoryBinding` have been in `control-plane.openapi.json` since 9a, and the access requirements cover them, but no route, handler, or store serves them: both answer 500. Control-plane wire contracts section 4.1 also left a follow-up: once the SCM port derives a repository's remote URL, which item 20 added as `resolveRemoteUrl`, the binding's `remoteUrl` becomes output-only. The coordinator split 11b into 11b1, this change, and 11b2, the audit events of SCM integrations (Niki, 2026-11-03).

## What Changes

- In `@taskelith/integrations`: the domain's `RepositoryBinding`, the store port `RepositoryBindings` with one binding per project and its conformance suite, `RepositoryBindingService`, and an in-memory store.
- The service resolves the remote URL through the integration plugin's `resolveRemoteUrl` before and outside the store's transaction, checks its origin and the plugin's merge methods, and binds only while the integration keeps the revision it resolved against.
- Migration `1792934300000_project-repository-bindings` with the PostgreSQL store: one row per project, with foreign keys to `projects` and `scm_integrations`.
- Routes and handlers for `readRepositoryBinding` and `bindRepository`, and the composition.
- A declared contract break: `RepositoryBindingInput` loses `remoteUrl` and `RemoteUrlCandidate` is removed, so a request that still sends `remoteUrl` is refused with 400. `BindingRefusal` gains `repository-not-visible` and `integration-credential-refused` and loses the four remote URL format reasons, which only a client-sent URL could reach. `control-plane.openapi.json` goes to 0.5.0 with its `breaking-changes.json` entry, and the web client is regenerated.
- Documents: control-plane wire contracts sections 4, 4.1, 11, and 12, and the source control contract section 4.1.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the two binding operations, their roles, compare-and-set, the resolver failure statuses, and the stale resolution check.
- `control-plane-wire-contracts`: the remote URL resolved by the plugin, the new refusal reasons, and a rebind against running attempts.
- `scm-port`: the repository binding store port and its conformance suite.
- `postgres-state`: the repository binding table.

## Impact

Private workspace packages only (`@taskelith/contracts`, `@taskelith/integrations`, `@taskelith/postgres`, `@taskelith/control-plane`, `@taskelith/web`'s generated client); the published `taskelith` package is unchanged, so the commit types are `chore`, `test`, and `docs`. Size M. Not in this change: the audit events of SCM integrations (11b2), `createRun` and the G2 bridge (11c), any UI, live GitHub calls (tests use a fake plugin), and the per-run credential issue that re-checks the binding, which item 21 serves.
