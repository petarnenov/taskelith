import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before, describe } from 'node:test';
import { SUPERVISOR_MAIN } from '@taskelith/worker-supervisor';
import { parsePsListing, procCommandLine } from './g2-scenarios/leftover-processes.ts';
import {
  assertMacosSupervised, cancelSignalOf, isContainmentOf, launchHostOf, macosLaunchFromEnvironment,
} from './g2-scenarios/scenario-launch.ts';

// The launch hosts of the G2 races and their supervisor guards.
const PARENT = '/sys/fs/cgroup/executions/taskelith-g2-abc-cancel-after-w4';

test('a containment directly below the worker parent is its own', () => {
  assert.equal(isContainmentOf(PARENT, `${PARENT}/0b1c2d3e-execution`), true);
});

test('the bare parent, the root, a deeper cgroup, or another worker are not', () => {
  assert.equal(isContainmentOf(PARENT, PARENT), false);
  assert.equal(isContainmentOf(PARENT, '/sys/fs/cgroup/'), false);
  assert.equal(isContainmentOf(PARENT, `${PARENT}/execution/nested`), false);
  assert.equal(isContainmentOf(PARENT, '/sys/fs/cgroup/executions/taskelith-g2-abc-other/execution'), false);
  assert.equal(isContainmentOf(PARENT, `${PARENT}-other/execution`), false);
});

const LINUX_LAUNCH = { TASKELITH_CONTAINMENT_PARENT: '/sys/fs/cgroup/executions', TASKELITH_EXECUTION_UID: '10003', TASKELITH_EXECUTION_GID: '10003' };

test('the macOS launch is asked for only by its variable set to 1', () => {
  assert.equal(macosLaunchFromEnvironment({}, 'darwin'), false);
  assert.equal(macosLaunchFromEnvironment({ TASKELITH_MACOS_SCENARIOS: '0' }, 'darwin'), false);
  assert.equal(macosLaunchFromEnvironment({ TASKELITH_MACOS_SCENARIOS: '1' }, 'darwin'), true);
});

test('the macOS launch asked for off macOS throws, naming the platform', () => {
  assert.throws(() => macosLaunchFromEnvironment({ TASKELITH_MACOS_SCENARIOS: '1' }, 'linux'), /needs macOS, not linux/);
});

test('each launch host composes its own supervisor and cancel signal', () => {
  assert.equal(launchHostOf(LINUX_LAUNCH, false), 'cgroup-supervisor');
  assert.equal(launchHostOf(undefined, true), 'macos-supervisor');
  assert.equal(launchHostOf(undefined, false), 'process-group');
  assert.equal(cancelSignalOf('cgroup-supervisor'), 'SIGKILL');
  assert.equal(cancelSignalOf('macos-supervisor'), 'SIGTERM');
  assert.equal(cancelSignalOf('process-group'), 'SIGTERM');
});

test('a ps listing gives each process its whole command line', () => {
  const listing = '    1 /sbin/launchd\n81930 node /dist/supervisor-main.js launch /tmp/a b/executions/e\n\n';
  assert.deepEqual(parsePsListing(listing), [
    { pid: 1, commandLine: '/sbin/launchd' },
    { pid: 81930, commandLine: 'node /dist/supervisor-main.js launch /tmp/a b/executions/e' },
  ]);
});

test('a /proc command line reads as ps prints it', () => {
  assert.equal(procCommandLine('node\0/dist/supervisor-main.js\0adopt\0/tmp/w/e\0'), 'node /dist/supervisor-main.js adopt /tmp/w/e ');
});

// One line, as ps lists it: a parent named PROGRAM over a data root with
// a held child naming the root too; it prints the child's process ID.
const PARENT_SCRIPT = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', process.argv.at(-1)], { stdio: 'ignore' });",
  "process.stdout.write(`${child.pid}\\n`);",
  'setInterval(() => {}, 1000);',
].join(' ');

interface HeldFamily {
  readonly parent: ChildProcess;
  child: number;
}

// A parent that exits before it prints fails the start, not the run.
async function heldFamily(families: HeldFamily[], program: string, dataRoot: string, mode = 'launch'): Promise<HeldFamily> {
  const parent = spawn(process.execPath, ['-e', PARENT_SCRIPT, program, mode, join(dataRoot, 'executions', 'e')], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const family = { parent, child: 0 };
  families.push(family);
  const printed = once(parent.stdout!, 'data') as Promise<[Buffer]>;
  const exited = once(parent, 'exit').then(() => undefined);
  const output = await Promise.race([printed, exited]);
  if (output === undefined) throw new Error(`the parent of ${program} exited before it printed`);
  family.child = Number(output[0].toString().trim());
  return family;
}

function heldOrphan(dataRoot: string): ChildProcess {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', join(dataRoot, 'orphan')], { stdio: 'ignore' });
}

describe('the macOS guard', { timeout: 30_000 }, () => {
  const marker = randomBytes(6).toString('hex');
  const ownRoot = join(tmpdir(), `taskelith-guard-${marker}-own`);
  const families: HeldFamily[] = [];
  let orphan: ChildProcess | undefined;
  let own: HeldFamily;
  let testSide: HeldFamily;
  let otherWorker: HeldFamily;
  let sharedPrefix: HeldFamily;
  let adopter: HeldFamily;
  const rejected = /not of a launch supervisor of/;

  before(async () => {
    own = await heldFamily(families, SUPERVISOR_MAIN, ownRoot);
    testSide = await heldFamily(families, join(ownRoot, 'test-side-parent.js'), ownRoot);
    otherWorker = await heldFamily(families, SUPERVISOR_MAIN, join(tmpdir(), `taskelith-guard-${marker}-other`));
    sharedPrefix = await heldFamily(families, SUPERVISOR_MAIN, `${ownRoot}2`);
    adopter = await heldFamily(families, SUPERVISOR_MAIN, ownRoot, 'adopt');
    orphan = heldOrphan(ownRoot);
  });

  after(() => {
    for (const { parent, child } of families) {
      parent.kill('SIGKILL');
      if (child === 0) continue;
      try { process.kill(child, 'SIGKILL'); } catch { /* already gone */ }
    }
    orphan?.kill('SIGKILL');
  });

  test('accepts a child of a supervisor of the worker', () => {
    assert.doesNotThrow(() => assertMacosSupervised(ownRoot, [own.child]));
  });

  test('rejects a child of a test-side parent naming the worker', () => {
    assert.throws(() => assertMacosSupervised(ownRoot, [testSide.child]), rejected);
  });

  test('rejects a child of a supervisor of another worker', () => {
    assert.throws(() => assertMacosSupervised(ownRoot, [otherWorker.child]), rejected);
  });

  test('rejects a child of a supervisor of a data root it prefixes', () => {
    assert.throws(() => assertMacosSupervised(ownRoot, [sharedPrefix.child]), rejected);
  });

  test('rejects a child of an adopting supervisor of the worker', () => {
    assert.throws(() => assertMacosSupervised(ownRoot, [adopter.child]), rejected);
  });

  test('rejects a child of the test process', () => {
    assert.throws(() => assertMacosSupervised(ownRoot, [orphan!.pid!]), rejected);
  });
});
