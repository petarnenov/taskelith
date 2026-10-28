import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { failed, value } from '@taskelith/testing';
import {
  adoptGeneration,
  enrollWorkerRoot,
  failureReason,
  finishAdoption,
  readCredentialFiles,
  readIdentity,
  readPendingGeneration,
  readWorkerCredentials,
  removeSupersededGeneration,
  storePendingGeneration,
  type WorkerRoot,
} from '@taskelith/worker-journal';
import { ENROLLMENT, rootOptions, temporaryDataRoot } from './fixtures.ts';

let dataRoot: string;
let remove: () => void;
const opened: WorkerRoot[] = [];

beforeEach(() => {
  ({ dataRoot, remove } = temporaryDataRoot());
});

afterEach(() => {
  for (const root of opened.splice(0)) root.close();
  remove();
});

function enroll(): WorkerRoot {
  const root = value(enrollWorkerRoot(rootOptions(dataRoot), ENROLLMENT));
  opened.push(root);
  return root;
}

const PENDING = { credentialGeneration: 2, controlPlane: 'tkwk_next-secret', brokerSeed: 'SUAEXAMPLESEED' };
const NEXT = { controlPlane: PENDING.controlPlane, broker: 'next creds text' };

test('a pending generation is created once at mode 0600, and the first one wins', () => {
  const { paths } = enroll();
  assert.equal(value(readPendingGeneration(paths, 2)), undefined);
  assert.deepEqual(value(storePendingGeneration(paths, PENDING)), PENDING);
  const file = join(paths.credentials, 'pending.2');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const second = value(storePendingGeneration(paths, { ...PENDING, controlPlane: 'tkwk_other', brokerSeed: 'SUAOTHER' }));
  assert.deepEqual(second, PENDING, 'the stored secrets may already be signed for');
  assert.deepEqual(value(readPendingGeneration(paths, 2)), PENDING);
});

test('a pending file with other values or no JSON is corrupt', () => {
  const { paths } = enroll();
  const file = join(paths.credentials, 'pending.2');
  for (const content of ['{', JSON.stringify({ format: 1, credentialGeneration: 3, controlPlane: 'x', brokerSeed: 'y' })]) {
    writeFileSync(file, content, { mode: 0o600 });
    assert.equal(failureReason(failed(readPendingGeneration(paths, 2))), 'corrupt', content);
  }
});

test('adoption keeps the predecessor in the identity until the confirmation removes it', () => {
  const root = enroll();
  const { paths } = root;
  value(storePendingGeneration(paths, PENDING));
  const adopted = value(adoptGeneration(paths, root.identity, 2, NEXT));
  assert.equal(adopted.credentialGeneration, 2);
  assert.deepEqual(adopted.previous, { credentialGeneration: 1, credentials: root.identity.credentials });
  assert.deepEqual(value(readIdentity(paths.identity)), adopted);
  assert.deepEqual(value(readWorkerCredentials(paths, adopted)), NEXT);
  assert.deepEqual(value(readCredentialFiles(paths, adopted.previous!.credentials)), ENROLLMENT.credentials);
  assert.equal(failed(adoptGeneration(paths, adopted, 3, NEXT)).code, 'conflict', 'no adoption before the confirmation');

  const finished = value(finishAdoption(paths, adopted));
  assert.equal(finished.previous, undefined);
  assert.deepEqual(value(readIdentity(paths.identity)), finished);
  for (const name of ['control-plane.1', 'broker.1.creds', 'pending.2']) assert.equal(existsSync(join(paths.credentials, name)), false, name);
  assert.deepEqual(value(readWorkerCredentials(paths, finished)), NEXT);
  assert.deepEqual(value(finishAdoption(paths, finished)), finished, 'a repeat changes nothing');
});

