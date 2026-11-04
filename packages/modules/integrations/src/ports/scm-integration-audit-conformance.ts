import { instantFromEpochMilliseconds, parseIdentifier, type Result } from '@taskelith/kernel';
import { expectCode, expectOneWinner, expectRead, type ConformanceCase } from '@taskelith/sdlc';
import { normalizeOrigin } from '../domain/normalized-origin.js';
import { ScmSecrets, type ScmIntegration, type ScmIntegrationId } from '../domain/scm-integration.js';
import type { ScmIntegrationAudit, ScmIntegrationAuditEntry, ScmIntegrationAuditEvent } from './scm-integration-audit.js';
import type { ScmIntegrations } from './scm-integrations.js';

// The audit that a store writes and its port reads, each case on an empty
// store and trail; every secret here is synthetic.
export interface ScmIntegrationAuditTarget {
  readonly store: ScmIntegrations;
  readonly audit: ScmIntegrationAudit;
}

const SECRETS = Object.freeze({ 'signing-key': 'synthetic-signing-key', 'webhook-secret': 'synthetic-webhook-secret' });
const SETTINGS = Object.freeze({ 'account-id': '42', 'merge-methods': 'squash' });

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

// An audit entry of the given actor at the given second of a fixed day.
export function auditEntry(actor = `p${'a'.repeat(32)}`, second = 0): ScmIntegrationAuditEntry {
  const at = must(instantFromEpochMilliseconds(Date.parse('2026-11-04T09:00:00.000Z') + second * 1000));
  return Object.freeze({ actor, reason: 'conformance', at });
}

const integrationId = (digit: string) => must(parseIdentifier('ScmIntegrationId', `i${digit.repeat(32)}`)) as ScmIntegrationId;
const secrets = (values: Readonly<Record<string, string>>) => must(ScmSecrets.of(values));
const ORIGIN = must(normalizeOrigin('https://git.example.com'));

function integration(digit: string): ScmIntegration {
  return Object.freeze({
    integrationId: integrationId(digit), pluginId: 'scm-example', label: 'Example', allowedOrigin: ORIGIN, settings: SETTINGS,
    secretNames: ['signing-key', 'webhook-secret'], revision: 1,
  });
}

async function added({ store }: ScmIntegrationAuditTarget, digit: string, entry = auditEntry()): Promise<ScmIntegration> {
  return must(await store.add(integration(digit), secrets(SECRETS), entry));
}

function event(
  digit: string, kind: ScmIntegrationAuditEvent['kind'], changedFields: readonly string[], revision: number, entry = auditEntry(),
): ScmIntegrationAuditEvent {
  return { integrationId: integrationId(digit), kind, actor: entry.actor, reason: entry.reason, changedFields, revision, occurredAt: entry.at };
}

const CREATED_FIELDS = Object.freeze([
  'pluginId', 'label', 'allowedOrigin', 'settings.account-id', 'settings.merge-methods', 'secrets.signing-key', 'secrets.webhook-secret',
]);

