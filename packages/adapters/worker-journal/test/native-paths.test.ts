import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { failed, value } from '@taskelith/testing';
import { enrollWorkerRoot, failureReason, openWorkerRoot, type WorkerRoot } from '@taskelith/worker-journal';
import { ENROLLMENT, rootOptions, temporaryDataRoot } from './fixtures.ts';

// Native acceptance (G2 item 25b): data roots whose paths hold spaces, and
// case-variant paths on a case-insensitive volume such as default APFS.

let base: string;
let remove: () => void;
const opened: WorkerRoot[] = [];

beforeEach(() => {
  let dataRoot: string;
  ({ dataRoot, remove } = temporaryDataRoot());
  base = dirname(dataRoot);
});

afterEach(() => {
  for (const root of opened.splice(0)) root.close();
  remove();
});

function keep(root: WorkerRoot): WorkerRoot {
  opened.push(root);
  return root;
}

function caseInsensitive(directory: string): boolean {
  writeFileSync(join(directory, 'Case-Probe'), '');
  return existsSync(join(directory, 'case-probe'));
}

test('a data root whose path holds spaces enrolls, reopens, and keeps its lock', () => {
  const dataRoot = join(base, 'Application Support', 'Taskelith data');
  mkdirSync(dirname(dataRoot), { recursive: true });
  value(enrollWorkerRoot(rootOptions(dataRoot), ENROLLMENT)).close();
  const reopened = keep(value(openWorkerRoot(rootOptions(dataRoot))));
  assert.equal(reopened.paths.journal, join(dataRoot, 'worker', 'journal', 'journal.sqlite'));
  assert.equal(failureReason(failed(openWorkerRoot(rootOptions(dataRoot)))), 'root-locked');
});

test('on a case-insensitive volume a case-variant path of a held root is locked', (context) => {
  if (!caseInsensitive(base)) {
    context.skip('the temporary volume is case-sensitive');
    return;
  }
  const dataRoot = join(base, 'Data');
  keep(value(enrollWorkerRoot(rootOptions(dataRoot), ENROLLMENT)));
  assert.equal(failureReason(failed(openWorkerRoot(rootOptions(join(base, 'data'))))), 'root-locked');
});
