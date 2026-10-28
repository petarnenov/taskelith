import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { failed, value } from '@taskelith/testing';
import {
  LinuxReclaimHost,
  ProcessGroupReclaimHost,
  RECLAIM_EXIT,
  RECLAIM_GO,
  RECLAIM_GO_BOUND_MS,
  RECLAIM_PROGRAM_MAIN,
  normalizeCheckout,
  parseReclaimArguments,
  receivedGo,
  runReclaimProgram,
  sharedMode,
} from '@taskelith/git-workspace';
import { launchedByDeadWorker } from './git-fixture.ts';

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'taskelith-reclaim-'));
  try {
    await run(directory);
  } finally {
    await chmod(directory, 0o700);
    await rm(directory, { recursive: true, force: true });
  }
}

const modeOf = async (path: string) => (await lstat(path)).mode & 0o7777;
const ACCOUNT = { uid: 10003, gid: 10003 };

test('the reclaim arguments name an absolute checkout and, together, a containment', () => {
  assert.deepEqual(value(parseReclaimArguments(['--checkout', '/w/checkout'])), { checkout: '/w/checkout', goWithinMs: RECLAIM_GO_BOUND_MS });
  assert.deepEqual(value(parseReclaimArguments(['--go-within-ms', '250', '--checkout', '/w/checkout'])), { checkout: '/w/checkout', goWithinMs: 250 });
  assert.deepEqual(value(parseReclaimArguments(['--checkout', '/w/c', '--cgroup', '/sys/fs/cgroup/x/reclaim-a', '--uid', '10003', '--gid', '10003'])), {
    checkout: '/w/c', goWithinMs: RECLAIM_GO_BOUND_MS, containment: { cgroup: '/sys/fs/cgroup/x/reclaim-a', account: ACCOUNT },
  });
  for (const argv of [[], ['--checkout'], ['--checkout', 'relative'], ['--checkout', '/c', '--checkout', '/d'], ['--other', '/c'],
    ['--checkout', '/c', '--cgroup', '/g'], ['--checkout', '/c', '--cgroup', 'g', '--uid', '1', '--gid', '1'],
    ['--checkout', '/c', '--cgroup', '/g', '--uid', '0', '--gid', '1'], ['--checkout', '/c', '--cgroup', '/g', '--uid', 'x', '--gid', '1'],
    ['--checkout', '/c', '--go-within-ms', '0'], ['--checkout', '/c', '--go-within-ms', '1.5'], ['--checkout', '/c', '--go-within-ms', 'x']]) {
    assert.equal(failed(parseReclaimArguments(argv)).code, 'invalid', argv.join(' '));
  }
});

test('the program waits for go and changes nothing without it', async () => {
  const goes = new PassThrough();
  const going = receivedGo(goes, RECLAIM_GO_BOUND_MS);
  goes.end(RECLAIM_GO);
  assert.equal(await going, true);
  const ends = new PassThrough();
  const ending = receivedGo(ends, RECLAIM_GO_BOUND_MS);
  ends.end('g');
  assert.equal(await ending, false);
  await withDirectory(async (checkout) => {
    await writeFile(join(checkout, 'file'), 'text');
    await chmod(join(checkout, 'file'), 0o600);
    const abandoned = new PassThrough();
    abandoned.end();
    assert.equal(await runReclaimProgram(['--checkout', checkout], abandoned), RECLAIM_EXIT.abandoned);
    assert.equal(await modeOf(join(checkout, 'file')), 0o600);
    assert.equal(await runReclaimProgram(['--checkout'], abandoned), RECLAIM_EXIT.usage);
    const go = new PassThrough();
    go.end(RECLAIM_GO);
    assert.equal(await runReclaimProgram(['--checkout', checkout], go), RECLAIM_EXIT.done);
    assert.equal(await modeOf(join(checkout, 'file')), 0o660);
    const missing = new PassThrough();
    missing.end(RECLAIM_GO);
    assert.equal(await runReclaimProgram(['--checkout', join(checkout, 'missing')], missing), RECLAIM_EXIT.failed);
  });
});

test('a program that gets no go within its window exits without a change', () => withDirectory(async (checkout) => {
  await writeFile(join(checkout, 'file'), 'text');
  await chmod(join(checkout, 'file'), 0o600);
  const started = Date.now();
  assert.equal(await runReclaimProgram(['--checkout', checkout, '--go-within-ms', '100'], new PassThrough()), RECLAIM_EXIT.abandoned);
  assert.ok(Date.now() - started >= 90, 'the program waits for its window');
  const child = spawn(process.execPath, [RECLAIM_PROGRAM_MAIN, '--checkout', checkout, '--go-within-ms', '200'], { stdio: ['pipe', 'ignore', 'ignore'] });
  assert.equal(await new Promise((done) => child.once('close', done)), RECLAIM_EXIT.abandoned, 'an open input keeps it no longer');
  child.stdin.destroy();
  assert.equal(await modeOf(join(checkout, 'file')), 0o600);
}));

test('a program whose worker dies before go exits without a change', () => withDirectory(async (checkout) => {
  await writeFile(join(checkout, 'file'), 'text');
  await chmod(join(checkout, 'file'), 0o600);
  const host = new ProcessGroupReclaimHost();
  const containment = await launchedByDeadWorker([checkout]);
  let polls = 0;
  while (await host.populated(containment)) {
    assert.ok((polls += 1) < 100, 'the program outlives its worker');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await modeOf(join(checkout, 'file')), 0o600);
}));

