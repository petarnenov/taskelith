import type { Instant, Result } from '@taskelith/kernel';
import { codeUnitOrder, type ScmIntegration, type ScmIntegrationId } from '../domain/scm-integration.js';
import type { ScmIntegrationChange } from './scm-integrations.js';

export const SCM_INTEGRATION_AUDIT_KINDS = Object.freeze(['created', 'updated', 'secret-changed'] as const);

export type ScmIntegrationAuditKind = (typeof SCM_INTEGRATION_AUDIT_KINDS)[number];

// Who changes an integration, why, and when; the store adds what changed.
export interface ScmIntegrationAuditEntry {
  readonly actor: string;
  readonly reason: string;
  readonly at: Instant;
}

// Names the changed fields and secrets, never a value of one.
export interface ScmIntegrationAuditEvent {
  readonly integrationId: ScmIntegrationId;
  readonly kind: ScmIntegrationAuditKind;
  readonly actor: string;
  readonly reason: string;
  readonly changedFields: readonly string[];
  readonly revision: number;
  readonly occurredAt: Instant;
}

// The trail is in the order of appending.
export interface ScmIntegrationAudit {
  append(event: ScmIntegrationAuditEvent): Promise<Result<void>>;
  trail(): Promise<Result<readonly ScmIntegrationAuditEvent[]>>;
}

// Every field that the creation supplies, the secrets by name.
export function creationAudit(integration: ScmIntegration, entry: ScmIntegrationAuditEntry): ScmIntegrationAuditEvent {
  const settings = Object.keys(integration.settings).sort(codeUnitOrder).map((key) => `settings.${key}`);
  const changedFields = ['pluginId', 'label', 'allowedOrigin', ...settings, ...integration.secretNames.map(secretField)];
  return auditEvent(integration, 'created', changedFields, entry);
}

// Diffs only the non-secret fields; a secret counts as changed whenever
// the change names it, so no secret value is ever compared.
export function changeAudit(
  before: ScmIntegration, after: ScmIntegration, change: ScmIntegrationChange, entry: ScmIntegrationAuditEntry,
): ScmIntegrationAuditEvent {
  const fields = [
    ...(before.label === after.label ? [] : ['label']),
    ...(before.allowedOrigin === after.allowedOrigin ? [] : ['allowedOrigin']),
    ...changedSettings(before.settings, after.settings),
  ];
  const secrets = (change.secrets?.names() ?? []).map(secretField);
  const kind = fields.length === 0 && secrets.length > 0 ? 'secret-changed' : 'updated';
  return auditEvent(after, kind, [...fields, ...secrets], entry);
}

// Apart from the fields, as `settings.<key>` is, so a secret named
// `label` does not read as the label.
function secretField(name: string): string {
  return `secrets.${name}`;
}

function changedSettings(before: Readonly<Record<string, string>>, after: Readonly<Record<string, string>>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => before[key] !== after[key]).sort(codeUnitOrder).map((key) => `settings.${key}`);
}

function auditEvent(
  integration: ScmIntegration, kind: ScmIntegrationAuditKind, changedFields: readonly string[], entry: ScmIntegrationAuditEntry,
): ScmIntegrationAuditEvent {
  return Object.freeze({
    integrationId: integration.integrationId, kind, actor: entry.actor, reason: entry.reason,
    changedFields: Object.freeze([...changedFields]), revision: integration.revision, occurredAt: entry.at,
  });
}
