import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  ADMITTED_SLOT_DELIVERIES,
  CLAUDE_CODE_HARNESS_ID,
  SLOT_CREDENTIAL_SWEEP_MILLISECONDS,
  accountPoolServices,
  logSlotCredentialSweep,
  slotRevocationCommandId,
  startAccountPoolServices,
  type AccountPoolPorts,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
} from '@taskelith/control-plane';
import { ControlPlaneNamespace, SLOT_CREDENTIAL_KEY_FILE, SlotCredentialKeyFile } from '@taskelith/control-plane-store';
import { InMemoryTaskRepository, type AssignmentId, type HarnessPluginId } from '@taskelith/execution';
import { err, failure, MAX_IDENTIFIER_LENGTH, ok, parseInstant, type CorrelationId, type Instant } from '@taskelith/kernel';
import { runPeriodically } from '@taskelith/node-observability';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { PostgresDatabase } from '@taskelith/postgres';
import {
  InMemorySlotCredentials,
  InMemoryTaskLineage,
  SlotCredentialsUnavailable,
  SlotSecret,
  FIRST_SLOT_REVISION,
  parseAccountSlot,
  parseDefaultCooldownMinutes,
  parseSlotCredentialVersion,
  type ProjectId,
  type ProviderCredentialId,
  type SlotCredentialSweep,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import { failed, id, value } from '@taskelith/testing';
import { inMemoryCapacity } from './in-memory-capacity.ts';

const ownerUid = process.getuid!();
const AT: Instant = value(parseInstant('2026-11-05T09:00:00.000Z'));
const EVERY_PROJECT = { readProject: async () => ok({}) };
let base: string | undefined;
let database: PostgresDatabase | undefined;

afterEach(async () => {
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  await database?.close();
  base = undefined;
  database = undefined;
});

// An in-memory transaction with the capacity members a slot command uses.
function transaction(): ControlPlaneTransaction {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  return { tasks, lineage, ...inMemoryCapacity(tasks, lineage), now: async () => AT } as unknown as ControlPlaneTransaction;
}

function ports(tx: ControlPlaneTransaction, minutes = 30): AccountPoolPorts {
  const store: ControlPlaneStore = { transaction: (work) => work(tx), readCommitted: (work) => work(tx) };
  return { store, credentials: new InMemorySlotCredentials(() => AT), projects: EVERY_PROJECT, defaultCooldown: value(parseDefaultCooldownMinutes(minutes)) };
}

const addition = (mechanismId = 'subscription-token', harnessId: string = CLAUDE_CODE_HARNESS_ID) => ({
  harnessId, mechanismId, allowedProjects: ['project-1'], secret: value(SlotSecret.of(`fixture-${randomBytes(12).toString('hex')}`)),
});

test('Claude Code admits one subscription-token slot, and no other mechanism or harness', async () => {
  assert.deepEqual(ADMITTED_SLOT_DELIVERIES, [{ harnessId: 'claude-code', mechanismId: 'subscription-token', delivery: 'subscription-token', slotLimit: 1 }]);
  const { slots } = accountPoolServices(ports(transaction()));
  const added = value(await slots.add(addition()));
  assert.match(added.id, /^s[0-9a-f]{32}$/);
  const second = failed(await slots.add(addition()));
  assert.deepEqual([second.code, second.details.slotLimit], ['invalid', '1']);
  assert.equal(failed(await slots.add(addition('device-login'))).code, 'invalid');
  assert.equal(failed(await slots.add(addition('subscription-token', 'other-harness'))).code, 'invalid');
});

test('the default cooldown of the settings reaches the limit signal of a reserved slot', async () => {
  const tx = transaction();
  const { slots, signals } = accountPoolServices(ports(tx, 30));
  const slot = value(await slots.add(addition()));
  const assignmentId = id('AssignmentId', 'assignment-1') as AssignmentId;
  const reserved = { get: async () => ok({ reservation: { providerCredentials: [slot.id] } }) };
  const cooled = value(await signals.applyLimit({ ...tx, assignments: reserved } as unknown as ControlPlaneTransaction, {
    assignmentId, signal: { kind: 'account-signal', signal: 'limit' },
  }));
  assert.equal(signals.defaultCooldown, 30);
  assert.deepEqual(cooled.cooldown, { until: '2026-11-05T09:30:00.000Z', source: 'default' });
});

test('a sweep that rejects is answered as unavailable and never thrown', async () => {
  const tx = transaction();
  const credentials = new InMemorySlotCredentials(() => AT);
  credentials.listStored = async () => { throw new Error('store unreachable'); };
  const services = accountPoolServices({ ...ports(tx), credentials });
  const refused = failed(await services.sweep());
  assert.deepEqual([refused.code, refused.message], ['unavailable', 'the slot credential sweep did not finish']);
  assert.equal(SLOT_CREDENTIAL_SWEEP_MILLISECONDS, 3_600_000);
});

test('a sweep discards a version that no record names once it is older than the grace age', async () => {
  const tx = transaction();
  const clock = { now: value(parseInstant('2026-11-05T07:00:00.000Z')) };
  const credentials = new InMemorySlotCredentials(() => clock.now);
  const orphan = id('ProviderCredentialId', 'slot-orphan') as ProviderCredentialId;
  await credentials.store(orphan, value(SlotSecret.of('fixture-orphan')));
  const swept = value(await accountPoolServices({ ...ports(tx), credentials }).sweep());
  assert.deepEqual(swept, { sweptSlots: [orphan], failedSlots: [] });
  assert.deepEqual(credentials.storedVersions(orphan), []);
});

const SWEEP_FAILED = 'scheduling.slot-credentials.sweep-failed';
const logs = () => {
  const sink = new InMemoryLogSink();
  return { sink, logger: new Logger(sink, { now: () => AT }) };
};

test('a sweep that leaves slots is logged by count, without any credential, and the next sweep of the loop clears them', async () => {
  const tx = transaction();
  const credentials = new InMemorySlotCredentials(() => value(parseInstant('2026-11-05T07:00:00.000Z')));
  const credential = `fixture-${randomBytes(12).toString('hex')}`;
  const orphan = id('ProviderCredentialId', 'slot-orphan') as ProviderCredentialId;
  const removed = id('ProviderCredentialId', 'slot-removed') as ProviderCredentialId;
  const secret = value(SlotSecret.of(credential));
  await credentials.store(orphan, secret);
  await credentials.store(removed, secret);
  value(await tx.accountSlots.add(value(parseAccountSlot({
    id: removed, harnessId: id('HarnessPluginId', 'other-harness') as HarnessPluginId, mechanismId: id('SubscriptionMechanismId', 'subscription-token') as SubscriptionMechanismId,
    credentialVersion: value(parseSlotCredentialVersion(1)), allowedProjects: ['project-1' as ProjectId], concurrencyLimit: 1, state: 'removed', health: 'healthy', revision: FIRST_SLOT_REVISION,
  }))));
  const { discard, destroy } = credentials;
  credentials.discard = async () => {
    credentials.discard = discard;
    throw new Error(`the discard of ${credential} failed`);
  };
  credentials.destroy = async () => {
    credentials.destroy = destroy;
    throw new Error(`the destroy of ${credential} failed`);
  };
  const { sink, logger } = logs();
  const services = accountPoolServices({ ...ports(tx), credentials });
  const sweeps: SlotCredentialSweep[] = [];
  const controller = new AbortController();
  await runPeriodically(async () => {
    const sweep = await services.sweep();
    logSlotCredentialSweep(logger, sweep);
    sweeps.push(value(sweep));
    if (sweeps.length === 2) controller.abort();
  }, controller.signal, 1);
  assert.deepEqual(sweeps, [{ sweptSlots: [], failedSlots: [orphan, removed] }, { sweptSlots: [orphan, removed], failedSlots: [] }]);
  assert.deepEqual(sink.records.map(({ level, event, fields }) => [level, event, fields]), [['warn', SWEEP_FAILED, { failedSlots: 2, sweptSlots: 0 }]]);
  assert.equal(JSON.stringify(sink.records).includes(credential), false, 'a log record holds the credential');
  assert.deepEqual([credentials.storedVersions(orphan), credentials.storedVersions(removed)], [[], []]);
});

test('a sweep that did not finish is logged with its failure', () => {
  const { sink, logger } = logs();
  logSlotCredentialSweep(logger, err(failure('unavailable', 'the slot credential sweep did not finish')));
  assert.deepEqual(sink.records.map(({ level, event, fields }) => [level, event, fields]), [
    ['warn', SWEEP_FAILED, { code: 'unavailable', message: 'the slot credential sweep did not finish' }],
  ]);
});

const CREDENTIAL_STORE_REFUSALS = [
  {
    code: 'internal', message: 'the slot credential could not be stored',
    rejection: (secret: SlotSecret) => new Error(`the insert of ${secret.reveal()} failed`),
  },
  { code: 'unavailable', message: 'the slot credential store is unavailable', rejection: () => new SlotCredentialsUnavailable() },
];

for (const { code, message, rejection } of CREDENTIAL_STORE_REFUSALS) {
  test(`a credential store refusal is the fixed ${code} failure of add and rotate, never an exception`, async () => {
    const tx = transaction();
    const credentials = new InMemorySlotCredentials(() => AT);
    const { slots } = accountPoolServices({ ...ports(tx), credentials });
    const slot = value(await slots.add(addition()));
    value(await slots.revoke({ id: slot.id, expectedRevision: 1 }, id('CorrelationId', 'correlation-1') as CorrelationId));
    credentials.store = async (_slotId, secret) => {
      throw rejection(secret);
    };
    const credential = `fixture-${randomBytes(12).toString('hex')}`;
    const secret = value(SlotSecret.of(credential));
    const refusedAdd = failed(await slots.add({ ...addition(), secret }));
    const refusedRotation = failed(await slots.rotate({ id: slot.id, expectedRevision: 2, secret }));
    for (const refused of [refusedAdd, refusedRotation]) {
      assert.deepEqual([refused.code, refused.message, refused.details], [code, message, {}]);
      assert.equal(JSON.stringify(refused).includes(credential), false, 'a failure holds the credential');
    }
  });
}

const STORE_FAILED = 'scheduling.slot-credentials.store-failed';
const quotingMessage = (secret: SlotSecret) => `the insert of ${secret.reveal()} failed`;

class SlotStoreFault extends Error {}

// Add and rotate a slot over a store that rejects each write as told.
async function logsOfRejectedStores(rejection: (secret: SlotSecret) => unknown) {
  const { sink, logger } = logs();
  const credentials = new InMemorySlotCredentials(() => AT);
  const { slots } = accountPoolServices({ ...ports(transaction()), credentials, logger });
  const slot = value(await slots.add(addition()));
  value(await slots.revoke({ id: slot.id, expectedRevision: 1 }, id('CorrelationId', 'correlation-1') as CorrelationId));
  credentials.store = async (_slotId, secret) => {
    throw rejection(secret);
  };
  const credential = `fixture-${randomBytes(12).toString('hex')}`;
  const secret = value(SlotSecret.of(credential));
  failed(await slots.add({ ...addition(), secret }));
  failed(await slots.rotate({ id: slot.id, expectedRevision: 2, secret }));
  return { credential, records: sink.records.filter(({ event }) => event === STORE_FAILED), written: JSON.stringify(sink.records) };
}

const UNEXPECTED_STORE_REJECTIONS = [
  { thrown: 'an Error', errorType: 'SlotStoreFault', rejection: (secret: SlotSecret) => new SlotStoreFault(quotingMessage(secret)) },
  { thrown: 'a non-Error', errorType: 'non-error', rejection: quotingMessage },
];

for (const { thrown, errorType, rejection } of UNEXPECTED_STORE_REJECTIONS) {
  test(`${thrown} from the credential store is logged by constructor name only`, async () => {
    const { credential, records, written } = await logsOfRejectedStores(rejection);
    assert.deepEqual(records.map(({ level, fields }) => [level, fields]), [['error', { errorType }], ['error', { errorType }]]);
    assert.equal(written.includes(credential), false, 'a log record holds the credential');
    assert.equal(written.includes('the insert of'), false, 'a log record holds the message');
  });
}

test('an unavailable credential store is not logged here, the request log has its failure', async () => {
  const { records } = await logsOfRejectedStores(() => new SlotCredentialsUnavailable());
  assert.deepEqual(records, []);
});

test('the revocation command of an assignment is stable, its own, and bounded', () => {
  const first = id('AssignmentId', 'assignment-1') as AssignmentId;
  const longest = id('AssignmentId', 'a'.repeat(MAX_IDENTIFIER_LENGTH)) as AssignmentId;
  assert.equal(slotRevocationCommandId(first), slotRevocationCommandId(first));
  assert.notEqual(slotRevocationCommandId(first), slotRevocationCommandId(longest));
  for (const assignmentId of [first, longest]) assert.match(slotRevocationCommandId(assignmentId), /^v[0-9a-f]{64}$/);
});

function namespace(): ControlPlaneNamespace {
  base = mkdtempSync(join(tmpdir(), 'taskelith-slot-pool-'));
  return value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid }));
}

