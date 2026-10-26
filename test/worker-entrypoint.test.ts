import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve('infra/installation/worker-entrypoint.sh');

// `id` reports the configured user; `mount`, `chown`, and `setpriv` only
// record their arguments.
const FAKES: Record<string, string> = {
  id: '#!/bin/sh\necho "$FAKE_UID"\n',
  mount: '#!/bin/sh\necho "mount $*" >> "$FAKE_CALLS"\n',
  chown: '#!/bin/sh\necho "chown $*" >> "$FAKE_CALLS"\n',
  setpriv: '#!/bin/sh\necho "setpriv $*" >> "$FAKE_CALLS"\n',
};

interface Run {
  readonly status: number | null;
  readonly stderr: string;
  readonly calls: readonly string[];
  readonly cgroup: string;
}

interface Options {
  readonly uid?: string;
  readonly parent?: (cgroup: string) => string;
  readonly rootProcesses?: string;
  readonly readOnly?: boolean;
  readonly cgroupV2?: boolean;
}

function runEntrypoint(options: Options = {}): Run {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-entrypoint-'));
  try {
    const bin = join(root, 'bin');
    const cgroup = join(root, 'cgroup');
    mkdirSync(bin);
    mkdirSync(cgroup);
    for (const [name, body] of Object.entries(FAKES)) {
      writeFileSync(join(bin, name), body);
      chmodSync(join(bin, name), 0o755);
    }
    if (options.cgroupV2 !== false) writeFileSync(join(cgroup, 'cgroup.controllers'), 'cpu memory pids\n');
    writeFileSync(join(cgroup, 'cgroup.procs'), options.rootProcesses ?? '');
    if (options.readOnly === true) chmodSync(join(cgroup, 'cgroup.procs'), 0o444);
    const calls = join(root, 'calls');
    writeFileSync(calls, '');
    const run = spawnSync('bash', [script, 'node', 'apps/worker/dist/main.js'], {
      encoding: 'utf8',
      env: {
        PATH: [bin, '/usr/bin', '/bin'].join(':'), FAKE_UID: options.uid ?? '0', FAKE_CALLS: calls,
        TASKELITH_CGROUP_ROOT: cgroup, TASKELITH_CONTAINMENT_PARENT: (options.parent ?? ((base) => `${base}/executions`))(cgroup),
        TASKELITH_DATA_DIR: '/var/lib/taskelith',
      },
    });
    const made = ['init', 'executions'].filter((name) => existsSync(join(cgroup, name))).join(' ');
    const home = existsSync(join(cgroup, 'init', 'cgroup.procs')) ? readFileSync(join(cgroup, 'init', 'cgroup.procs'), 'utf8').trim() : '';
    return { status: run.status, stderr: run.stderr, calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean), cgroup: `${made}|${home}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the entrypoint delegates the subtree and runs the worker with three capabilities', () => {
  const run = runEntrypoint();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.cgroup, 'init executions|');
  assert.deepEqual(run.calls, [
    'chown -R 0:0 /var/lib/taskelith',
    'setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --no-new-privs -- node apps/worker/dist/main.js',
  ]);
});

test('a read-only cgroup mount is remounted read-write first', () => {
  const run = runEntrypoint({ readOnly: true });
  assert.match(run.calls[0] ?? '', /^mount -o remount,rw \S+\/cgroup$/);
});

test('the entrypoint refuses a start that cannot delegate the subtree', () => {
  const refusals: readonly [Options, RegExp][] = [
    [{ uid: '10001' }, /start the worker container as root/],
    [{ cgroupV2: false }, /cgroup v2 is not mounted/],
    [{ parent: (base) => `${base}/init` }, /a child of \S+ other than init/],
    [{ parent: (base) => `${base}/executions/nested` }, /a child of \S+ other than init/],
    [{ parent: () => '/elsewhere/executions' }, /must be a child of/],
    [{ parent: () => '' }, /must be a child of/],
  ];
  for (const [options, message] of refusals) {
    const run = runEntrypoint(options);
    assert.equal(run.status, 1, JSON.stringify(options));
    assert.match(run.stderr, message);
    assert.ok(!run.calls.some((call) => call.startsWith('setpriv')), 'the worker does not start');
  }
});

test('processes left in the cgroup root fail the start', () => {
  const run = runEntrypoint({ rootProcesses: '4242\n' });
  assert.equal(run.status, 1);
  assert.equal(run.cgroup, 'init executions|4242');
  assert.match(run.stderr, /processes remain in the cgroup root/);
});
