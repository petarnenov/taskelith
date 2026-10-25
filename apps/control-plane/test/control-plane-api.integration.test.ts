import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { createAccount } from '@nats-io/nkeys';
import { checkHttpSchema, checkMessageSchema } from '@taskelith/contracts';
import { adminMain, startControlPlane, type AdminIo, type RunningControlPlane } from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import { BrokerAuthority, connectSystemAccount, connectTransport, NatsBrokerCredentials, TRANSPORT_LIMITS, TransportAddress } from '@taskelith/nats';
import { InMemoryLogSink } from '@taskelith/observability';
import { parseWorkflowDefinition } from '@taskelith/sdlc';
import { integrationEndpoint, integrationSecret, value } from '@taskelith/testing';

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

before(async () => {
  running = value(await startControlPlane({
    dataRoot, ownerUid, postgres: database, nats: NATS, api: { host: '127.0.0.1', port: 0 },
    workflows: [{ definition, digest: DIGEST }], logSink: logs, sweepMilliseconds: 200,
    // The test server keeps JetStream in a small tmpfs.
    transportLimits: { ...TRANSPORT_LIMITS, streamMaxBytes: 64 * 1024 ** 2 },
  }));
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

describe('enrollment and quarantine', () => {
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
  });

  test('the quarantine is listed, and redriving an unknown record is 404', async () => {
    const listed = await call('GET', '/quarantine', { bearer: operator });
    assert.deepEqual([listed.status, listed.body], [200, { records: [] }]);
    assert.ok(checkHttpSchema('QuarantinePage', listed.body).ok);
    assert.equal((await call('GET', '/quarantine?from=0', { bearer: operator })).status, 400);
    assert.equal((await call('POST', '/quarantine/999/redrive', { bearer: operator })).status, 404);
  });

  test('every request is logged with its correlation and no secret', async () => {
    const records = logs.records.filter((record) => record.event === 'api.request');
    assert.ok(records.some((record) => record.correlation.correlationId === 'corr-submit-1' && record.fields.operationId === 'submitTask'));
    assert.doesNotMatch(JSON.stringify(logs.records), new RegExp(operator));
    assert.doesNotMatch(JSON.stringify(logs.records), /tken_/);
  });
});