// The pool connects on first use only, so no server is needed here.
function startPorts(space: ControlPlaneNamespace) {
  database = new PostgresDatabase(new URL('postgres://nobody@127.0.0.1:9/none'));
  return { namespace: space, database, projects: EVERY_PROJECT, defaultCooldown: value(parseDefaultCooldownMinutes(60)), logger: logs().logger };
}

test('the account pool starts with the slot credential key that initialization created', () => {
  const space = namespace();
  value(new SlotCredentialKeyFile(space).ensure());
  const started = value(startAccountPoolServices(startPorts(space)));
  assert.equal(started.signals.defaultCooldown, 60);
});

test('a missing slot credential key refuses the start, names init, and is never created at start', () => {
  const space = namespace();
  const refused = failed(startAccountPoolServices(startPorts(space)));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', 'slot-credential-key is missing; run init']);
  assert.equal(existsSync(join(space.directory, SLOT_CREDENTIAL_KEY_FILE)), false);
});

test('a slot credential key of the wrong size refuses the start without a key byte', () => {
  const space = namespace();
  const key = Buffer.from('sentinel-slot-key-bytes');
  writeFileSync(join(space.directory, SLOT_CREDENTIAL_KEY_FILE), JSON.stringify({ format: 1, key: key.toString('base64') }), { mode: 0o600 });
  const refused = failed(startAccountPoolServices(startPorts(space)));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', `slot-credential-key has ${key.length} bytes, not 32`]);
  assert.equal(JSON.stringify(refused).includes(key.toString('base64')), false);
});
