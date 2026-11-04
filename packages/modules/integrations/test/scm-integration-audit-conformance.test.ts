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

  override async stage(...event: Parameters<InMemoryScmIntegrationAudit['stage']>) {
    if (this.#accepted === 0) return err(failure('internal', 'the audit refused the row'));
    this.#accepted -= 1;
    return super.stage(...event);
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

type Snapshot = readonly [stored: number | undefined, audited: number | undefined];

// Reads the store and the trail in one step after every microtask of
// `write`, so a reader between its two publications would see it.
async function snapshotsDuring(write: Promise<unknown>, read: () => Promise<Snapshot>): Promise<Snapshot[]> {
  let settled = false;
  const finished = write.then(() => { settled = true; });
  const reads: Promise<Snapshot>[] = [];
  while (!settled) {
    reads.push(read());
    await Promise.resolve();
  }
  await finished;
  return Promise.all(reads);
}

test('in memory, a reader during a write sees the integration and its audit row together or neither', async () => {
  const audit = new InMemoryScmIntegrationAudit();
  const store = new InMemoryScmIntegrations(audit);
  const read = async (): Promise<Snapshot> => {
    const [stored, trail] = [store.get(INTEGRATION.integrationId), audit.trail()];
    return [value(await stored)?.revision, value(await trail).at(-1)?.revision];
  };
  const created = await snapshotsDuring(store.add(INTEGRATION, SECRETS, ENTRY), read);
  const updated = await snapshotsDuring(store.update(INTEGRATION.integrationId, { expectedRevision: 1, label: 'Moved' }, ENTRY), read);
  const torn = [...created, ...updated].filter(([stored, audited]) => stored !== audited);
  assert.deepEqual(torn, []);
  assert.ok(created.length > 0 && updated.length > 0, 'the reads ran while the writes were in flight');
});
