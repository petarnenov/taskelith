import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryScmIntegrations, SCM_INTEGRATIONS_CONFORMANCE } from '@taskelith/integrations';

for (const conformance of SCM_INTEGRATIONS_CONFORMANCE) {
  test(`in-memory SCM integrations: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryScmIntegrations()), []);
  });
}
