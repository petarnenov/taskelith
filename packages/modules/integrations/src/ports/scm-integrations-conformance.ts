import { ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { expectCode, expectOneWinner, expectRead, expectSame, type ConformanceCase } from '@taskelith/sdlc';
import { normalizeOrigin } from '../domain/normalized-origin.js';
import { ScmSecrets, type ScmIntegration, type ScmIntegrationId } from '../domain/scm-integration.js';
import type { ScmIntegrations } from './scm-integrations.js';

// The `ScmIntegrations` contract that every adapter keeps, each case on an
// empty store; every secret here is synthetic.
const SECRETS = Object.freeze({ 'signing-key': 'synthetic-signing-key', 'webhook-secret': 'synthetic-webhook-secret' });
const ROTATED = 'synthetic-rotated-webhook-secret';

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const integrationId = (digit: string) => must(parseIdentifier('ScmIntegrationId', `i${digit.repeat(32)}`)) as ScmIntegrationId;
const secrets = (values: Readonly<Record<string, string>>) => must(ScmSecrets.of(values));

function integration(digit: string): ScmIntegration {
  return Object.freeze({
    integrationId: integrationId(digit), pluginId: 'scm-example', label: 'Example',
    allowedOrigin: must(normalizeOrigin('https://git.example.com')), settings: { 'account-id': '42', 'merge-methods': 'squash' },
    secretNames: ['signing-key', 'webhook-secret'], revision: 1,
  });
}

async function added(store: ScmIntegrations, digit: string): Promise<ScmIntegration> {
  return must(await store.add(integration(digit), secrets(SECRETS)));
}

async function revealed(store: ScmIntegrations, id: ScmIntegrationId): Promise<Result<unknown>> {
  const configuration = await store.configurationOf(id);
  return configuration.ok ? ok(configuration.value?.secrets.reveal()) : configuration;
}

export const SCM_INTEGRATIONS_CONFORMANCE: readonly ConformanceCase<ScmIntegrations>[] = Object.freeze([
  {
    name: 'an added integration reads back with its secret names, its configuration opens its secrets, and its identifier is taken',
    async check(store) {
      const problems: string[] = [];
      const stored = await added(store, '1');
      expectSame(problems, 'added', stored, integration('1'));
      expectRead(problems, 'read', await store.get(stored.integrationId), integration('1'));
      expectRead(problems, 'secrets', await revealed(store, stored.integrationId), SECRETS);
      expectCode(problems, 'same identifier', await store.add(integration('1'), secrets(SECRETS)), 'conflict');
      return problems;
    },
  },
  {
    name: 'a missing integration reads as none and its update fails with not-found',
    async check(store) {
      const problems: string[] = [];
      expectRead(problems, 'read', await store.get(integrationId('9')), undefined);
      expectRead(problems, 'configuration', await store.configurationOf(integrationId('9')), undefined);
      expectCode(problems, 'update', await store.update(integrationId('9'), { expectedRevision: 1, label: 'Missing' }), 'not-found');
      return problems;
    },
  },
  {
    name: 'pages follow the identifier in code-unit order after a key, to a limit',
    async check(store) {
      const problems: string[] = [];
      for (const digit of ['3', '1', '2']) await added(store, digit);
      const ids = async (after: string | undefined, limit: number) => {
        const page = await store.page(after, limit);
        return page.ok ? ok(page.value.map((found) => found.integrationId)) : page;
      };
      expectRead(problems, 'all', await ids(undefined, 10), ['1', '2', '3'].map(integrationId));
      expectRead(problems, 'after', await ids(integrationId('1'), 10), ['2', '3'].map(integrationId));
      expectRead(problems, 'limit', await ids(undefined, 2), ['1', '2'].map(integrationId));
      expectRead(problems, 'past the last', await ids(integrationId('3'), 10), []);
      return problems;
    },
  },
  {
    name: 'an update replaces the settings whole and only the named secrets, keeps what it does not name, and moves the revision by one',
    async check(store) {
      const problems: string[] = [];
      const stored = await added(store, '1');
      const allowedOrigin = must(normalizeOrigin('https://git.example.org:8443'));
      const changed = {
        ...stored, label: 'Renamed', allowedOrigin, settings: { 'account-id': '43' }, revision: 2,
      };
      expectRead(problems, 'update', await store.update(stored.integrationId, {
        expectedRevision: 1, label: 'Renamed', allowedOrigin, settings: { 'account-id': '43' }, secrets: secrets({ 'webhook-secret': ROTATED }),
      }), changed);
      expectRead(problems, 'read', await store.get(stored.integrationId), changed);
      expectRead(problems, 'secrets', await revealed(store, stored.integrationId), { ...SECRETS, 'webhook-secret': ROTATED });
      expectRead(problems, 'label only', await store.update(stored.integrationId, { expectedRevision: 2, label: 'Again' }),
        { ...changed, label: 'Again', revision: 3 });
      return problems;
    },
  },
  {
    name: 'a stale revision fails with conflict, and of two concurrent updates at one revision exactly one wins',
    async check(store) {
      const problems: string[] = [];
      const stored = await added(store, '1');
      expectCode(problems, 'stale', await store.update(stored.integrationId, { expectedRevision: 2, label: 'Ahead' }), 'conflict');
      const racing = await Promise.all(['First', 'Second'].map((label) => store.update(stored.integrationId, { expectedRevision: 1, label })));
      const winner = expectOneWinner(problems, 'concurrent', racing);
      const label = winner === undefined ? undefined : ['First', 'Second'][winner];
      expectRead(problems, 'after the race', await store.get(stored.integrationId), { ...stored, label, revision: 2 });
      return problems;
    },
  },
]);