export const SCM_INTEGRATION_AUDIT_CONFORMANCE: readonly ConformanceCase<ScmIntegrationAuditTarget>[] = Object.freeze([
  {
    name: 'a creation is audited as created, naming every supplied field and secret, with its actor, reason, time, and revision 1',
    async check(target) {
      const problems: string[] = [];
      const entry = auditEntry(`p${'b'.repeat(32)}`, 5);
      await added(target, '1', entry);
      expectRead(problems, 'trail', await target.audit.trail(), [event('1', 'created', CREATED_FIELDS, 1, entry)]);
      return problems;
    },
  },
  {
    name: 'appended events read back in position order after the rows that the store wrote',
    async check(target) {
      const problems: string[] = [];
      await added(target, '2');
      await added(target, '1');
      const appended = event('2', 'updated', ['label'], 2, auditEntry(`p${'c'.repeat(32)}`, 9));
      expectRead(problems, 'append', await target.audit.append(appended), undefined);
      expectRead(problems, 'trail', await target.audit.trail(), [
        event('2', 'created', CREATED_FIELDS, 1), event('1', 'created', CREATED_FIELDS, 1), appended,
      ]);
      return problems;
    },
  },
  {
    name: 'an update names a changed label, each setting whose value differs, then the named secrets, as updated',
    async check(target) {
      const problems: string[] = [];
      const stored = await added(target, '1');
      const entry = auditEntry(`p${'d'.repeat(32)}`, 7);
      must(await target.store.update(stored.integrationId, {
        expectedRevision: 1, label: 'Renamed', allowedOrigin: ORIGIN, settings: { 'account-id': '43', region: 'eu' },
        secrets: secrets({ 'webhook-secret': 'synthetic-rotated-secret' }),
      }, entry));
      must(await target.store.update(stored.integrationId, { expectedRevision: 2, allowedOrigin: must(normalizeOrigin('https://git.example.org')) }, entry));
      expectRead(problems, 'trail', await target.audit.trail(), [
        event('1', 'created', CREATED_FIELDS, 1),
        event('1', 'updated', ['label', 'settings.account-id', 'settings.merge-methods', 'settings.region', 'secrets.webhook-secret'], 2, entry),
        event('1', 'updated', ['allowedOrigin'], 3, entry),
      ]);
      return problems;
    },
  },
  {
    name: 'an update that names only secrets, or unchanged fields beside them, is secret-changed, also with the stored value sent again',
    async check(target) {
      const problems: string[] = [];
      const stored = await added(target, '1');
      must(await target.store.update(stored.integrationId, { expectedRevision: 1, secrets: secrets({ 'webhook-secret': SECRETS['webhook-secret'] }) }, auditEntry()));
      must(await target.store.update(stored.integrationId, {
        expectedRevision: 2, label: 'Example', settings: SETTINGS, secrets: secrets({ ...SECRETS }),
      }, auditEntry()));
      expectRead(problems, 'trail', await target.audit.trail(), [
        event('1', 'created', CREATED_FIELDS, 1),
        event('1', 'secret-changed', ['secrets.webhook-secret'], 2),
        event('1', 'secret-changed', ['secrets.signing-key', 'secrets.webhook-secret'], 3),
      ]);
      const trail = JSON.stringify(await target.audit.trail());
      if (Object.values(SECRETS).some((secret) => trail.includes(secret))) problems.push('trail: holds a secret value');
      return problems;
    },
  },
  {
    name: 'a secret is named secrets.<name>, so a secret named label stays apart from the label field',
    async check(target) {
      const problems: string[] = [];
      const labelled = Object.freeze({ ...integration('1'), secretNames: ['label'] });
      must(await target.store.add(labelled, secrets({ label: 'synthetic-label-secret' }), auditEntry()));
      const { integrationId: id } = labelled;
      must(await target.store.update(id, { expectedRevision: 1, secrets: secrets({ label: 'synthetic-rotated-label' }) }, auditEntry()));
      must(await target.store.update(id, { expectedRevision: 2, label: 'Renamed' }, auditEntry()));
      expectRead(problems, 'trail', await target.audit.trail(), [
        event('1', 'created', ['pluginId', 'label', 'allowedOrigin', 'settings.account-id', 'settings.merge-methods', 'secrets.label'], 1),
        event('1', 'secret-changed', ['secrets.label'], 2),
        event('1', 'updated', ['label'], 3),
      ]);
      return problems;
    },
  },
  {
    name: 'an update that changes nothing still moves the revision and is audited as updated with no changed field',
    async check(target) {
      const problems: string[] = [];
      const stored = await added(target, '1');
      must(await target.store.update(stored.integrationId, { expectedRevision: 1 }, auditEntry()));
      must(await target.store.update(stored.integrationId, { expectedRevision: 2, label: 'Example', settings: { ...SETTINGS } }, auditEntry()));
      expectRead(problems, 'trail', await target.audit.trail(), [
        event('1', 'created', CREATED_FIELDS, 1), event('1', 'updated', [], 2), event('1', 'updated', [], 3),
      ]);
      return problems;
    },
  },
  {
    name: 'a refused creation or update writes no row',
    async check(target) {
      const problems: string[] = [];
      const stored = await added(target, '1');
      expectCode(problems, 'same identifier', await target.store.add(integration('1'), secrets(SECRETS), auditEntry()), 'conflict');
      expectCode(problems, 'missing', await target.store.update(integrationId('9'), { expectedRevision: 1, label: 'Missing' }, auditEntry()), 'not-found');
      expectCode(problems, 'stale', await target.store.update(stored.integrationId, { expectedRevision: 2, label: 'Ahead' }, auditEntry()), 'conflict');
      expectRead(problems, 'trail', await target.audit.trail(), [event('1', 'created', CREATED_FIELDS, 1)]);
      return problems;
    },
  },
  {
    name: 'of two concurrent updates at one revision only the winner is audited',
    async check(target) {
      const problems: string[] = [];
      const stored = await added(target, '1');
      const labels = ['First', 'Second'];
      const racing = await Promise.all(labels.map((label) => target.store.update(stored.integrationId, { expectedRevision: 1, label }, auditEntry())));
      expectOneWinner(problems, 'concurrent', racing);
      expectRead(problems, 'trail', await target.audit.trail(), [event('1', 'created', CREATED_FIELDS, 1), event('1', 'updated', ['label'], 2)]);
      return problems;
    },
  },
]);
