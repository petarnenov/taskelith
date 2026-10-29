import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { SessionTimelineService, TurnId } from '@taskelith/execution';
import { PostgresDatabase, PostgresSessionTimelineStore } from '@taskelith/postgres';
import { failed, value } from '@taskelith/testing';
import {
  Barrier,
  HALF_JWT_CHUNK,
  JWT,
  SESSION,
  barrierStore,
  generation,
  postgresService,
  sessionWithOpenRequest,
  timelineService,
} from './session-timeline-fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
const service = postgresService(database);
after(() => database.close());
beforeEach(() => truncateAll(url));

const FIRST = generation(1);
const append = (timeline: SessionTimelineService, turnId: TurnId, text: string) => timeline.appendOutput(SESSION, { turnId, generation: FIRST, text });

// Runs the work with a service over a new pool, as a restarted process.
async function restarted(work: (timeline: SessionTimelineService) => Promise<void>): Promise<void> {
  const pool = new PostgresDatabase(url);
  try {
    await work(postgresService(pool));
  } finally {
    await pool.close();
  }
}

// Every stored byte of the session timeline's output, as text.
async function storedOutput(): Promise<string> {
  const rows = await query<{ text: string }>(url, `SELECT record AS text FROM agent_session_output
    UNION ALL SELECT encode(nonce, 'escape') || encode(sealed, 'escape') FROM agent_session_output_tails`);
  return rows.map((row) => row.text).join('\n');
}

function assertNoPart(text: string, label: string): void {
  for (let start = 0; start + 4 <= 30; start += 1) assert.equal(text.includes(JWT.slice(start, start + 4)), false, label);
}

test('after a restart a held half JWT is in no read and no stored byte, and the next chunk records the JWT redacted', async () => {
  const turnId = await sessionWithOpenRequest(service);
  value(await append(service, turnId, HALF_JWT_CHUNK));
  await restarted(async (timeline) => {
    const page = value(await timeline.readOutput(SESSION, 0, 100));
    const session = value(await timeline.readSession(SESSION));
    assertNoPart(JSON.stringify([page, session]), 'reads');
    assertNoPart(await storedOutput(), 'stored bytes');
    const [tail] = await query<{ bytes: number }>(url, 'SELECT octet_length(sealed) AS bytes FROM agent_session_output_tails');
    assert.ok(tail!.bytes > 16, 'the tail row holds its ciphertext');
    value(await append(timeline, turnId, `${JWT.slice(30)} done\n`));
    const read = value(await timeline.readOutput(SESSION, 0, 100));
    assert.deepEqual(read.kind === 'entries' && read.entries.map((entry) => entry.text), ['token ', '[redacted] done\n']);
  });
});

test('a generation ended through recovery after a restart releases a lone held tail redacted as its turn\'s last entry', async () => {
  const turnId = await sessionWithOpenRequest(service);
  value(await append(service, turnId, `token ${JWT}`));
  await restarted(async (timeline) => {
    value(await timeline.endGeneration(SESSION, FIRST));
    const read = value(await timeline.readOutput(SESSION, 0, 100));
    assert.deepEqual(read.kind === 'entries' && read.entries.map((entry) => [entry.turnId, entry.text]), [[turnId, 'token '], [turnId, '[redacted]']]);
  });
  assert.deepEqual(await query(url, 'SELECT 1 FROM agent_session_output_tails'), []);
});

test('a held tail whose ciphertext was changed in the database fails the next append with internal and records nothing', async () => {
  const turnId = await sessionWithOpenRequest(service);
  value(await append(service, turnId, HALF_JWT_CHUNK));
  await query(url, 'UPDATE agent_session_output_tails SET sealed = set_byte(sealed, 0, get_byte(sealed, 0) # 1)');
  const refused = failed(await append(service, turnId, 'more\n'));
  assert.equal(refused.code, 'internal');
  assertNoPart(JSON.stringify(refused), 'the reason');
  const read = value(await service.readOutput(SESSION, 0, 100));
  assert.deepEqual(read.kind === 'entries' && read.entries.map((entry) => entry.text), ['token ']);
});

// Both chunks only grow the held tail, so the tail row alone decides.
test('two concurrent appends that only hold commit as one serial order, each chunk once, after the loser retries', async () => {
  const turnId = await sessionWithOpenRequest(service);
  value(await append(service, turnId, 'x tok'));
  const barrier = new Barrier(2);
  const racing = () => timelineService(barrierStore(new PostgresSessionTimelineStore(database), barrier));
  const results = await Promise.all([append(racing(), turnId, 'en1'), append(racing(), turnId, 'en2')]);
  for (const result of results) assert.equal(result.ok, true);
  value(await append(service, turnId, '\n'));
  const read = value(await service.readOutput(SESSION, 0, 100));
  const joined = read.kind === 'entries' ? read.entries.map((entry) => entry.text).join('') : '';
  assert.ok(['x token1en2\n', 'x token2en1\n'].includes(joined), joined);
  assert.deepEqual(await query(url, 'SELECT 1 FROM agent_session_output_tails'), []);
});
