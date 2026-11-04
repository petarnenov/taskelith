import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  REPOSITORY_BINDINGS_CONFORMANCE, ScmSecrets, normalizeOrigin,
  type BindingPut, type RepositoryBinding, type ScmIntegration, type ScmIntegrationId,
} from '@taskelith/integrations';
import { instantFromEpochMilliseconds, parseIdentifier } from '@taskelith/kernel';
import {
  PostgresDatabase, PostgresRepositoryBindings, PostgresScmIntegrations,
  type PostgresTransaction, type TransactionWork,
} from '@taskelith/postgres';
import { scmSecretCipher } from '@taskelith/secrets';
import { failed, value } from '@taskelith/testing';
import { createMigratedDatabase, query } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

const PROJECT_IDS = [`p${'1'.repeat(32)}`, `p${'2'.repeat(32)}`] as const;
const integrations = new PostgresScmIntegrations(database, value(scmSecretCipher(randomBytes(32))));
const bindings = new PostgresRepositoryBindings(database);
const ENTRY = { actor: `p${'a'.repeat(32)}`, reason: 'repository bindings test', at: value(instantFromEpochMilliseconds(0)) };

async function emptied(): Promise<void> {
  await query(url, 'TRUNCATE project_repository_bindings, scm_integration_secrets, scm_integrations, projects CASCADE');
  for (const projectId of PROJECT_IDS) {
    await query(url, "INSERT INTO projects (project_id, name, created_at, revision) VALUES ($1, 'Project', now(), 1)", [projectId]);
  }
}

// Each attempt's put awaits `pause` after its FOR SHARE read, so the
// transaction keeps the row lock while it waits.
function pausingAfterIntegrationRead(pause: () => Promise<void>): PostgresRepositoryBindings {
  const pausing = (tx: PostgresTransaction): PostgresTransaction => {
    const records = tx.repositoryBindings;
    const repositoryBindings = {
      get: (projectId: string) => records.get(projectId),
      integrationRevision: async (integrationId: ScmIntegrationId) => {
        const revision = await records.integrationRevision(integrationId);
        await pause();
        return revision;
      },
      insert: (binding: RepositoryBinding) => records.insert(binding),
      replace: (binding: RepositoryBinding, expected: number) => records.replace(binding, expected),
    };
    return Object.create(tx, { repositoryBindings: { value: repositoryBindings } }) as PostgresTransaction;
  };
  return new PostgresRepositoryBindings({
    readOnly: (work) => database.readOnly(work),
    transaction: (work) => database.transaction((tx) => work(pausing(tx))),
  });
}

const LOCK_WAIT_DEADLINE_MS = 30_000;
const LOCK_POLL_MS = 10;

// Polls for the update's backend blocked on the integration's row lock;
// the deadline only bounds a store whose update never waits.
async function untilUpdateWaits(): Promise<boolean> {
  const deadline = performance.now() + LOCK_WAIT_DEADLINE_MS;
  while (performance.now() < deadline) {
    const [row] = await query<{ waiting: boolean }>(url, `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'UPDATE scm_integrations %') AS waiting`);
    if (row!.waiting) return true;
    await delay(LOCK_POLL_MS);
  }
  return false;
}

for (const conformance of REPOSITORY_BINDINGS_CONFORMANCE) {
  test(`PostgreSQL repository bindings: ${conformance.name}`, async () => {
    await emptied();
    const target = { bindings, integrations, projectIds: PROJECT_IDS, pausingAfterIntegrationRead, untilUpdateWaits };
    assert.deepEqual(await conformance.check(target), []);
  });
}

async function added(): Promise<ScmIntegration> {
  const integration = {
    integrationId: value(parseIdentifier('ScmIntegrationId', `i${'1'.repeat(32)}`)) as ScmIntegrationId, pluginId: 'scm-example',
    label: 'Example', allowedOrigin: value(normalizeOrigin('https://git.example.com')), settings: {}, secretNames: ['webhook-secret'], revision: 1,
  };
  return value(await integrations.add(integration, value(ScmSecrets.of({ 'webhook-secret': 'synthetic-webhook-secret' })), ENTRY));
}

function firstPut(integration: ScmIntegration): BindingPut {
  return {
    projectId: PROJECT_IDS[0], integrationRevision: integration.revision,
    values: {
      integrationId: integration.integrationId, repository: 'acme/project', remoteUrl: 'https://git.example.com/acme/project.git',
      integrationBranch: 'main', mergeMethod: 'squash',
    },
  };
}

test('reads run in read-only transactions and a put in a read-write one', async () => {
  await emptied();
  const integration = await added();
  const kinds: string[] = [];
  const recording = {
    readOnly: <Value>(work: TransactionWork<Value>) => { kinds.push('read-only'); return database.readOnly(work); },
    transaction: <Value>(work: TransactionWork<Value>) => { kinds.push('read-write'); return database.transaction(work); },
  };
  const store = new PostgresRepositoryBindings(recording);
  value(await store.get(PROJECT_IDS[0]));
  value(await store.put(firstPut(integration)));
  assert.deepEqual(kinds, ['read-only', 'read-write']);
});

// The put's snapshot is taken before the update commits, so its locking
// read of the integration fails to serialize and its retry sees the change.
test('an integration update that commits while a put is open makes the put a conflict, never a stale binding', async () => {
  await emptied();
  const integration = await added();
  let attempts = 0;
  const overlapping = {
    readOnly: <Value>(work: TransactionWork<Value>) => database.readOnly(work),
    transaction: <Value>(work: TransactionWork<Value>) => database.transaction(async (tx) => {
      attempts += 1;
      await tx.scmIntegrations.page(undefined, 1);
      if (attempts === 1) value(await integrations.update(integration.integrationId, { expectedRevision: 1, label: 'Moved' }, ENTRY));
      return work(tx);
    }),
  };
  const refused = failed(await new PostgresRepositoryBindings(overlapping).put(firstPut(integration)));
  assert.equal(refused.code, 'conflict');
  assert.ok(attempts >= 2, 'the put was retried after the update');
  assert.equal(value(await bindings.get(PROJECT_IDS[0])), undefined);
});
