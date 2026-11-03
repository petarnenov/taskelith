import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryRepositoryBindings, InMemoryScmIntegrations, REPOSITORY_BINDINGS_CONFORMANCE } from '@taskelith/integrations';

const PROJECT_IDS = [`p${'1'.repeat(32)}`, `p${'2'.repeat(32)}`] as const;

for (const conformance of REPOSITORY_BINDINGS_CONFORMANCE) {
  test(`in-memory repository bindings: ${conformance.name}`, async () => {
    const integrations = new InMemoryScmIntegrations();
    const bindings = new InMemoryRepositoryBindings(integrations);
    assert.deepEqual(await conformance.check({ bindings, integrations, projectIds: PROJECT_IDS }), []);
  });
}
