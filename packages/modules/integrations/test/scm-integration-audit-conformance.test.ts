import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryScmIntegrationAudit, InMemoryScmIntegrations, SCM_INTEGRATION_AUDIT_CONFORMANCE, ScmSecrets, normalizeOrigin, type ScmIntegrationId,
} from '@taskelith/integrations';
import { err, failure, instantFromEpochMilliseconds, parseIdentifier } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

for (const conformance of SCM_INTEGRATION_AUDIT_CONFORMANCE) {
  test(`in-memory SCM integration audit: ${conformance.name}`, async () => {
    const audit = new InMemoryScmIntegrationAudit();
    assert.deepEqual(await conformance.check({ store: new InMemoryScmIntegrations(audit), audit }), []);
  });
}

// Refuses every append after the first `accepted` ones.
class RefusingAudit extends InMemoryScmIntegrationAudit {
  #accepted: number;

  constructor(accepted: number) {
    super();
    this.#accepted = accepted;
  }

  override async append(...event: Parameters<InMemoryScmIntegrationAudit['append']>) {
    if (this.#accepted === 0) return err(failure('internal', 'the audit refused the row'));
    this.#accepted -= 1;
    return super.append(...event);
  }
}

const ENTRY = { actor: `p${'a'.repeat(32)}`, reason: 'in-memory audit test', at: value(instantFromEpochMilliseconds(0)) };
const INTEGRATION = Object.freeze({
  integrationId: value(parseIdentifier('ScmIntegrationId', `i${'1'.repeat(32)}`)) as ScmIntegrationId, pluginId: 'scm-example',
  label: 'Example', allowedOrigin: value(normalizeOrigin('https://git.example.com')), settings: {}, secretNames: ['webhook-secret'], revision: 1,
});
const SECRETS = value(ScmSecrets.of({ 'webhook-secret': 'synthetic-webhook-secret' }));

test('in memory, a refused audit row fails the creation or update and keeps nothing of it', async () => {
  const refusingAll = new InMemoryScmIntegrations(new RefusingAudit(0));
  assert.equal(failed(await refusingAll.add(INTEGRATION, SECRETS, ENTRY)).code, 'internal');
  assert.equal(value(await refusingAll.get(INTEGRATION.integrationId)), undefined);
  const refusingUpdates = new InMemoryScmIntegrations(new RefusingAudit(1));
  value(await refusingUpdates.add(INTEGRATION, SECRETS, ENTRY));
  const rotated = value(ScmSecrets.of({ 'webhook-secret': 'synthetic-rotated-secret' }));
  assert.equal(failed(await refusingUpdates.update(INTEGRATION.integrationId, { expectedRevision: 1, label: 'Moved', secrets: rotated }, ENTRY)).code, 'internal');
  assert.deepEqual(value(await refusingUpdates.get(INTEGRATION.integrationId)), INTEGRATION);
  assert.deepEqual(value(await refusingUpdates.configurationOf(INTEGRATION.integrationId))?.secrets.reveal(), SECRETS.reveal());
});
