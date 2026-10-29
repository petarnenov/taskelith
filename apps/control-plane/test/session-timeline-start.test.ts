import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { startAgentSessionServices } from '@taskelith/control-plane';
import {
  ControlPlaneNamespace,
  SESSION_INPUT_DIGEST_KEY_FILE,
  SESSION_OUTPUT_TAIL_KEY_FILE,
  SessionInputDigestKeyFile,
  SessionOutputTailKeyFile,
} from '@taskelith/control-plane-store';
import { PostgresDatabase } from '@taskelith/postgres';
import { parseInstant } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
const CLOCK = { now: () => value(parseInstant('2026-10-29T09:00:00.000Z')) };
let base: string;
let database: PostgresDatabase;

function namespace(): ControlPlaneNamespace {
  base = mkdtempSync(join(tmpdir(), 'taskelith-timeline-start-'));
  return value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid }));
}

// The pool connects on first use only, so no server is needed here.
function unusedDatabase(): PostgresDatabase {
  database = new PostgresDatabase(new URL('postgres://nobody@127.0.0.1:9/none'));
  return database;
}

afterEach(async () => {
  rmSync(base, { recursive: true, force: true });
  await database.close();
});

test('the session timeline service starts with the installation digest and output tail keys', () => {
  const space = namespace();
  value(new SessionInputDigestKeyFile(space).create());
  value(new SessionOutputTailKeyFile(space).create());
  assert.ok(value(startAgentSessionServices(space, unusedDatabase(), CLOCK)));
});

test('a missing digest key refuses the service start and names init, which creates it', () => {
  const refused = failed(startAgentSessionServices(namespace(), unusedDatabase(), CLOCK));
  assert.equal(refused.code, 'precondition-failed');
  assert.equal(refused.message, 'session-input-digest.key is missing; run init');
});

test('a digest key of the wrong size refuses the service start with a reason that holds no key byte', () => {
  const space = namespace();
  const key = Buffer.from('sentinel-key-bytes');
  const encoded = key.toString('base64');
  writeFileSync(join(space.directory, SESSION_INPUT_DIGEST_KEY_FILE), JSON.stringify({ format: 1, key: encoded }), { mode: 0o600 });
  const refused = failed(startAgentSessionServices(space, unusedDatabase(), CLOCK));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', `the input digest key has ${key.length} bytes, not 32`]);
  const reason = JSON.stringify(refused);
  for (const form of [encoded, key.toString('hex'), 'sentinel']) assert.equal(reason.includes(form), false);
});

test('a missing output tail key refuses the service start and names init', () => {
  const space = namespace();
  value(new SessionInputDigestKeyFile(space).create());
  const refused = failed(startAgentSessionServices(space, unusedDatabase(), CLOCK));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', 'session-output-tail.key is missing; run init']);
});

test('an output tail key of the wrong size refuses the service start with a reason that holds no key byte', () => {
  const space = namespace();
  value(new SessionInputDigestKeyFile(space).create());
  const key = Buffer.from('sentinel-tail-bytes');
  const encoded = key.toString('base64');
  writeFileSync(join(space.directory, SESSION_OUTPUT_TAIL_KEY_FILE), JSON.stringify({ format: 1, key: encoded }), { mode: 0o600 });
  const refused = failed(startAgentSessionServices(space, unusedDatabase(), CLOCK));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', `the session output tail key has ${key.length} bytes, not 32`]);
  const reason = JSON.stringify(refused);
  for (const form of [encoded, key.toString('hex'), 'sentinel']) assert.equal(reason.includes(form), false);
});
