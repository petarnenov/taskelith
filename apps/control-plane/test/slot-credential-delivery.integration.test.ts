import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import pg from 'pg';
import {
  LaunchRevokingFleetRegistry,
  SlotCredentialDeliveryService,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
  type RevealedSlotDelivery,
  type SlotCredentialFetchRequest,
} from '@taskelith/control-plane';
import { executionsUnderAssignment, type HarnessPluginId, type LaunchGrant, type LaunchOutcome, type RecoveryEpoch } from '@taskelith/execution';
import { fleetToken, fleetWorker, type WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { connectTransport, ensureStreams, JetStreamPublisher, OutboxPublisher, TRANSPORT_LIMITS, TransportAddress } from '@taskelith/nats';
import { PostgresDatabase, PostgresOutboxRelay, PostgresSlotCredentials, migrate } from '@taskelith/postgres';
import {
  SlotSecret,
  StaticAdmittedDeliveries,
  createAssignment,
  endAssignment,
  parseAccountSlot,
  type AdmittedPair,
  type ProjectId,
  type ProviderCredentialId,
  type SlotCredentials,
  type SlotRequest,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import { AesGcmSlotCredentialCipher } from '@taskelith/secrets';
import { nextGeneration, nextOwnershipGeneration, type OwnershipGeneration } from '@taskelith/sdlc';
import { failed, id, integrationEndpoint, integrationSecret, value } from '@taskelith/testing';
import { createLaunchRun, launchAuthority, placedTask, type Placed } from './launch-fixtures.ts';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const NATS = integrationEndpoint('TASKELITH_NATS_URL');

async function sql<Row extends pg.QueryResultRow>(url: URL, text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const databaseName = `taskelith_slot_delivery_${process.pid}`;
await sql(POSTGRES, `CREATE DATABASE ${databaseName}`);
const url = new URL(POSTGRES);
url.pathname = `/${databaseName}`;
value(await migrate(url));
const database = new PostgresDatabase(url);
after(async () => {
  await database.close();
  await sql(POSTGRES, `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
});

// A fixture value, never a real credential.
const SECRET = `fixture-slot-token-${randomUUID()}`;
const HARNESS = id('HarnessPluginId', 'harness-1') as HarnessPluginId;
const MECHANISM = id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId;
const SLOT = id('ProviderCredentialId', 'slot-1') as ProviderCredentialId;
const OTHER_SLOT = id('ProviderCredentialId', 'slot-2') as ProviderCredentialId;
const PAIR: AdmittedPair = { harnessId: HARNESS, mechanismId: MECHANISM, delivery: 'subscription-token' };
const WORKER = fleetWorker('worker-1', 'journal-1');
const OTHER_WORKER = fleetWorker('worker-2', 'journal-2');
const PRINCIPAL: WorkerPrincipal = { workerId: WORKER.workerId, generation: 1 };
const NEW_SESSION: SlotRequest = { projectId: 'project-1' as ProjectId, kind: 'new-session', harnessId: HARNESS, whenNoSlot: 'wait' };

const cipher = value(AesGcmSlotCredentialCipher.of(randomBytes(32)));
const stored = new PostgresSlotCredentials((work) => database.transaction(work), cipher);
const fleet = new LaunchRevokingFleetRegistry(database);
const authority = launchAuthority(database);
let reveals = 0;
const storedReveal: SlotCredentials['reveal'] = (slotId, version) => stored.reveal(slotId, version);
let revealing = storedReveal;
const counted: SlotCredentials = {
  store: (slotId, secret) => stored.store(slotId, secret),
  reveal: (slotId, version) => { reveals += 1; return revealing(slotId, version); },
  discard: (slotId, version) => stored.discard(slotId, version),
  discardOlderThan: (slotId, version) => stored.discardOlderThan(slotId, version),
  destroy: (slotId) => stored.destroy(slotId),
};

function service(store: ControlPlaneStore = database, pairs: readonly AdmittedPair[] = [PAIR]): SlotCredentialDeliveryService {
  return new SlotCredentialDeliveryService(store, { credentials: counted, admittedDeliveries: new StaticAdmittedDeliveries(pairs) });
}

beforeEach(async () => {
  await sql(url, `TRUNCATE workflow_runs, gates, admissions, tasks, assignments, outbox, inbox, task_lineage, capacity_charges,
    delegations, capacity_quotas, workers, installation, enrollment_tokens, broker_revocations, launch_authorizations,
    launch_rejections, current_revisions, producer_cursors, worker_self_check_results, account_slots, slot_credentials,
    slot_credential_counters, slot_credential_deliveries`);
  await sql(url, 'INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  for (const [index, worker] of [WORKER, OTHER_WORKER].entries()) {
    value(await fleet.addToken(fleetToken(`token-${index}`)));
    value(await fleet.enroll(fleetToken(`token-${index}`).hash, worker));
  }
  await sql(url, "UPDATE workers SET reachable = true, worker_admission = 'admitted'");
  await createLaunchRun(database);
  for (const slotId of [SLOT, OTHER_SLOT]) await addSlot(slotId);
  reveals = 0;
  revealing = storedReveal;
});

async function addSlot(slotId: ProviderCredentialId): Promise<void> {
  const credentialVersion = await stored.store(slotId, value(SlotSecret.of(`${SECRET}-${slotId}`)));
  const slot = value(parseAccountSlot({
    id: slotId, harnessId: HARNESS, mechanismId: MECHANISM, credentialVersion, allowedProjects: ['project-1' as ProjectId],
    concurrencyLimit: 4, state: 'active', health: 'healthy', revision: 1,
  }));
  value(await database.transaction((tx) => tx.accountSlots.add(slot)));
}

// A placed attempt of the slot that a new session selects, with its grant.
async function launched(task = 'task-1'): Promise<{ placed: Placed; grant: LaunchGrant; fetch: SlotCredentialFetchRequest }> {
  const placed = await placedTask(database, task, WORKER.workerId, NEW_SESSION);
  const outcome = value(await authority.authorize(PRINCIPAL, placed.request));
  assert.equal(outcome.kind, 'granted');
  const grant = (outcome as Extract<LaunchOutcome, { kind: 'granted' }>).grant;
  const { executionId, attemptId, ownershipGeneration } = placed.request;
  const slotId = value(await database.transaction((tx) => tx.assignments.get(placed.request.assignmentId))).reservation.providerCredentials[0]!;
  return { placed, grant, fetch: { executionId, slotId, attemptId, ownershipGeneration, recoveryEpoch: 1 as RecoveryEpoch } };
}

async function expire(grant: LaunchGrant): Promise<void> {
  await sql(url, 'UPDATE tasks SET record = replace(record, $1, $2)', [`"issuedAt":"${grant.issuedAt}"`, '"issuedAt":"2020-01-01T00:00:00.000Z"']);
}

function reasonOf(result: Result<RevealedSlotDelivery>): string {
  if (result.ok) return 'delivered';
  return result.error.details.reason ?? result.error.code;
}

async function deliveries(): Promise<Record<string, unknown>[]> {
  return sql(url, 'SELECT slot_id, credential_version, deliveries, worker_id FROM slot_credential_deliveries ORDER BY slot_id');
}

test('the first fetch after the launch authorization delivers the named version, and a later one re-delivers it after the grant expired', async () => {
  const { placed, grant, fetch } = await launched();
  const version = (await sql<{ credential_version: number }>(url, 'SELECT credential_version FROM account_slots WHERE slot_id = $1', [fetch.slotId]))[0]!;
  const first = value(await service().fetch(PRINCIPAL, fetch));
  assert.deepEqual([first.executionId, first.slotId, first.mechanismId, first.credentialVersion], [fetch.executionId, fetch.slotId, MECHANISM, version.credential_version]);
  assert.equal(first.credential.reveal(), `${SECRET}-${fetch.slotId}`);
  await expire(grant);
  const again = value(await service().fetch(PRINCIPAL, fetch));
  assert.equal(again.credentialVersion, first.credentialVersion, 'the same version');
  assert.equal(again.credential.reveal(), first.credential.reveal());
  assert.deepEqual(await deliveries(), [{ slot_id: fetch.slotId, credential_version: first.credentialVersion, deliveries: 2, worker_id: WORKER.workerId }]);
  assert.equal(reveals, 2);
  const listed = value(await database.transaction(async (tx) => ok(await tx.slotCredentialDeliveries.listByExecution(placed.taskId, fetch.executionId))));
  assert.deepEqual(listed.map((record) => [record.slotId, record.credentialVersion, record.deliveries, record.attemptId]),
    [[fetch.slotId, first.credentialVersion, 2, fetch.attemptId]], 'the record 13c redacts by');
});

test('a first fetch after the grant expired is execution-conflict, reveals nothing, and records nothing', async () => {
  const { grant, fetch } = await launched();
  await expire(grant);
  assert.equal(reasonOf(await service().fetch(PRINCIPAL, fetch)), 'execution-conflict');
  assert.deepEqual([reveals, await deliveries()], [0, []]);
});

test('each refusal of account pool section 7.3 reveals nothing and records nothing', async () => {
  const { fetch } = await launched();
  const other = fetch.slotId === SLOT ? OTHER_SLOT : SLOT;
  const cases: Array<[string, () => Promise<Result<RevealedSlotDelivery>>]> = [
    ['stale-recovery-epoch', () => service().fetch(PRINCIPAL, { ...fetch, recoveryEpoch: 2 as RecoveryEpoch })],
    ['worker-not-authorized', () => service().fetch({ ...PRINCIPAL, generation: 2 }, fetch)],
    ['assignment-not-active', () => service().fetch(PRINCIPAL, { ...fetch, executionId: id('ExecutionId', 'unknown') as never })],
    ['assignment-not-active', () => service().fetch(PRINCIPAL, { ...fetch, attemptId: id('AttemptId', 'unknown') as never })],
    ['assignment-not-active', () => service().fetch({ workerId: OTHER_WORKER.workerId, generation: 1 }, fetch)],
    ['stale-ownership-generation', () => service().fetch(PRINCIPAL, { ...fetch, ownershipGeneration: (fetch.ownershipGeneration + 1) as OwnershipGeneration })],
    ['capacity-not-reserved', () => service().fetch(PRINCIPAL, { ...fetch, slotId: other })],
    ['delivery-not-admitted', () => service(database, []).fetch(PRINCIPAL, fetch)],
  ];
  for (const [reason, fetched] of cases) assert.equal(reasonOf(await fetched()), reason, reason);
  for (const state of ['revoked', 'removed']) {
    await sql(url, 'UPDATE account_slots SET state = $1 WHERE slot_id = $2', [state, fetch.slotId]);
    assert.equal(reasonOf(await service().fetch(PRINCIPAL, fetch)), state);
  }
  await sql(url, 'UPDATE installation SET quarantined = true');
  assert.equal(reasonOf(await service().fetch(PRINCIPAL, fetch)), 'quarantined');
  assert.deepEqual([reveals, await deliveries()], [0, []]);
});

test('a released reservation cannot fetch, though the execution had a delivery', async () => {
  const { placed, fetch } = await launched();
  value(await service().fetch(PRINCIPAL, fetch));
  await sql(url, `UPDATE assignments SET reservation_state = 'released', record = replace(record, '"state":"held"', '"state":"released"')
    WHERE id = $1`, [placed.request.assignmentId]);
  assert.equal(reasonOf(await service().fetch(PRINCIPAL, fetch)), 'capacity-not-reserved');
  assert.equal(reveals, 1);
  assert.equal((await deliveries())[0]!.deliveries, 1, 'a refusal changes no record');
});

// Ends the attempt's assignment, releases its reservation, and places the
// attempt on the other worker at the next ownership generation.
async function reassign(placed: Placed): Promise<void> {
  const old = value(await database.transaction(async (tx) => {
    const assignment = value(await tx.assignments.get(placed.request.assignmentId));
    const task = value(await tx.tasks.get(placed.taskId));
    const executions = executionsUnderAssignment(task, assignment.id);
    const ended = value(endAssignment(assignment, assignment.generation, 'cancelled', executions, await tx.now()));
    const replaced = await tx.assignments.replace(ended, assignment.generation);
    return replaced.ok ? ok(ended) : replaced;
  }));
  await sql(url, `UPDATE assignments SET reservation_state = 'released', record = replace(record, '"state":"held"', '"state":"released"')
    WHERE id = $1`, [old.id]);
  value(await database.transaction(async (tx) => {
    const at = await tx.now();
    const task = value(await tx.tasks.get(placed.taskId));
    const ownershipGeneration = nextOwnershipGeneration(task.ownershipGeneration);
    const owned = Object.freeze({ ...task, ownershipGeneration, generation: nextGeneration(task.generation), changedAt: at });
    value(await tx.tasks.replace(owned, task.generation));
    const reservation = { ...old.reservation, id: id('ReservationId', 'task-1-reservation-2') as never };
    return tx.assignments.add(createAssignment({
      id: id('AssignmentId', 'task-1-assignment-2') as never, attemptId: old.attemptId, workerId: OTHER_WORKER.workerId,
      ownershipGeneration, reservation,
    }, at));
  }));
}

test('a reassigned attempt cannot fetch on its old worker, though the execution had a delivery', async () => {
  const { placed, fetch } = await launched();
  value(await service().fetch(PRINCIPAL, fetch));
  await reassign(placed);
  const assignments = await database.transaction(async (tx) => ok(await tx.assignments.listByAttempt(fetch.attemptId)));
  assert.deepEqual(value(assignments).map((assignment) => [assignment.workerId, assignment.state]).sort(),
    [[WORKER.workerId, 'ended'], [OTHER_WORKER.workerId, 'offered']], 'the attempt moved to the other worker');
  assert.equal(reasonOf(await service().fetch(PRINCIPAL, fetch)), 'assignment-not-active');
  const next = { ...fetch, ownershipGeneration: nextOwnershipGeneration(fetch.ownershipGeneration) };
  assert.equal(reasonOf(await service().fetch(PRINCIPAL, next)), 'assignment-not-active', 'the new generation does not help it');
  assert.equal(reveals, 1);
  assert.deepEqual((await deliveries()).map((record) => [record.deliveries, record.worker_id]), [[1, WORKER.workerId]], 'a refusal changes no record');
});

test('a slot that names another version than the earlier delivery reveals nothing', async () => {
  const { fetch } = await launched();
  value(await service().fetch(PRINCIPAL, fetch));
  await sql(url, 'UPDATE slot_credential_deliveries SET credential_version = credential_version + 1');
  const refused = failed(await service().fetch(PRINCIPAL, fetch));
  assert.equal(refused.code, 'internal');
  assert.equal(reveals, 1);
});

test('the delivery record is committed when the credential is revealed', async () => {
  const { fetch } = await launched();
  const seen: Array<Record<string, unknown>[]> = [];
  revealing = async (slotId, version) => {
    seen.push(await deliveries());
    return storedReveal(slotId, version);
  };
  value(await service().fetch(PRINCIPAL, fetch));
  assert.deepEqual(seen.map((rows) => rows.map((row) => row.deliveries)), [[1]], 'another connection saw the record at the reveal');
});

test('a delivery whose transaction does not commit reveals nothing and leaves no record', async () => {
  const { fetch } = await launched();
  const uncommitted: ControlPlaneStore = {
    transaction: (work) => database.transaction(async (tx) => {
      const done = await work(tx);
      return done.ok ? err(failure('unavailable', 'the commit failed')) : done;
    }),
    readCommitted: (work) => database.readCommitted(work),
  };
  assert.equal(failed(await service(uncommitted).fetch(PRINCIPAL, fetch)).code, 'unavailable');
  assert.deepEqual([reveals, await deliveries()], [0, []]);
});

test('a failed reveal leaves the committed record, and a retry delivers and counts again', async () => {
  const { grant, fetch } = await launched();
  revealing = async () => { throw new Error('the key store is down'); };
  assert.equal(failed(await service().fetch(PRINCIPAL, fetch)).code, 'unavailable');
  assert.deepEqual((await deliveries()).map((row) => row.deliveries), [1], 'the record stays, as if revealed (Q1)');
  revealing = storedReveal;
  await expire(grant);
  assert.equal(value(await service().fetch(PRINCIPAL, fetch)).credential.reveal(), `${SECRET}-${fetch.slotId}`);
  assert.deepEqual((await deliveries()).map((row) => row.deliveries), [2]);
});

test('no failure of the credential store reaches the answer with its diagnostic', async () => {
  const { fetch } = await launched();
  const leaked = `${SECRET}-diagnostic`;
  const failures: Array<[string, SlotCredentials['reveal'], string]> = [
    ['thrown', async () => { throw new Error(leaked); }, 'unavailable'],
    ...(['invalid', 'conflict', 'forbidden', 'precondition-failed', 'internal'] as const).map((code): [string, SlotCredentials['reveal'], string] =>
      [code, async () => err(failure(code, leaked, { reason: leaked, cause: leaked })), 'internal']),
    ['unavailable', async () => err(failure('unavailable', leaked, { cause: leaked })), 'unavailable'],
    ['not-found', async () => err(failure('not-found', leaked, { cause: leaked })), 'internal'],
  ];
  for (const [label, reveal, code] of failures) {
    revealing = reveal;
    const refused = failed(await service().fetch(PRINCIPAL, fetch));
    assert.doesNotMatch(JSON.stringify(refused), new RegExp(SECRET), label);
    assert.equal(refused.code, code, label);
    assert.deepEqual(refused.details, { slot: fetch.slotId }, label);
  }
});

// Each racer's first attempt waits after reading the delivery record until
// both have read it; a retry passes the gate.
function gatedStore(arrive: () => Promise<void>): { store: ControlPlaneStore; attempts: () => number } {
  let attempts = 0;
  const store: ControlPlaneStore = {
    transaction: (work) => database.transaction((tx) => {
      attempts += 1;
      return work(attempts === 1 ? gatedFind(tx, arrive) : tx);
    }),
    readCommitted: (work) => database.readCommitted(work),
  };
  return { store, attempts: () => attempts };
}

function gatedFind(tx: ControlPlaneTransaction, arrive: () => Promise<void>): ControlPlaneTransaction {
  const records = tx.slotCredentialDeliveries;
  const gated = {
    find: async (...args: Parameters<typeof records.find>) => {
      const found = await records.find(...args);
      await arrive();
      return found;
    },
    listByExecution: (...args: Parameters<typeof records.listByExecution>) => records.listByExecution(...args),
    record: (delivery: Parameters<typeof records.record>[0]) => records.record(delivery),
  };
  return new Proxy(tx, {
    get: (target, property) => {
      if (property === 'slotCredentialDeliveries') return gated;
      const member: unknown = Reflect.get(target, property);
      return typeof member === 'function' ? (member as (...args: unknown[]) => unknown).bind(target) : member;
    },
  });
}

function rendezvous(parties: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const everyone = new Promise<void>((resolve) => { release = resolve; });
  return () => {
    arrived += 1;
    if (arrived === parties) release();
    return everyone;
  };
}

test('two first fetches racing for one execution both deliver one version, and the second to commit retried', async () => {
  const { fetch } = await launched();
  const arrive = rendezvous(2);
  const racers = [gatedStore(arrive), gatedStore(arrive)];
  const answers = await Promise.all(racers.map((racer) => service(racer.store).fetch(PRINCIPAL, fetch)));
  const versions = answers.map((answer) => value(answer).credentialVersion);
  assert.equal(versions[0], versions[1]);
  assert.deepEqual(racers.map((racer) => racer.attempts()).sort(), [1, 2], 'the loser read the record again and re-delivered');
  assert.equal((await deliveries())[0]!.deliveries, 2);
});

test('no table of the database holds a delivered credential, only its ciphertext', async () => {
  const { grant, fetch } = await launched();
  value(await service().fetch(PRINCIPAL, fetch));
  await expire(grant);
  value(await service().fetch(PRINCIPAL, fetch));
  const tables = await sql<{ table_name: string }>(url, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  for (const { table_name: table } of tables) {
    const rows = await sql<{ text: string }>(url, `SELECT row_to_json(t)::text AS text FROM "${table}" t`);
    assert.ok(rows.every((row) => !row.text.includes(SECRET)), table);
  }
  assert.ok((await sql(url, 'SELECT 1 FROM slot_credentials')).length > 0, 'the ciphertext is stored');
});

test('no credential byte reaches NATS: the outbox after a delivery is published, and no stream message holds it', async () => {
  const { grant, fetch } = await launched();
  value(await service().fetch(PRINCIPAL, fetch));
  await expire(grant);
  value(await service().fetch(PRINCIPAL, fetch));
  const address = value(TransportAddress.of(`it${randomUUID().replaceAll('-', '').slice(0, 12)}`));
  const transport = value(await connectTransport({ server: NATS, address, creds: integrationSecret('integration.creds') }));
  const kinds = ['commands', 'observations', 'sdlc', 'quarantine', 'advisories'] as const;
  try {
    value(await ensureStreams(transport.jsm, address, { ...TRANSPORT_LIMITS, streamMaxBytes: 64 * 1024 ** 2 }));
    const round = value(await new OutboxPublisher(new PostgresOutboxRelay(database), new JetStreamPublisher(transport.js), address).publishPending());
    assert.ok(round.published > 0, 'the placement wrote an outbox message');
    const bodies: Buffer[] = [];
    for (const kind of kinds) {
      const { state } = await transport.jsm.streams.info(address.streamName(kind));
      for (let seq = state.first_seq; state.messages > 0 && seq <= state.last_seq; seq += 1) {
        const message = await transport.jsm.streams.getMessage(address.streamName(kind), { seq });
        assert.ok(message !== null, `${kind} ${seq}`);
        bodies.push(Buffer.from(message.data));
      }
    }
    assert.equal(bodies.length, round.published);
    const all = Buffer.concat(bodies);
    for (const form of [SECRET, Buffer.from(SECRET).toString('base64')]) assert.equal(all.indexOf(form), -1, form);
  } finally {
    for (const kind of kinds) await transport.jsm.streams.delete(address.streamName(kind)).catch(() => false);
    await transport.close();
  }
});
