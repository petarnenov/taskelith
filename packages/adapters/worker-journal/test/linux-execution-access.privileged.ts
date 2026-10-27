import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// Runs only as root in the container of make verify-linux-cgroup, whose
// image has the execution account `taskelith-exec`.
const EXECUTION = Number(spawnSync('id', ['-u', 'taskelith-exec'], { encoding: 'utf8' }).stdout.trim());
const ENROLL = new URL('./fixtures/enroll-root.ts', import.meta.url).pathname;
// The worker container's entrypoint keeps exactly these capabilities.
const WORKER = ['--bounding-set=-all,+setuid,+setgid,+kill', '--inh-caps=-all', '--no-new-privs'];
const BASE = mkdtempSync(join(tmpdir(), 'taskelith-access-'));
// The data root's parent, like /var/lib, lets every account pass.
chmodSync(BASE, 0o711);

after(() => rmSync(BASE, { recursive: true, force: true }));

function enrollAsWorker(dataRoot: string, groups: readonly string[]) {
  const node = [process.execPath, '--experimental-strip-types', ENROLL, dataRoot, String(EXECUTION)];
  return spawnSync('setpriv', [...WORKER, ...groups, '--', ...node], { encoding: 'utf8' });
}

// Runs `script` as the worker, with the execution group, under umask 0007.
function asWorker(script: string): number | null {
  const command = ['sh', '-c', `umask 0007 && ${script}`];
  return spawnSync('setpriv', [...WORKER, `--groups=${EXECUTION}`, '--', ...command], { encoding: 'utf8' }).status;
}

// Runs `script` under the execution account and reports its exit status.
function asExecution(script: string): number | null {
  const ids = ['--reuid', String(EXECUTION), '--regid', String(EXECUTION), '--clear-groups'];
  return spawnSync('setpriv', [...ids, '--', 'sh', '-c', script], { encoding: 'utf8' }).status;
}

test('the execution account traverses to the workspaces and reads no control record', () => {
  const dataRoot = join(BASE, 'joined');
  const enrolled = enrollAsWorker(dataRoot, [`--groups=${EXECUTION}`]);
  assert.equal(enrolled.status, 0, enrolled.stderr);
  const worker = join(dataRoot, 'worker');
  const checkout = join(worker, 'workspaces', 'attempt-1', 'checkout');
  mkdirSync(checkout, { recursive: true });
  for (const directory of [join(worker, 'workspaces', 'attempt-1'), checkout]) {
    spawnSync('chgrp', [String(EXECUTION), directory]);
  }
  chmodSync(join(worker, 'workspaces', 'attempt-1'), 0o710);
  chmodSync(checkout, 0o2770);
  writeFileSync(join(checkout, 'README.md'), 'base\n');
  assert.equal(asExecution(`echo agent > '${checkout}/agent.txt'`), 0, 'writes in its checkout');
  const refused = [
    `ls '${dataRoot}'`, `ls '${worker}'`, `ls '${worker}/workspaces'`, `cat '${worker}/identity'`,
    `cat '${worker}/lock'`, `ls '${worker}/journal'`, `cat '${worker}/journal/journal.sqlite'`,
    `ls '${worker}/credentials'`, `ls '${worker}/executions'`, `ls '${worker}/logs'`,
    `touch '${worker}/workspaces/planted'`, `touch '${worker}/planted'`,
  ];
  for (const command of refused) assert.notEqual(asExecution(command), 0, command);
});

test('the execution account reads and edits what the clone wrote once handed off', () => {
  const dataRoot = join(BASE, 'cloned');
  assert.equal(enrollAsWorker(dataRoot, [`--groups=${EXECUTION}`]).status, 0);
  const attempt = join(dataRoot, 'worker', 'workspaces', 'attempt-1');
  const checkout = join(attempt, 'checkout');
  // Git workspace contract section 3: the checkout exists, with the group
  // and set-group-ID, before the clone writes into it.
  const prepared = asWorker([
    `mkdir '${attempt}' '${checkout}'`, `chgrp ${EXECUTION} '${attempt}' '${checkout}'`,
    `chmod 0710 '${attempt}'`, `chmod 2700 '${checkout}'`,
    `mkdir -p '${checkout}/src/deep'`, `echo base > '${checkout}/src/deep/main.txt'`,
  ].join(' && '));
  assert.equal(prepared, 0);
  assert.notEqual(asExecution(`ls '${checkout}'`), 0, 'reaches no reclaimed checkout');
  assert.equal(asWorker(`chmod 2770 '${checkout}'`), 0);
  const allowed = [
    `ls '${checkout}/src/deep'`, `cat '${checkout}/src/deep/main.txt'`,
    `echo agent >> '${checkout}/src/deep/main.txt'`, `echo agent > '${checkout}/src/deep/agent.txt'`,
  ];
  for (const command of allowed) assert.equal(asExecution(command), 0, command);
});

test('without the execution group the worker cannot open the path and enrolls nothing', () => {
  const dataRoot = join(BASE, 'not-joined');
  const enrolled = enrollAsWorker(dataRoot, ['--clear-groups']);
  assert.equal(enrolled.status, 1);
  assert.match(enrolled.stderr, /precondition-failed: cannot open the workspaces/);
  assert.notEqual(asExecution(`test -x '${dataRoot}'`), 0);
});
