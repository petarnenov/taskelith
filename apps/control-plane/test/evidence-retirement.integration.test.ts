import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';
import { EvidenceService } from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import { LocalEvidenceVolume } from '@taskelith/evidence-volume';
import { parseEvidencePublication, type EvidenceRecord, type WorkerId } from '@taskelith/execution';
import type { Instant } from '@taskelith/kernel';
import { PostgresDatabase, migrate } from '@taskelith/postgres';
import { integrationEndpoint, value } from '@taskelith/testing';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_retire_${process.pid}`;
const url = new URL(POSTGRES);
url.pathname = `/${databaseName}`;
const admin = new pg.Client({ connectionString: POSTGRES.href });
await admin.connect();
await admin.query(`CREATE DATABASE ${databaseName}`);
value(await migrate(url));
const database = new PostgresDatabase(url);
const base = mkdtempSync(join(tmpdir(), 'taskelith-retire-'));
const dataRoot = join(base, 'root');
value(ControlPlaneNamespace.open({ dataRoot, ownerUid: process.getuid!() }));
const volume = value(LocalEvidenceVolume.open({ dataRoot, ownerUid: process.getuid!() }));

after(async () => {
  await database.close();
  rmSync(base, { recursive: true, force: true });
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
});

function record(evidenceId: string, content: Buffer, publishedAt: string): EvidenceRecord {
  const publication = value(parseEvidencePublication({
    evidenceId, projectId: 'project-1', runId: 'run-1', taskId: 'task-1', attemptId: 'attempt-1', ownershipGeneration: 1,
    kind: 'execution-log', inputArtifacts: [], codeRevision: 'c0ffee', validator: { name: 'runner', version: '1' }, outcome: 'ok',
    contentDigest: `sha256:${createHash('sha256').update(content).digest('hex')}`, contentType: 'text/plain', sizeBytes: content.length,
    capturedAt: publishedAt,
  }));
  return { ...publication, producer: { kind: 'worker', workerId: 'worker-1' as WorkerId }, ownershipCurrent: true, publishedAt: publishedAt as Instant };
}

test('retirement keeps content that a publication committed while retirement waited for the digest lock', async () => {
  const content = Buffer.from('shared content');
  const old = record('evidence-old', content, '2024-01-01T00:00:00.000Z');
  value(await volume.put(old.contentDigest, content));
  value(await database.transaction((tx) => tx.evidence.add(old)));
  const fresh = record('evidence-new', content, '2026-10-25T09:00:00.000Z');
  const publisher = new pg.Client({ connectionString: url.href });
  await publisher.connect();
  try {
    // A publication holds the digest's lock and has not committed yet.
    await publisher.query('BEGIN');
    await publisher.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [fresh.contentDigest]);
    await publisher.query('INSERT INTO evidence (evidence_id, task_id, content_digest, record) VALUES ($1, $2, $3, $4)',
      [fresh.evidenceId, fresh.taskId, fresh.contentDigest, JSON.stringify(fresh)]);
    const retiring = new EvidenceService(database, volume).retire('evidence-old');
    const waiting = async () => (await admin.query<{ waiting: number }>(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = $1 AND wait_event = 'advisory'", [databaseName])).rows[0]!.waiting > 0;
    while (!(await waiting())) await new Promise((resolve) => setTimeout(resolve, 20));
    await publisher.query('COMMIT');
    value(await retiring);
  } finally {
    await publisher.end();
  }
  assert.equal(value(await database.transaction((tx) => tx.evidence.get(old.evidenceId))), undefined);
  assert.equal(Buffer.from(value(await volume.read(fresh.contentDigest))).toString(), 'shared content', 'the new record keeps its content');
});