test('a mode is shared with the group and executable only if the owner could execute', () => {
  assert.deepEqual([0o644, 0o4755, 0o100, 0o010, 0o000].map(sharedMode), [0o660, 0o770, 0o770, 0o660, 0o660]);
});

test('normalization sets exact modes, copies hard-linked files, and never follows or opens other entries', () => withDirectory(async (directory) => {
  const checkout = join(directory, 'checkout');
  const outside = join(directory, 'outside');
  await mkdir(join(checkout, 'closed', 'deeper'), { recursive: true });
  await mkdir(outside);
  await writeFile(join(outside, 'target'), 'outside\n');
  await chmod(join(outside, 'target'), 0o600);
  await writeFile(join(checkout, 'closed', 'deeper', 'linked'), 'linked\n');
  await link(join(checkout, 'closed', 'deeper', 'linked'), join(outside, 'link'));
  await chmod(join(checkout, 'closed', 'deeper', 'linked'), 0o000);
  await symlink(join(outside, 'target'), join(checkout, 'to-outside'));
  await writeFile(join(checkout, 'setuid'), '#!/bin/sh\n');
  await chmod(join(checkout, 'setuid'), 0o4755);
  const fifo = join(checkout, 'pipe');
  await new Promise<void>((done, fail) => spawn('mkfifo', [fifo]).once('close', (code) => (code === 0 ? done() : fail(new Error('mkfifo')))));
  await link(fifo, join(outside, 'pipe'));
  await chmod(join(checkout, 'closed', 'deeper'), 0o1700);
  await chmod(join(checkout, 'closed'), 0o000);
  await normalizeCheckout(checkout, process.getuid!());
  assert.deepEqual(await Promise.all(['closed', 'closed/deeper'].map((path) => modeOf(join(checkout, path)))), [0o2770, 0o2770]);
  const linked = join(checkout, 'closed', 'deeper', 'linked');
  assert.deepEqual([await modeOf(linked), (await stat(linked)).nlink], [0o660, 1]);
  await writeFile(join(outside, 'link'), 'written outside\n');
  assert.equal(await readFile(linked, 'utf8'), 'linked\n');
  assert.equal(await modeOf(join(checkout, 'setuid')), 0o770);
  assert.equal(await modeOf(join(outside, 'target')), 0o600, 'the link target is untouched');
  assert.equal((await lstat(fifo)).isFIFO(), true);
  assert.equal(await modeOf(fifo), 0o660);
  assert.deepEqual((await readdir(join(checkout, 'closed', 'deeper'))).sort(), ['linked']);
}));

test('normalization leaves the modes of entries another account owns', () => withDirectory(async (checkout) => {
  await writeFile(join(checkout, 'file'), 'text');
  await chmod(join(checkout, 'file'), 0o640);
  await normalizeCheckout(checkout, process.getuid!() + 1);
  assert.equal(await modeOf(join(checkout, 'file')), 0o640);
}));

test('the fixed program runs as a process of its own and reports through its exit code', () => withDirectory(async (checkout) => {
  await writeFile(join(checkout, 'file'), 'text');
  await chmod(join(checkout, 'file'), 0o600);
  const child = spawn(process.execPath, [RECLAIM_PROGRAM_MAIN, '--checkout', checkout], { stdio: ['pipe', 'ignore', 'ignore'] });
  child.stdin.end(RECLAIM_GO);
  assert.equal(await new Promise((done) => child.once('close', done)), RECLAIM_EXIT.done);
  assert.equal(await modeOf(join(checkout, 'file')), 0o660);
}));

test('a Linux host reads a containment from its cgroup and frees it', () => withDirectory(async (parent) => {
  const host = new LinuxReclaimHost({ containmentParent: parent, executionAccount: ACCOUNT, program: { executable: '/bin/sh', args: ['-c', 'read go; exit 0', 'reclaim'] } });
  const containment = { kind: 'cgroup', name: 'reclaim-a' } as const;
  assert.equal(await host.populated(containment), false);
  const launched = value(await host.launch('/nonexistent', 'reclaim-a'));
  assert.deepEqual(launched.containment, containment);
  assert.equal(await launched.go(), 'succeeded');
  await writeFile(join(parent, 'reclaim-a', 'cgroup.events'), 'populated 1\nfrozen 0\n');
  assert.equal(await host.populated(containment), true);
  await writeFile(join(parent, 'reclaim-a', 'cgroup.events'), 'populated 0\n');
  assert.equal(await host.populated(containment), false);
  await writeFile(join(parent, 'reclaim-a', 'cgroup.events'), 'frozen 0\n');
  await assert.rejects(host.populated(containment), /populated/);
  await rm(join(parent, 'reclaim-a', 'cgroup.events'));
  await host.release(containment);
  await host.release(containment);
  assert.deepEqual(await readdir(parent), []);
  value(await host.launch('/nonexistent', 'reclaim-a').then(async (again) => {
    if (again.ok) again.value.abandon();
    return again;
  }));
  await assert.rejects(host.populated({ kind: 'process-group', id: 42 }), /cgroup/);
  await assert.rejects(new ProcessGroupReclaimHost().populated(containment), /process group/);
}));
