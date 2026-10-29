import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { startSessionTimelineService } from '@taskelith/control-plane';
import { ControlPlaneNamespace, SESSION_INPUT_DIGEST_KEY_FILE, SessionInputDigestKeyFile } from '@taskelith/control-plane-store';
import { PostgresDatabase } from '@taskelith/postgres';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
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

test('the session timeline service starts with the installation digest key', () => {
  const space = namespace();
  value(new SessionInputDigestKeyFile(space).create());
  assert.ok(value(startSessionTimelineService(space, unusedDatabase())));
});

test('a missing digest key refuses the service start', () => {
  const refused = failed(startSessionTimelineService(namespace(), unusedDatabase()));
  assert.equal(refused.code, 'precondition-failed');
  assert.match(refused.message, /session-input-digest\.key is missing/);
});

test('a digest key of the wrong size refuses the service start with a reason that holds no key byte', () => {
  const space = namespace();
  const key = Buffer.from('sentinel-key-bytes');
  const encoded = key.toString('base64');
  writeFileSync(join(space.directory, SESSION_INPUT_DIGEST_KEY_FILE), JSON.stringify({ format: 1, key: encoded }), { mode: 0o600 });
  const refused = failed(startSessionTimelineService(space, unusedDatabase()));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', `the input digest key has ${key.length} bytes, not 32`]);
  const reason = JSON.stringify(refused);
  for (const form of [encoded, key.toString('hex'), 'sentinel']) assert.equal(reason.includes(form), false);
});
