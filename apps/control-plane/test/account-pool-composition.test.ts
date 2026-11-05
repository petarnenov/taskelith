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
  slotRevocationCommandId,
  startAccountPoolServices,
  type AccountPoolPorts,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
} from '@taskelith/control-plane';
import { ControlPlaneNamespace, SLOT_CREDENTIAL_KEY_FILE, SlotCredentialKeyFile } from '@taskelith/control-plane-store';
import { InMemoryTaskRepository, type AssignmentId } from '@taskelith/execution';
import { MAX_IDENTIFIER_LENGTH, ok, parseInstant, type Instant } from '@taskelith/kernel';
import { PostgresDatabase } from '@taskelith/postgres';
import {
  InMemorySlotCredentials,
  InMemoryTaskLineage,
  SlotSecret,
  parseDefaultCooldownMinutes,
  type ProviderCredentialId,
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
  harnessId, mechanismId, allowedProjects: ['project-1'], credential: `fixture-${randomBytes(12).toString('hex')}`,
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
  return { namespace: space, database, projects: EVERY_PROJECT, defaultCooldown: value(parseDefaultCooldownMinutes(60)) };
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
