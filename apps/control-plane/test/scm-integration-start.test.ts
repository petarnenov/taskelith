import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { startScmIntegrationServices } from '@taskelith/control-plane';
import { ControlPlaneNamespace, SCM_INTEGRATION_SECRET_KEY_FILE, ScmIntegrationSecretKeyFile } from '@taskelith/control-plane-store';
import { SILENT_LOGGER } from '@taskelith/observability';
import { PostgresDatabase } from '@taskelith/postgres';
import { instantFromEpochMilliseconds, ok } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
const NO_PROJECTS = { exists: async () => ok(false) };
const CLOCK = { now: () => value(instantFromEpochMilliseconds(0)) };
let base: string;
let database: PostgresDatabase;

function namespace(): ControlPlaneNamespace {
  base = mkdtempSync(join(tmpdir(), 'taskelith-scm-start-'));
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

test('the SCM integration services start with the installation SCM secret key', () => {
  const space = namespace();
  value(new ScmIntegrationSecretKeyFile(space).create());
  assert.ok(value(startScmIntegrationServices(space, unusedDatabase(), SILENT_LOGGER, NO_PROJECTS, CLOCK)));
});

test('a missing SCM secret key refuses the start and names init, which creates it', () => {
  const refused = failed(startScmIntegrationServices(namespace(), unusedDatabase(), SILENT_LOGGER, NO_PROJECTS, CLOCK));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', 'scm-integration-secrets.key is missing; run init']);
});

test('an SCM secret key of the wrong size refuses the start with a reason that holds no key byte', () => {
  const space = namespace();
  const key = Buffer.from('sentinel-scm-bytes');
  const encoded = key.toString('base64');
  writeFileSync(join(space.directory, SCM_INTEGRATION_SECRET_KEY_FILE), JSON.stringify({ format: 1, key: encoded }), { mode: 0o600 });
  const refused = failed(startScmIntegrationServices(space, unusedDatabase(), SILENT_LOGGER, NO_PROJECTS, CLOCK));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', `the SCM integration secret key has ${key.length} bytes, not 32`]);
  for (const form of [encoded, key.toString('hex'), 'sentinel']) assert.equal(JSON.stringify(refused).includes(form), false);
});