test('only a confirmed generation has its predecessor and its pending file removed; the next pending file stays', () => {
  const root = enroll();
  const { paths } = root;
  const exists = (name: string) => existsSync(join(paths.credentials, name));
  value(removeSupersededGeneration(paths, root.identity));
  assert.equal(exists('control-plane.1'), true, 'generation 1 supersedes nothing');
  value(storePendingGeneration(paths, PENDING));
  const adopted = value(adoptGeneration(paths, root.identity, 2, NEXT));
  value(removeSupersededGeneration(paths, adopted));
  assert.deepEqual(['control-plane.1', 'pending.2'].map(exists), [true, true], 'a kept predecessor stays');

  const { previous: _kept, ...confirmed } = adopted;
  value(storePendingGeneration(paths, { ...PENDING, credentialGeneration: 3 }));
  value(removeSupersededGeneration(paths, confirmed));
  assert.deepEqual(['control-plane.1', 'broker.1.creds', 'pending.2'].map(exists), [false, false, false]);
  assert.deepEqual(['control-plane.2', 'broker.2.creds', 'pending.3'].map(exists), [true, true, true]);
});

test('a predecessor file that cannot be removed fails the removal with a flush failure', () => {
  const root = enroll();
  const { paths } = root;
  value(storePendingGeneration(paths, PENDING));
  const { previous: _kept, ...confirmed } = value(adoptGeneration(paths, root.identity, 2, NEXT));
  rmSync(join(paths.credentials, 'control-plane.1'));
  mkdirSync(join(paths.credentials, 'control-plane.1', 'entry'), { recursive: true });
  const refused = failed(removeSupersededGeneration(paths, confirmed));
  assert.equal(failureReason(refused), 'flush-failure');
  assert.equal(refused.details.path, join(paths.credentials, 'control-plane.1'));
  assert.equal(existsSync(join(paths.credentials, 'pending.2')), true, 'the removal stops at the first failure');
});

test('an adoption repeated after a crash accepts its own files and refuses other content', () => {
  const root = enroll();
  const { paths } = root;
  writeFileSync(join(paths.credentials, 'control-plane.2'), NEXT.controlPlane, { mode: 0o600 });
  const adopted = value(adoptGeneration(paths, root.identity, 2, NEXT));
  assert.equal(adopted.credentialGeneration, 2);

  const other = temporaryDataRoot();
  try {
    const second = value(enrollWorkerRoot(rootOptions(other.dataRoot), ENROLLMENT));
    opened.push(second);
    writeFileSync(join(second.paths.credentials, 'broker.2.creds'), 'foreign creds', { mode: 0o600 });
    assert.equal(failureReason(failed(adoptGeneration(second.paths, second.identity, 2, NEXT))), 'corrupt');
    assert.equal(value(readIdentity(second.paths.identity)).credentialGeneration, 1, 'the identity is unchanged');
  } finally {
    other.remove();
  }
  assert.equal(failed(adoptGeneration(paths, root.identity, 3, NEXT)).code, 'conflict', 'only the next generation');
});

test('an identity whose predecessor is not the generation before is corrupt; format 1 is still read', () => {
  const root = enroll();
  const { paths } = root;
  const stored = JSON.parse(readFileSync(paths.identity, 'utf8')) as Record<string, unknown>;
  const kept = { credentialGeneration: 1, credentials: stored.credentials };
  writeFileSync(paths.identity, JSON.stringify({ ...stored, credentialGeneration: 3, previous: kept }));
  assert.equal(failureReason(failed(readIdentity(paths.identity))), 'corrupt');
  writeFileSync(paths.identity, JSON.stringify({ ...stored, credentialGeneration: 2, previous: { credentialGeneration: 1, credentials: null } }));
  assert.equal(failureReason(failed(readIdentity(paths.identity))), 'corrupt');
  writeFileSync(paths.identity, JSON.stringify({ ...stored, format: 1 }));
  assert.equal(value(readIdentity(paths.identity)).credentialGeneration, 1);
});
