import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createAccount } from '@nats-io/nkeys';
import { adminMain, startControlPlane, type AdminIo, type ControlPlaneSettings, type RunningControlPlane } from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import type { Task } from '@taskelith/execution';
import { InMemoryLogSink } from '@taskelith/observability';
import { BrokerAuthority, connectSystemAccount, connectTransport, NatsBrokerCredentials, TRANSPORT_LIMITS, TransportAddress } from '@taskelith/nats';
import { PostgresDatabase } from '@taskelith/postgres';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { integrationEndpoint, integrationSecret, value } from '@taskelith/testing';
import { waitFor } from './waiting.ts';

const DIGEST = `sha256:${'ab'.repeat(32)}`;
const WORKFLOW = value(parseWorkflowDefinition({
  id: 'scenario-workflow', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));
const BINDING = {
  pluginId: 'openspec', pluginVersion: '0.1.0', upstreamToolVersion: '1.6.0', workflowId: 'scenario-workflow', workflowVersion: '1',
  workflowDigest: DIGEST, configurationRevision: 'config-1', policyRevision: 'policy-1',
};
export const RUN_ID = 'run-1';
let installations = 0;

// Shorter timers than the operational targets, so a scenario takes seconds;
// the ack wait bounds how soon an unacknowledged command is redelivered.
export const SCENARIO_LIMITS = {
  ...TRANSPORT_LIMITS, streamMaxBytes: 64 * 1024 ** 2, ackWaitMilliseconds: 2_000,
  retryInitialMilliseconds: 1_000, retryMaxMilliseconds: 4_000, idlePollMilliseconds: 50,
};

// The longest a failing message is redelivered before `maxDeliver` ends
// it: the backoffs between its deliveries, without jitter.
export const REDELIVERY_BUDGET_MILLISECONDS = Array.from({ length: SCENARIO_LIMITS.maxDeliver - 1 }, (_, index) =>
  Math.min(SCENARIO_LIMITS.retryInitialMilliseconds * 2 ** index, SCENARIO_LIMITS.retryMaxMilliseconds)).reduce((sum, delay) => sum + delay, 0);
export const LOST_CONTACT_TIMEOUT_MILLISECONDS = 3_000;

export interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

// `proxied` routes the control plane's PostgreSQL through Toxiproxy.
export type PostgresRoute = 'direct' | 'proxied';

// One installation of the scenarios' own: database, data root, broker
// account, and a control plane composed by startControlPlane.
export class ScenarioInstallation {
  readonly logs: InMemoryLogSink;
  readonly base: string;
  readonly address: TransportAddress;
  readonly nats = integrationEndpoint('TASKELITH_NATS_URL');
  readonly database: URL;
  readonly #server: URL;
  readonly #settings: ControlPlaneSettings;
  readonly #operator: string;
  readonly #authority: BrokerAuthority;
  #running: RunningControlPlane | undefined;
  #store: PostgresDatabase | undefined;

  private constructor(fields: {
    base: string; address: TransportAddress; database: URL; server: URL; settings: ControlPlaneSettings; operator: string;
    authority: BrokerAuthority; logs: InMemoryLogSink;
  }) {
    this.logs = fields.logs;
    this.base = fields.base;
    this.address = fields.address;
    this.database = fields.database;
    this.#server = fields.server;
    this.#settings = fields.settings;
    this.#operator = fields.operator;
    this.#authority = fields.authority;
  }

  static async create(name: string, options: { readonly postgres: PostgresRoute }): Promise<ScenarioInstallation> {
    const server = integrationEndpoint('TASKELITH_POSTGRES_URL');
    const databaseName = `taskelith_${name}_${process.pid}_${++installations}`;
    await sql(server, `CREATE DATABASE ${databaseName}`);
    const database = withDatabase(server, databaseName);
    const routed = withDatabase(options.postgres === 'proxied' ? integrationEndpoint('TASKELITH_POSTGRES_PROXY_URL') : server, databaseName);
    const base = mkdtempSync(join(tmpdir(), `taskelith-${name}-`));
    const dataRoot = join(base, 'control-plane');
    const authority = await registerAccount(dataRoot);
    const environment = { TASKELITH_DATA_DIR: dataRoot, TASKELITH_POSTGRES_URL: database.href, TASKELITH_NATS_URL: integrationEndpoint('TASKELITH_NATS_URL').href };
    const initialized = await admin(environment, ['init', '--actor', 'root@scenario', '--reason', 'g2 scenarios']) as {
      identity: { installationId: string }; operatorSecret: string;
    };
    const logs = new InMemoryLogSink();
    const installation = new ScenarioInstallation({
      base, database, server, operator: initialized.operatorSecret, authority, logs,
      address: value(TransportAddress.of(initialized.identity.installationId)),
      settings: {
        dataRoot, ownerUid: process.getuid!(), postgres: routed, nats: integrationEndpoint('TASKELITH_NATS_URL'),
        api: { host: '127.0.0.1', port: 0 }, workflows: [{ definition: WORKFLOW, digest: DIGEST }],
        sweepMilliseconds: 500, placementMilliseconds: 200, shutdownMilliseconds: 2_000,
        lostContactTimeoutMilliseconds: LOST_CONTACT_TIMEOUT_MILLISECONDS, lostContactCheckMilliseconds: 250,
        transportLimits: SCENARIO_LIMITS, logSink: logs,
      },
    });
    await installation.start();
    assert.equal((await installation.call('POST', '/runs', { runId: RUN_ID, projectId: 'project-1', binding: BINDING })).status, 201);
    return installation;
  }

  get apiUrl(): URL {
    assert.ok(this.#running, 'the control plane runs');
    return new URL(`http://127.0.0.1:${this.#running.api.port}/`);
  }

  get store(): PostgresDatabase {
    this.#store ??= new PostgresDatabase(this.database);
    return this.#store;
  }

  async start(): Promise<void> {
    this.#running = value(await startControlPlane(this.#settings));
  }

  async stop(): Promise<void> {
    await this.#running?.stop();
  }

  get stopped(): Promise<'stopped' | 'failed'> | undefined {
    return this.#running?.stopped;
  }

  environment(): Record<string, string> {
    return {
      TASKELITH_DATA_DIR: this.#settings.dataRoot, TASKELITH_POSTGRES_URL: this.database.href, TASKELITH_NATS_URL: this.nats.href,
      TASKELITH_OPERATOR_TOKEN: this.#operator,
    };
  }

  async enrollmentToken(): Promise<string> {
    return (await admin(this.environment(), ['issue-enrollment-token']) as { enrollmentToken: string }).enrollmentToken;
  }

  async revokeWorker(workerId: string): Promise<void> {
    await admin(this.environment(), ['revoke-worker', workerId]);
  }

  async call(method: string, path: string, body?: unknown): Promise<Answer> {
    const response = await fetch(new URL(path.replace(/^\//, ''), this.apiUrl), {
      method, headers: { 'content-type': 'application/json', authorization: `Bearer ${this.#operator}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }

  async submitTask(taskId: string): Promise<void> {
    const submitted = await this.call('POST', `/runs/${RUN_ID}/tasks`, { taskId, kind: 'planning', stageId: 'specs' });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  }

  async result(taskId: string): Promise<Record<string, unknown>> {
    const read = await this.call('GET', `/runs/${RUN_ID}/tasks/${taskId}/result`);
    assert.equal(read.status, 200, JSON.stringify(read.body));
    return read.body;
  }

  async task(taskId: string): Promise<Task> {
    return value(await this.store.transaction((tx) => tx.tasks.get(taskId as TaskId)));
  }

  // Resolves once the task's stored result is no longer pending.
  async ended(taskId: string, timeoutMilliseconds = 30_000): Promise<Record<string, unknown>> {
    let result: Record<string, unknown> = {};
    await waitFor(async () => {
      result = await this.result(taskId);
      return result.state !== 'pending';
    }, timeoutMilliseconds, `task ${taskId} ended`);
    return result;
  }

  query<Row extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<Row[]> {
    return sql(this.database, text, values);
  }

  // The commands the outbox addressed to a worker, oldest first.
  async commandsTo(workerId: string): Promise<{ type: string; payload: Record<string, unknown> }[]> {
    const rows = await this.query<{ event_type: string; message: string }>(
      `SELECT event_type, message FROM outbox WHERE (message::jsonb)->>'subject' = $1 ORDER BY position`, [`workers.${workerId}.commands`],
    );
    return rows.map((row) => ({ type: row.event_type, payload: (JSON.parse(row.message) as { payload: { payload: Record<string, unknown> } }).payload.payload }));
  }

  // Every message the observations stream holds, oldest first, as JSON.
  async observations(): Promise<{ subject: string; body: Record<string, unknown> }[]> {
    const broker = value(await connectTransport({ server: this.nats, address: this.address, creds: this.#authority.user('reader', epochSeconds()).creds }));
    try {
      const stream = this.address.streamName('observations');
      const { state } = await broker.jsm.streams.info(stream);
      const messages: { subject: string; body: Record<string, unknown> }[] = [];
      for (let sequence = state.first_seq; sequence <= state.last_seq && state.messages > 0; sequence += 1) {
        const stored = await broker.jsm.streams.getMessage(stream, { seq: sequence }).catch(() => null);
        if (stored !== null) messages.push({ subject: stored.subject, body: stored.json() });
      }
      return messages;
    } finally {
      await broker.close();
    }
  }

  async close(): Promise<void> {
    await this.stop();
    await this.#store?.close();
    const broker = value(await connectTransport({ server: this.nats, address: this.address, creds: this.#authority.user('cleanup', epochSeconds()).creds }));
    for (const kind of ['commands', 'observations', 'sdlc', 'quarantine', 'advisories'] as const) {
      await broker.jsm.streams.delete(this.address.streamName(kind)).catch(() => false);
    }
    await broker.close();
    rmSync(this.base, { recursive: true, force: true });
    await sql(this.#server, `DROP DATABASE IF EXISTS ${this.database.pathname.slice(1)} WITH (FORCE)`);
  }
}

// A fresh account, registered on the test server, which trusts the test
// operator, as the control-plane API test does.
async function registerAccount(dataRoot: string): Promise<BrokerAuthority> {
  const keys = { ...JSON.parse(integrationSecret('authority.json')), accountSeed: new TextDecoder().decode(createAccount().getSeed()) };
  value(value(ControlPlaneNamespace.open({ dataRoot, ownerUid: process.getuid!() })).create('broker-authority', keys));
  const authority = value(BrokerAuthority.fromKeys(keys));
  const system = value(await connectSystemAccount({ server: integrationEndpoint('TASKELITH_NATS_URL'), creds: integrationSecret('system.creds') }));
  value(await new NatsBrokerCredentials(authority, system.connection).publishRevocations([]));
  await system.close();
  return authority;
}

async function admin(environment: Record<string, string>, argv: string[]): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const io: AdminIo = { environment, platform: process.platform, ownerUid: process.getuid!(), write: (line) => lines.push(line) };
  assert.equal(await adminMain(argv, io), 0, lines.join('\n'));
  return JSON.parse(lines.join('\n'));
}

function withDatabase(server: URL, name: string): URL {
  const url = new URL(server);
  url.pathname = `/${name}`;
  return url;
}

export async function sql<Row extends pg.QueryResultRow>(url: URL, text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

function epochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
