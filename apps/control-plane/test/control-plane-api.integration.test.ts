import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { createAccount } from '@nats-io/nkeys';
import { checkHttpSchema, checkMessageSchema } from '@taskelith/contracts';
import {
  adminMain,
  InstallationPublicationFence,
  serveUntilStopped,
  startControlPlane,
  type AdminIo,
  type ControlPlaneSettings,
  type RunningControlPlane,
} from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import {
  BrokerAuthority,
  connectSystemAccount,
  connectTransport,
  encodeJson,
  INVENTORY_REPORTED,
  JetStreamPublisher,
  NatsBrokerCredentials,
  readObservationSubjectMessage,
  TRANSPORT_LIMITS,
  TransportAddress,
  type ControlPlaneConnection,
} from '@taskelith/nats';
import { openAttempt, type AttemptId, type WorkerId } from '@taskelith/execution';
import { PostgresDatabase } from '@taskelith/postgres';
import { createAssignment, parseResourceRequest } from '@taskelith/scheduling';
import { ok } from '@taskelith/kernel';
import { InMemoryLogSink } from '@taskelith/observability';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { integrationEndpoint, integrationSecret, value } from '@taskelith/testing';
import { productionDependencies, workerMain } from '@taskelith/worker';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const NATS = integrationEndpoint('TASKELITH_NATS_URL');
const ownerUid = process.getuid!();
const DIGEST = `sha256:${'ab'.repeat(32)}`;

