import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryRepositoryBindings,
  InMemoryScmIntegrations,
  REPOSITORY_BINDINGS_CONFORMANCE,
  ScmSecrets,
  normalizeOrigin,
  type ScmIntegrationId,
} from '@taskelith/integrations';
import { parseIdentifier } from '@taskelith/kernel';
import { value } from '@taskelith/testing';

const PROJECT_IDS = [`p${'1'.repeat(32)}`, `p${'2'.repeat(32)}`] as const;

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => { resolve = settle; });
  return { promise, resolve };
}

for (const conformance of REPOSITORY_BINDINGS_CONFORMANCE) {
  test(`in-memory repository bindings: ${conformance.name}`, async () => {
    const integrations = new InMemoryScmIntegrations();
    const bindings = new InMemoryRepositoryBindings(integrations);
    assert.deepEqual(await conformance.check({ bindings, integrations, projectIds: PROJECT_IDS }), []);
  });
}

// Wire contracts section 4: as the PostgreSQL row lock does, an integration
// update that starts after a put's snapshot waits until the put is done.
test('in-memory repository bindings: an integration update after the put snapshot waits, so no stale binding is stored', async () => {
  const integrations = new InMemoryScmIntegrations();
  const integrationId = value(parseIdentifier('ScmIntegrationId', `i${'1'.repeat(32)}`)) as ScmIntegrationId;
  value(await integrations.add({
    integrationId, pluginId: 'scm-example', label: 'Example', allowedOrigin: value(normalizeOrigin('https://git.example.com')),
    settings: {}, secretNames: [], revision: 1,
  }, value(ScmSecrets.of({}))));
  const snapshot = deferred();
  const gate = deferred();
  const pausing = {
    exclusive: <T>(work: () => Promise<T>) => integrations.exclusive(work),
    get: async (id: ScmIntegrationId) => {
      const read = await integrations.get(id);
      snapshot.resolve();
      await gate.promise;
      return read;
    },
  };
  const bindings = new InMemoryRepositoryBindings(pausing);
  const finished: string[] = [];
  const putting = bindings.put({
    projectId: PROJECT_IDS[0], integrationRevision: 1,
    values: { integrationId, repository: 'acme/project', remoteUrl: 'https://git.example.com/acme/project.git', integrationBranch: 'main', mergeMethod: 'squash' },
  }).finally(() => finished.push('put'));
  await snapshot.promise;
  const updating = integrations.update(integrationId, { expectedRevision: 1, label: 'Renamed' }).finally(() => finished.push('update'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(value(await integrations.get(integrationId))?.revision, 1, 'the update waits for the put');
  gate.resolve();
  const [put, update] = await Promise.all([putting, updating]);
  assert.equal(value(put).revision, 1);
  assert.equal(value(update).revision, 2);
  assert.deepEqual(finished, ['put', 'update']);
});
