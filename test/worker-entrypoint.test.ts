import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';

const script = resolve('infra/installation/worker-entrypoint.sh');

// `id` and `stat` report the configured owners; `mount`, `chown`, and
// `setpriv` only record their arguments.
const FAKES: Record<string, string> = {
  id: '#!/bin/sh\necho "$FAKE_UID"\n',
  stat: '#!/bin/sh\necho "$FAKE_DATA_OWNER"\n',
  mount: '#!/bin/sh\necho "mount $*" >> "$FAKE_CALLS"\n',
  chown: '#!/bin/sh\necho "chown $*" >> "$FAKE_CALLS"\n',
  setpriv: '#!/bin/sh\necho "setpriv $*" >> "$FAKE_CALLS"\n',
};

// One set of fakes for every run: a new executable is slow to start the
// first time on some hosts, such as macOS.
const BIN = mkdtempSync(join(tmpdir(), 'taskelith-entrypoint-bin-'));
for (const [name, body] of Object.entries(FAKES)) {
  writeFileSync(join(BIN, name), body);
  chmodSync(join(BIN, name), 0o755);
}
after(() => rmSync(BIN, { recursive: true, force: true }));

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
  readonly dataOwner?: string;
}

interface Exit {
  readonly status: number;
  readonly stderr: string;
}

function runBash(args: readonly string[], env: NodeJS.ProcessEnv): Promise<Exit> {
  return new Promise((settle) => {
    execFile('bash', [...args], { encoding: 'utf8', env }, (error, _stdout, stderr) => {
      settle({ status: error === null ? 0 : Number(error.code ?? 1), stderr });
    });
  });
}

async function runEntrypoint(options: Options = {}): Promise<Run> {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-entrypoint-'));
  try {
    const cgroup = join(root, 'cgroup');
    mkdirSync(cgroup);
    if (options.cgroupV2 !== false) writeFileSync(join(cgroup, 'cgroup.controllers'), 'cpu memory pids\n');
    writeFileSync(join(cgroup, 'cgroup.procs'), options.rootProcesses ?? '');
    if (options.readOnly === true) chmodSync(join(cgroup, 'cgroup.procs'), 0o444);
    const calls = join(root, 'calls');
    writeFileSync(calls, '');
    const run = await runBash([script, 'node', 'apps/worker/dist/main.js'], {
      PATH: [BIN, '/usr/bin', '/bin'].join(':'), FAKE_UID: options.uid ?? '0', FAKE_CALLS: calls,
      FAKE_DATA_OWNER: options.dataOwner ?? '10001', TASKELITH_TEST_CGROUP_ROOT: cgroup,
      TASKELITH_CONTAINMENT_PARENT: (options.parent ?? ((base) => `${base}/executions`))(cgroup),
      TASKELITH_DATA_DIR: '/var/lib/taskelith',
    });
    const made = ['init', 'executions'].filter((name) => existsSync(join(cgroup, name))).join(' ');
    const home = existsSync(join(cgroup, 'init', 'cgroup.procs')) ? readFileSync(join(cgroup, 'init', 'cgroup.procs'), 'utf8').trim() : '';
    return { status: run.status, stderr: run.stderr, calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean), cgroup: `${made}|${home}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the entrypoint delegates the subtree and runs the worker with three capabilities', async () => {
  const run = await runEntrypoint();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.cgroup, 'init executions|');
  assert.deepEqual(run.calls, [
    'chown -R 0:0 /var/lib/taskelith',
    'setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --no-new-privs -- node apps/worker/dist/main.js',
  ]);
});

test('a read-only cgroup mount is remounted read-write first', async () => {
  const run = await runEntrypoint({ readOnly: true });
  assert.match(run.calls[0] ?? '', /^mount -o remount,rw \S+\/cgroup$/);
});

test('a data root that root already owns keeps its owners', async () => {
  const run = await runEntrypoint({ dataOwner: '0' });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(!run.calls.some((call) => call.startsWith('chown')), run.calls.join('\n'));
});

test('the entrypoint refuses a start that cannot delegate the subtree', async () => {
  const refusals: readonly [Options, RegExp][] = [
    [{ uid: '10001' }, /start the worker container as root/],
    [{ cgroupV2: false }, /cgroup v2 is not mounted/],
    [{ parent: (base) => `${base}/init` }, /a child of \S+ other than init/],
    [{ parent: (base) => `${base}/executions/nested` }, /a child of \S+ other than init/],
    [{ parent: () => '/elsewhere/executions' }, /must be a child of/],
    [{ parent: () => '' }, /must be a child of/],
  ];
  const runs = await Promise.all(refusals.map(([options]) => runEntrypoint(options)));
  for (const [index, [options, message]] of refusals.entries()) {
    const run = runs[index]!;
    assert.equal(run.status, 1, JSON.stringify(options));
    assert.match(run.stderr, message);
    assert.ok(!run.calls.some((call) => call.startsWith('setpriv')), 'the worker does not start');
  }
});

test('processes left in the cgroup root fail the start', async () => {
  const run = await runEntrypoint({ rootProcesses: '4242\n' });
  assert.equal(run.status, 1);
  assert.equal(run.cgroup, 'init executions|4242');
  assert.match(run.stderr, /processes remain in the cgroup root/);
});
