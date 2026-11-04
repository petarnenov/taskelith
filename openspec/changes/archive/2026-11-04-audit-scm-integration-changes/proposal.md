## Why

G3 plan item 11 ([G3 plan](/docs/g3-plan.md) row 11), sub-change 11b2, holds the audit events of an SCM integration's creation, update, and secret change, which the coordinator split from 11b on 2026-11-03 after 11b1 `bind-project-repository` landed (#436). Sub-change 20f `manage-scm-integrations` serves the four SCM integration operations but records no audit event: the handlers drop the caller, the service has no clock, and nothing tells an operator who set an integration's allowed origin or replaced its webhook secret.

## What Changes

- Migration `1792934400000_scm-integration-audit-events` creates `scm_integration_audit_events`: one immutable row per change with its integration, kind (`created`, `updated`, or `secret-changed`), actor, reason, changed field names, new revision, and time, guarded by `refuse_audit_change()`.
- In `@taskelith/integrations`: the `ScmIntegrationAudit` port (`append`, `trail`) with its shared conformance suite and an in-memory adapter. The `ScmIntegrations` store's `add` and `update` take a `ScmIntegrationAuditEntry` (actor, reason, time) and write the audit row in the same transaction as the change, from the changed field names they compute against their own before-state. The service takes the actor and reason from its caller and the time from an injected clock.
- The PostgreSQL adapter of the port and the audit write inside the store's SERIALIZABLE write transaction.
- The `createScmIntegration` and `updateScmIntegration` handlers pass the caller's principal as the actor and `control-plane API <operation>` as the reason; the composition injects the clock.
- The control-plane request log requirement names SCM integration secret values; control-plane wire contracts section 4 states what is audited.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the audited actor and reason of the two SCM integration commands, no row for a refusal, and no SCM secret value in a log line or audit record.
- `postgres-state`: the SCM integration audit table and its write in the change's transaction.
- `scm-port`: the audit port, its kinds, and the changed field names, decided without comparing secret values.

## Impact

Private workspace packages only (`@taskelith/integrations`, `@taskelith/postgres`, `@taskelith/control-plane`); the published `taskelith` package is unchanged, so the commit types are `chore`, `test`, and `docs`. `control-plane.openapi.json` is unchanged: no operation, schema, or status changes. Size S-M. Not in this change: reading the audit trail through the API, and any UI.