async function sql<Row extends pg.QueryResultRow>(url: URL, text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (!(await condition())) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('condition not met');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// A database, data root, and broker account of this file's own; the account
// is registered on the test server, which trusts the test operator.
const databaseName = `taskelith_api_${process.pid}`;
await sql(POSTGRES, `CREATE DATABASE ${databaseName}`);
const database = new URL(POSTGRES);
database.pathname = `/${databaseName}`;
const base = mkdtempSync(join(tmpdir(), 'taskelith-api-'));
const dataRoot = join(base, 'root');
const authorityKeys = { ...JSON.parse(integrationSecret('authority.json')), accountSeed: new TextDecoder().decode(createAccount().getSeed()) };
value(value(ControlPlaneNamespace.open({ dataRoot, ownerUid })).create('broker-authority', authorityKeys));
const authority = value(BrokerAuthority.fromKeys(authorityKeys));
const system = value(await connectSystemAccount({ server: NATS, creds: integrationSecret('system.creds') }));
value(await new NatsBrokerCredentials(authority, system.connection).publishRevocations([]));
await system.close();

const ENVIRONMENT = { TASKELITH_DATA_DIR: dataRoot, TASKELITH_POSTGRES_URL: database.href, TASKELITH_NATS_URL: NATS.href };

async function admin(argv: string[], extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const io: AdminIo = { environment: { ...ENVIRONMENT, ...extra }, platform: process.platform, ownerUid, write: (line) => lines.push(line) };
  assert.equal(await adminMain(argv, io), 0, lines.join('\n'));
  return JSON.parse(lines.join('\n'));
}

const initialized = await admin(['init', '--actor', 'root@test', '--reason', 'api test']) as { identity: { installationId: string }; operatorSecret: string };
const operator = initialized.operatorSecret;
const address = value(TransportAddress.of(initialized.identity.installationId));
const definition = value(parseWorkflowDefinition({
  id: 'api-workflow', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));
const logs = new InMemoryLogSink();
let running: RunningControlPlane;

const SETTINGS: ControlPlaneSettings = {
  dataRoot, ownerUid, postgres: database, nats: NATS, api: { host: '127.0.0.1', port: 0 },
  workflows: [{ definition, digest: DIGEST }], logSink: logs, sweepMilliseconds: 200, shutdownMilliseconds: 1000,
  // The test server keeps JetStream in a small tmpfs.
  transportLimits: { ...TRANSPORT_LIMITS, streamMaxBytes: 64 * 1024 ** 2, retryInitialMilliseconds: 100, retryMaxMilliseconds: 200, idlePollMilliseconds: 50 },
};

before(async () => {
  running = value(await startControlPlane(SETTINGS));
});

after(async () => {
  await running?.stop();
  const broker = value(await connectTransport({ server: NATS, address, creds: authority.user('cleanup', Math.floor(Date.now() / 1000)).creds }));
  for (const kind of ['commands', 'observations', 'sdlc', 'quarantine', 'advisories'] as const) {
    await broker.jsm.streams.delete(address.streamName(kind)).catch(() => false);
  }
  await broker.close();
  rmSync(base, { recursive: true, force: true });
  await sql(POSTGRES, `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
});

function intakeOffer(commandId: string, workerId: string, protocolVersion: number): Record<string, unknown> {
  const metadata = {
    commandId, commandType: 'execution.assignment.offer', schemaVersion: 1, issuedAt: new Date().toISOString(), correlationId: `correlation-${commandId}`,
    projectId: 'project-1', taskId: `task-${commandId}`, sdlc: { runId: 'run-1', stageId: 'apply', admissionId: `admission-${commandId}`, admissionGeneration: 1 },
    attemptId: `attempt-${commandId}`, workerId, ownershipGeneration: 1,
  };
  const requested = { cpuMillicores: 500, memoryMebibytes: 256, hardControls: [] };
  const payload = { protocolVersion, assignmentId: `assignment-${commandId}`, recoveryEpoch: 1, reservation: { reservationId: `reservation-${commandId}`, requested } };
  return { metadata, payload };
}

// Reads the worker's subject until `count` journaled observations passed
// their schema; the connections' inventory reports are skipped.
async function observationTypes(broker: ControlPlaneConnection, subject: string, count: number): Promise<string[]> {
  const consumer = await broker.js.consumers.get(address.streamName('observations'), { filter_subjects: [subject] });
  const types: string[] = [];
  const deadline = Date.now() + 15_000;
  while (types.length < count && Date.now() < deadline) {
    const message = await consumer.next({ expires: 1000 });
    if (message === null) continue;
    const { type } = value(readObservationSubjectMessage(message.data));
    if (type !== INVENTORY_REPORTED) types.push(type);
  }
  return types;
}

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly correlationId: string | null;
}

async function call(method: string, path: string, options: { bearer?: string; body?: unknown; correlationId?: string } = {}): Promise<Answer> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.bearer !== undefined) headers.authorization = `Bearer ${options.bearer}`;
  if (options.correlationId !== undefined) headers['x-correlation-id'] = options.correlationId;
  const response = await fetch(`http://127.0.0.1:${running.api.port}${path}`, {
    method, headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown>, correlationId: response.headers.get('x-correlation-id') };
}

const BINDING = {
  pluginId: 'openspec', pluginVersion: '0.1.0', upstreamToolVersion: '1.6.0', workflowId: 'api-workflow', workflowVersion: '1',
  workflowDigest: DIGEST, configurationRevision: 'config-1', policyRevision: 'policy-1',
};

describe('operator credential', () => {
  test('a request without or with a wrong bearer is refused with 401', async () => {
    assert.equal((await call('POST', '/runs', { body: {} })).status, 401);
    const wrong = await call('POST', '/runs', { bearer: 'tkop_wrong', body: {} });
    assert.deepEqual([wrong.status, wrong.body.code], [401, 'forbidden']);
    assert.ok(checkHttpSchema('Failure', wrong.body).ok);
  });

  test('an unknown operation is 404 and an invalid body 400', async () => {
    assert.equal((await call('GET', '/nowhere', { bearer: operator })).status, 404);
    const invalid = await call('POST', '/runs', { bearer: operator, body: { runId: 'run-x' } });
    assert.deepEqual([invalid.status, invalid.body.code], [400, 'invalid']);
  });
});

describe('runs and tasks', () => {
  test('a run is created once; a retry returns it, and another binding is 409', async () => {
    const unknown = await call('POST', '/runs', { bearer: operator, body: { runId: 'run-0', projectId: 'project-1', binding: { ...BINDING, workflowDigest: `sha256:${'cd'.repeat(32)}` } } });
    assert.equal(unknown.status, 422);
    const created = await call('POST', '/runs', { bearer: operator, body: { runId: 'run-1', projectId: 'project-1', binding: BINDING } });
    assert.equal(created.status, 201);
    assert.ok(checkHttpSchema('Run', created.body).ok);
    const again = await call('POST', '/runs', { bearer: operator, body: { runId: 'run-1', projectId: 'project-1', binding: BINDING } });
    assert.deepEqual([again.status, again.body.createdAt], [201, created.body.createdAt]);
    const other = await call('POST', '/runs', { bearer: operator, body: { runId: 'run-1', projectId: 'project-2', binding: BINDING } });
    assert.equal(other.status, 409);
  });

  test('a submitted task is admitted, used, stored with its event, and readable', async () => {
    const submitted = await call('POST', '/runs/run-1/tasks', {
      bearer: operator, correlationId: 'corr-submit-1', body: { taskId: 'task-1', kind: 'planning', stageId: 'specs' },
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.correlationId, 'corr-submit-1');
    assert.ok(checkHttpSchema('TaskSubmission', submitted.body).ok);
    const admission = submitted.body.admission as { id: string; state: string; ownershipGeneration: number };
    assert.deepEqual([admission.state, admission.ownershipGeneration], ['used', 1]);

    const again = await call('POST', '/runs/run-1/tasks', { bearer: operator, body: { taskId: 'task-1', kind: 'planning', stageId: 'specs' } });
    assert.deepEqual([again.status, (again.body.admission as { id: string }).id], [201, admission.id]);
    const conflicting = await call('POST', '/runs/run-1/tasks', { bearer: operator, body: { taskId: 'task-1', kind: 'implementation', stageId: 'apply' } });
    assert.equal(conflicting.status, 409);
    const otherArtifacts = await call('POST', '/runs/run-1/tasks', {
      bearer: operator, body: { taskId: 'task-1', kind: 'planning', stageId: 'specs', artifacts: [{ artifactId: 'spec', digest: DIGEST, nativeReference: 'spec.md' }] },
    });
    assert.equal(otherArtifacts.status, 409, 'a repeat with other planning artifacts conflicts');
    assert.equal((await call('POST', '/runs/run-9/tasks', { bearer: operator, body: { taskId: 'task-1', kind: 'planning', stageId: 'specs' } })).status, 404);

    const read = await call('GET', `/runs/run-1/admissions/${admission.id}`, { bearer: operator });
    assert.deepEqual([read.status, read.body.id], [200, admission.id]);
    assert.ok(checkHttpSchema('Admission', read.body).ok);
    assert.equal((await call('GET', `/runs/run-9/admissions/${admission.id}`, { bearer: operator })).status, 404);

    const gated = await call('POST', '/runs/run-1/tasks', {
      bearer: operator, body: { taskId: 'task-impl', kind: 'implementation', stageId: 'apply', workItem: { id: 'change-1', nativeReference: 'changes/one' } },
    });
    assert.equal(gated.status, 422, 'an implementation task needs its prerequisite gates passed');
    // A body just under 1 MiB whose event, with metadata, is over the limit.
    const artifacts = Array.from({ length: 3140 }, (_, index) => ({ artifactId: `a${index}`, digest: DIGEST, nativeReference: `${'r'.repeat(200)}${index}.md` }));
    const oversized = await call('POST', '/runs/run-1/tasks', { bearer: operator, body: { taskId: 'task-big', kind: 'planning', stageId: 'specs', artifacts } });
    assert.equal(oversized.status, 400, 'an event the broker would refuse fails the submission');
    assert.match(String(oversized.body.message), /admission event would exceed/);
    assert.equal((await call('GET', '/runs/run-1/tasks/task-big/result', { bearer: operator })).status, 404);

    const result = await call('GET', '/runs/run-1/tasks/task-1/result', { bearer: operator });
    assert.deepEqual([result.status, result.body], [200, { state: 'pending', runId: 'run-1', taskId: 'task-1' }]);
    assert.ok(checkHttpSchema('TaskResult', result.body).ok);
    assert.equal((await call('GET', '/runs/run-1/tasks/task-9/result', { bearer: operator })).status, 404);

    const [lineage] = await sql<{ root_task_id: string; run_id: string; depth: number }>(database, "SELECT root_task_id, run_id, depth FROM task_lineage WHERE task_id = 'task-1'");
    assert.deepEqual(lineage, { root_task_id: 'task-1', run_id: 'run-1', depth: 0 });
    await waitFor(async () => (await sql(database, 'SELECT 1 FROM outbox WHERE published_at IS NULL')).length === 0);
    const [row] = await sql<{ message: string }>(database, "SELECT message FROM outbox WHERE event_type = 'sdlc.admission.used'");
    const event = JSON.parse(row!.message).payload;
    assert.deepEqual(checkMessageSchema('AdmissionUsedEvent', event), { ok: true, value: event });
    assert.equal(event.metadata.correlationId, 'corr-submit-1');
  });

  test('under restore quarantine the outbox publishes nothing until it is lifted', async () => {
    await sql(database, 'UPDATE installation SET quarantined = true');
    const submitted = await call('POST', '/runs/run-1/tasks', { bearer: operator, body: { taskId: 'task-2', kind: 'planning', stageId: 'specs' } });
    assert.equal(submitted.status, 201);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal((await sql(database, 'SELECT 1 FROM outbox WHERE published_at IS NULL')).length, 1);
    await sql(database, 'UPDATE installation SET quarantined = false');
    await waitFor(async () => (await sql(database, 'SELECT 1 FROM outbox WHERE published_at IS NULL')).length === 0);
  });
});

describe('publication fence', () => {
  test('entering quarantine waits for the round in flight, and the next round publishes nothing', async () => {
    const fenceDatabase = new PostgresDatabase(database);
    after(() => fenceDatabase.close());
    const fence = new InstallationPublicationFence(fenceDatabase);
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    let roundDone = false;
    const round = fence.hold(async () => {
      await released;
      roundDone = true;
      return ok('published');
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    let quarantinedAt = 0;
    const entering = sql(database, 'UPDATE installation SET quarantined = true').then(() => { quarantinedAt = Date.now(); });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(quarantinedAt, 0, 'quarantine waits for the round');
    release();
    assert.deepEqual(await round, ok('published'));
    await entering;
    assert.ok(roundDone && quarantinedAt > 0);
    const next = await fence.hold(async () => ok('published'));
    assert.equal(!next.ok && next.error.details.reason, 'restore-quarantine');
    const redrive = await call('POST', '/quarantine/1/redrive', { bearer: operator });
    assert.equal(redrive.status, 503, 'a redrive waits for the same fence');
    await sql(database, 'UPDATE installation SET quarantined = false');
  });
});

async function enrolledWorker(journalId: string): Promise<{ bearer: string; workerId: WorkerId }> {
  const issued = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: operator });
  const enrolled = await call('POST', '/workers/enrollments', { bearer: issued.enrollmentToken as string, body: {
    journalId, host: { platform: 'linux', architecture: 'x64', hostname: journalId },
    protocolVersions: { minimum: 1, maximum: 1 }, capacity: { slots: 1, cpuMillicores: 1000, memoryMebibytes: 1024, enforceableControls: [] },
  } });
  return { bearer: (enrolled.body.credentials as { controlPlane: string }).controlPlane, workerId: enrolled.body.workerId as WorkerId };
}

// Enrolled workers are unreachable until their first observation, so the
// placement loop places nothing and a test places the task itself.
async function placedWorker(journalId: string, taskId = 'task-1'): Promise<{ bearer: string; workerId: string; attemptId: string; generation: number }> {
  const { bearer, workerId } = await enrolledWorker(journalId);
  const attemptId = `attempt-${journalId}` as AttemptId;
  const store = new PostgresDatabase(database);
  try {
    const placed = await store.transaction(async (tx) => {
      const task = await tx.tasks.get(taskId as TaskId);
      if (!task.ok) return task;
      const at = await tx.now();
      const attempted = openAttempt(task.value, task.value.ownershipGeneration, { id: attemptId }, at);
      if (!attempted.ok) return attempted;
      const replaced = await tx.tasks.replace(attempted.value, task.value.generation);
      if (!replaced.ok) return replaced;
      const scope = { projectId: 'project-1', runId: 'run-1', taskId, rootTaskId: taskId } as never;
      const requested = value(parseResourceRequest({ cpuMillicores: 100, memoryMebibytes: 128, hardControls: [] }));
      const reservation = { id: `reservation-${journalId}` as never, scope, requested, providerCredentials: [] };
      const generation = attempted.value.ownershipGeneration;
      const added = await tx.assignments.add(createAssignment({ id: `assignment-${journalId}` as never, attemptId, workerId, ownershipGeneration: generation, reservation }, at));
      return added.ok ? ok(generation) : added;
    });
    return { bearer, workerId, attemptId, generation: value(placed) };
  } finally {
    await store.close();
  }
}

describe('evidence', () => {
  async function publish(bearer: string, record: Record<string, unknown>, content: Uint8Array<ArrayBuffer>): Promise<Answer> {
    const form = new FormData();
    form.append('record', new Blob([JSON.stringify(record)], { type: 'application/json' }));
    form.append('content', new Blob([content], { type: 'application/octet-stream' }));
    const response = await fetch(`http://127.0.0.1:${running.api.port}/evidence`, { method: 'POST', headers: { authorization: `Bearer ${bearer}` }, body: form });
    return { status: response.status, body: await response.json() as Record<string, unknown>, correlationId: response.headers.get('x-correlation-id') };
  }

  test('a worker that holds the attempt publishes evidence, and the operator reads and downloads it', async () => {
    const holder = await placedWorker('journal-evidence-1');
    const content = new Uint8Array([0, 1, 2, 255, 13, 10]);
    const hex = createHash('sha256').update(content).digest('hex');
    const record = {
      evidenceId: 'evidence-e2e-1', projectId: 'project-1', runId: 'run-1', taskId: 'task-1', attemptId: holder.attemptId,
      ownershipGeneration: holder.generation, kind: 'execution-log', inputArtifacts: [], codeRevision: 'c0ffee',
      validator: { name: 'runner', version: '1.0.0' }, outcome: 'exited-0', contentDigest: `sha256:${hex}`,
      contentType: 'application/octet-stream', sizeBytes: content.length, capturedAt: '2026-10-25T09:00:00.000Z',
    };
    const created = await publish(holder.bearer, record, content);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual([created.body.ownershipCurrent, created.body.producer], [true, { kind: 'worker', workerId: holder.workerId }]);
    assert.equal((await publish(holder.bearer, record, content)).status, 200, 'a retry returns the stored record');
    assert.equal((await publish(holder.bearer, { ...record, outcome: 'exited-1' }, content)).status, 409);
    assert.equal((await publish(operator, record, content)).status, 401);
    const stranger = await enrolledWorker('journal-evidence-2');
    assert.equal((await publish(stranger.bearer, { ...record, evidenceId: 'evidence-e2e-2' }, content)).status, 403);

    const read = await call('GET', '/evidence/evidence-e2e-1', { bearer: operator });
    assert.deepEqual([read.status, read.body.contentDigest], [200, `sha256:${hex}`]);
    const download = async () => fetch(`http://127.0.0.1:${running.api.port}/evidence/evidence-e2e-1/content`, { headers: { authorization: `Bearer ${operator}` } });
    const downloaded = await download();
    assert.deepEqual([downloaded.status, [...new Uint8Array(await downloaded.arrayBuffer())]], [200, [...content]]);
    writeFileSync(join(dataRoot, 'control-plane', 'evidence', 'sha256', hex.slice(0, 2), hex), 'tampered');
    assert.equal((await download()).status, 500, 'corrupt content is not served');
    assert.equal((await call('GET', '/evidence/evidence-e2e-9', { bearer: operator })).status, 404);
  });
});

describe('delegation', () => {
  test('a worker requests a delegation of the attempt it holds, and failures map to their statuses', async () => {
    const submitted = await call('POST', '/runs/run-1/tasks', { bearer: operator, body: { taskId: 'task-parent', kind: 'planning', stageId: 'specs' } });
    assert.equal(submitted.status, 201);
    const holder = await placedWorker('journal-delegation-1', 'task-parent');
    const body = {
      delegationId: 'delegation-http-1', attemptId: holder.attemptId, ownershipGeneration: holder.generation, runId: 'run-1',
      child: { taskId: 'task-delegated', kind: 'planning', stageId: 'specs' },
    };
    // No reachable worker yet, so the fleet has no free slot for the child.
    const waiting = await call('POST', '/delegations', { bearer: holder.bearer, body });
    assert.deepEqual([waiting.status, waiting.body], [200, { state: 'awaiting-capacity', delegationId: 'delegation-http-1' }]);
    assert.equal((await call('POST', '/delegations', { bearer: holder.bearer, body })).status, 200, 'a repeat answers the stored state');
    const other = { ...body, child: { ...body.child, taskId: 'task-other' } };
    assert.equal((await call('POST', '/delegations', { bearer: holder.bearer, body: other })).status, 409);
    const unknownRun = { ...body, delegationId: 'delegation-http-2', runId: 'run-9' };
    assert.equal((await call('POST', '/delegations', { bearer: holder.bearer, body: unknownRun })).status, 422);
    const stranger = await enrolledWorker('journal-delegation-2');
    assert.equal((await call('POST', '/delegations', { bearer: stranger.bearer, body: { ...body, delegationId: 'delegation-http-3' } })).status, 403);
    assert.equal((await call('POST', '/delegations', { bearer: operator, body })).status, 401);
    assert.equal((await call('POST', '/delegations', { bearer: holder.bearer, body: { ...body, child: {} } })).status, 400);
  });
});

describe('enrollment and quarantine', () => {
  test('a worker enrolls on its first start, then connects with its stored broker credential', async () => {
    const issued = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: operator });
    const environment = {
      TASKELITH_DATA_DIR: join(base, 'worker-root'), TASKELITH_CONTROL_PLANE_URL: `http://127.0.0.1:${running.api.port}/`, TASKELITH_NATS_URL: NATS.href,
    };
    // The test volume may be tmpfs, which the real probe refuses.
    const dependencies = (settings: Parameters<typeof productionDependencies>[0]) => ({
      ...productionDependencies(settings), probe: () => ok({ platform: 'darwin' as const, filesystem: 'apfs', local: true }),
    });
    const lines: string[] = [];
    // Contact proves that the worker connected with its broker credential.
    const lastContact = async (workerId: string) => (await sql<{ last_contact_at: Date | null }>(database,
      'SELECT last_contact_at FROM workers WHERE worker_id = $1', [workerId]))[0]?.last_contact_at?.getTime() ?? 0;
    const first = await workerMain({ ...environment, TASKELITH_ENROLLMENT_TOKEN: issued.enrollmentToken as string }, (line) => lines.push(line), dependencies);
    assert.ok(first, lines.join('\n'));
    await waitFor(async () => (await lastContact(first.identity.workerId)) > 0);
    const [row] = await sql<{ journal_id: string }>(database, 'SELECT journal_id FROM workers WHERE worker_id = $1', [first.identity.workerId]);
    assert.equal(row?.journal_id, first.identity.journalId);
    await first.stop();
    const contactBefore = await lastContact(first.identity.workerId);
    const again = await workerMain(environment, (line) => lines.push(line), dependencies);
    assert.ok(again, lines.join('\n'));
    await waitFor(async () => (await lastContact(again.identity.workerId)) > contactBefore);
    assert.equal(again.identity.workerId, first.identity.workerId);
    await again.stop();
  });

  test('a worker journals its commands before it acknowledges them and publishes its observations', async () => {
    const issued = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: operator });
    const environment = {
      TASKELITH_DATA_DIR: join(base, 'intake-root'), TASKELITH_CONTROL_PLANE_URL: `http://127.0.0.1:${running.api.port}/`, TASKELITH_NATS_URL: NATS.href,
      TASKELITH_ENROLLMENT_TOKEN: issued.enrollmentToken as string,
    };
    const limits = { ...TRANSPORT_LIMITS, retryInitialMilliseconds: 100, retryMaxMilliseconds: 200, idlePollMilliseconds: 50 };
    const dependencies = (settings: Parameters<typeof productionDependencies>[0]) => ({
      ...productionDependencies(settings), probe: () => ok({ platform: 'darwin' as const, filesystem: 'apfs', local: true }), limits,
      // A host disk below the floor, or a busy test process, would refuse
      // the offers.
      space: () => ok({ availableBytes: 2 ** 40, totalBytes: 2 ** 41 }),
      daemon: { residentBytes: () => ok(0), eventLoopLagMilliseconds: () => ok(0), watch: async () => undefined },
    });
    const lines: string[] = [];
    const worker = await workerMain(environment, (line) => lines.push(line), dependencies);
    assert.ok(worker, lines.join('\n'));
    const { workerId } = worker.identity;
    const broker = value(await connectTransport({ server: NATS, address, creds: authority.user('intake-test', Math.floor(Date.now() / 1000)).creds }));
    try {
      // Enrollment created the worker's consumer; nothing here creates it.
      const publisher = new JetStreamPublisher(broker.js);
      for (const [commandId, protocolVersion] of [['offer-1', 1], ['offer-2', 2]] as const) {
        const offer = intakeOffer(commandId, workerId, protocolVersion);
        value(await publisher.publish({ subject: value(address.commandSubject(workerId)), body: encodeJson(offer), messageId: commandId }));
      }
      // The observations follow W1 of both offers; confirmations of them share
      // the command subject, so only an empty consumer proves every ack.
      const types = await observationTypes(broker, value(address.observationSubject(workerId)), 5);
      assert.deepEqual(types, [
        'worker.capacity.declared', 'worker.admission-pressure.changed', 'worker.self-check.reported',
        'execution.assignment.accepted', 'execution.command.rejected',
      ]);
      assert.deepEqual(value(worker.root.journal.snapshot()).intents.map((intent) => intent.assignmentId), ['assignment-offer-1']);
      await waitFor(async () => {
        const consumer = await broker.jsm.consumers.info(address.streamName('commands'), workerId);
        return consumer.num_pending === 0 && consumer.num_ack_pending === 0;
      });
    } finally {
      await worker.stop();
      await broker.close();
    }
  });

  test('a restart ensures the consumer and requests the inventory of every active worker', async () => {
    const { workerId } = await enrolledWorker('journal-consumer-repair');
    const broker = value(await connectTransport({ server: NATS, address, creds: authority.user('repair-test', Math.floor(Date.now() / 1000)).creds }));
    const stream = address.streamName('commands');
    try {
      assert.equal((await broker.jsm.consumers.info(stream, workerId)).name, workerId);
      await broker.jsm.consumers.delete(stream, workerId);
      await running.stop();
      running = value(await startControlPlane(SETTINGS));
      assert.equal((await broker.jsm.consumers.info(stream, workerId)).name, workerId);
      assert.ok(logs.records.some((record) => record.event === 'fleet.command-consumers.repaired'));
      assert.ok(logs.records.some((record) => record.event === 'execution.inventory-requests.sent'));
    } finally {
      await broker.close();
    }
  });

  test('a worker enrolls over the API with its token once', async () => {
    const issued = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: operator });
    const body = {
      journalId: 'journal-1', host: { platform: 'linux', architecture: 'x64', hostname: 'build-1' },
      protocolVersions: { minimum: 1, maximum: 1 }, capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, enforceableControls: ['cpu-limit'] },
    };
    const enrolled = await call('POST', '/workers/enrollments', { bearer: issued.enrollmentToken as string, body });
    assert.equal(enrolled.status, 201, JSON.stringify(enrolled.body));
    assert.ok(checkHttpSchema('Enrollment', enrolled.body).ok);
    const [worker] = await sql<{ protocol_version: number }>(database, 'SELECT protocol_version FROM workers WHERE worker_id = $1', [enrolled.body.workerId]);
    assert.equal(worker?.protocol_version, 1);
    const reused = await call('POST', '/workers/enrollments', { bearer: issued.enrollmentToken as string, body: { ...body, journalId: 'journal-2' } });
    assert.equal(reused.status, 401);

    const fresh = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: operator });
    const huge = { ...body, journalId: 'journal-3', capacity: { ...body.capacity, slots: 2_147_483_648 } };
    assert.equal((await call('POST', '/workers/enrollments', { bearer: fresh.enrollmentToken as string, body: huge })).status, 400);
    const kept = await call('POST', '/workers/enrollments', { bearer: fresh.enrollmentToken as string, body: { ...body, journalId: 'journal-3' } });
    assert.equal(kept.status, 201, 'a refused capacity does not consume the token');
  });

  test('a worker bearer reaches authorizeLaunch, whose decision is recorded and replayed', async () => {
    const issued = await admin(['issue-enrollment-token'], { TASKELITH_OPERATOR_TOKEN: operator });
    const enrolled = await call('POST', '/workers/enrollments', {
      bearer: issued.enrollmentToken as string,
      body: {
        journalId: 'journal-launch', host: { platform: 'linux', architecture: 'x64', hostname: 'build-2' },
        protocolVersions: { minimum: 1, maximum: 1 }, capacity: { slots: 1, cpuMillicores: 1000, memoryMebibytes: 1024, enforceableControls: [] },
      },
    });
    const workerBearer = (enrolled.body.credentials as { controlPlane: string }).controlPlane;
    const body = {
      operationId: 'operation-api-1', recoveryEpoch: 1, assignmentId: 'assignment-unknown', attemptId: 'attempt-1', ownershipGeneration: 1,
      executionId: 'execution-1', admissionId: 'admission-1', admissionGeneration: 1, reportsNotStarted: false,
    };
    const decided = await call('POST', '/launch-authorizations', { bearer: workerBearer, body });
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    assert.ok(checkHttpSchema('LaunchAuthorizationOutcome', decided.body).ok);
    assert.deepEqual(decided.body.outcome, 'rejected');
    assert.equal((decided.body.rejection as { reason: string }).reason, 'assignment-not-active');
    const replayed = await call('POST', '/launch-authorizations', { bearer: workerBearer, body: { ...body, executionId: 'execution-2' } });
    assert.equal((replayed.body.rejection as { reason: string }).reason, 'operation-mismatch');
    assert.equal((await call('POST', '/launch-authorizations', { bearer: operator, body })).status, 401, 'the operator is no worker');
    assert.equal((await call('POST', '/launch-authorizations', { bearer: workerBearer, body: { ...body, recoveryEpoch: 0 } })).status, 400);
  });

  test('an observation on the stream is applied, and its confirmation reaches the worker without a message ID', async () => {
    const { workerId } = await enrolledWorker('journal-observed');
    const broker = value(await connectTransport({ server: NATS, address, creds: authority.user('observer', Math.floor(Date.now() / 1000)).creds }));
    try {
      const declared = {
        metadata: {
          observationId: 'declared-observed-1', observationType: 'worker.capacity.declared', schemaVersion: 1, protocolVersion: 1,
          occurredAt: '2026-10-25T09:00:00.000Z', correlationId: 'corr-observed', workerId, journalId: 'journal-observed', sequence: 1,
        },
        payload: { capacity: { slots: 1, cpuMillicores: 1000, memoryMebibytes: 1024, enforceableControls: [] }, protocolVersions: { minimum: 1, maximum: 1 } },
      };
      assert.ok(checkMessageSchema('CapacityDeclaredObservation', declared).ok);
      await broker.js.publish(value(address.observationSubject(workerId)), encodeJson(declared), { msgID: 'declared-observed-1' });
      // Other tests' workers are confirmed too, so the row must be this one's.
      const published = async () => (await sql<{ published: boolean }>(database,
        `SELECT published_at IS NOT NULL AS published FROM outbox
         WHERE event_type = 'execution.observations.confirmed' AND (message::jsonb)->>'subject' = $1`,
        [`workers.${workerId}.commands`]))[0]?.published === true;
      await waitFor(published);
      const [worker] = await sql<{ reachable: boolean }>(database, 'SELECT reachable FROM workers WHERE worker_id = $1', [workerId]);
      assert.equal(worker?.reachable, true);
      const stored = await broker.jsm.streams.getMessage(address.streamName('commands'), { last_by_subj: value(address.commandSubject(workerId)) });
      assert.ok(stored);
      assert.deepEqual([stored.json<{ confirmedThrough: number }>().confirmedThrough, stored.header?.get('Nats-Msg-Id') ?? ''], [1, '']);
    } finally {
      await broker.close();
    }
  });

  test('the quarantine is listed, and redriving an unknown record is 404', async () => {
    const listed = await call('GET', '/quarantine', { bearer: operator });
    assert.deepEqual([listed.status, listed.body], [200, { records: [] }]);
    assert.ok(checkHttpSchema('QuarantinePage', listed.body).ok);
    assert.equal((await call('GET', '/quarantine?from=0', { bearer: operator })).status, 400);
    assert.equal((await call('POST', '/quarantine/999/redrive', { bearer: operator })).status, 404);
  });

  test('SIGTERM stops the service within its deadline although a round waits for a lock', { timeout: 30_000 }, async () => {
    const holder = new pg.Client({ connectionString: database.href });
    await holder.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT 1 FROM installation FOR UPDATE');
    try {
      const waiting = async () => (await sql<{ waiting: number }>(database,
        "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()"))[0]!.waiting > 0;
      await waitFor(waiting);
      const listeners = new Set<() => void>();
      const host = { on: (_: string, listener: () => void) => listeners.add(listener), off: (_: string, listener: () => void) => listeners.delete(listener) };
      const startedAt = Date.now();
      const served = serveUntilStopped(running, host);
      for (const listener of listeners) listener();
      await served;
      assert.ok(Date.now() - startedAt < 10_000, `the stop took ${Date.now() - startedAt} ms`);
      assert.equal(await running.stopped, 'stopped', 'a cancelled round is not a loop defect');
      assert.ok(logs.records.some((record) => record.event === 'control-plane.stop.forced'));
    } finally {
      await holder.query('ROLLBACK');
      await holder.end();
    }
  });

  test('every request is logged with its correlation and no secret', async () => {
    const records = logs.records.filter((record) => record.event === 'api.request');
    assert.ok(records.some((record) => record.correlation.correlationId === 'corr-submit-1' && record.fields.operationId === 'submitTask'));
    assert.doesNotMatch(JSON.stringify(logs.records), new RegExp(operator));
    assert.doesNotMatch(JSON.stringify(logs.records), /tken_/);
  });
});
