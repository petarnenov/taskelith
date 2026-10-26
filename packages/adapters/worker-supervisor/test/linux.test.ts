import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Result } from '@taskelith/kernel';
import { checkLinuxContainment, LinuxContainment, linuxPlatform, parseCgroup, parseProcStat, parseUptime } from '@taskelith/worker-supervisor';

// A stat line whose command holds spaces and a parenthesis.
const STAT = '4242 (my (odd) cmd) S 7 4242 4242 0 -1 4194560 100 0 0 0 1 2 0 0 20 0 1 0 912345 1000 50 18446744073709551615';

function statLine(pid: number, parent: number, group: number, start: number): string {
  return `${pid} (node) S ${parent} ${group} ${group} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0 0 0`;
}

function fakeProc(): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-proc-'));
  mkdirSync(join(root, 'sys/kernel/random'), { recursive: true });
  writeFileSync(join(root, 'sys/kernel/random/boot_id'), 'boot-7\n');
  writeFileSync(join(root, 'uptime'), '1234.56 900.00\n');
  for (const [pid, parent, group, start] of [[1, 0, 1, 5], [42, 1, 42, 900]] as const) {
    mkdirSync(join(root, String(pid)));
    writeFileSync(join(root, String(pid), 'stat'), statLine(pid, parent, group, start));
  }
  mkdirSync(join(root, 'self/ns'), { recursive: true });
  writeFileSync(join(root, 'self/cgroup'), '0::/worker/service\n');
  symlinkSync('pid:[4026531836]', join(root, 'self/ns/pid'));
  return root;
}

test('a /proc stat line gives the process, parent, group, and start time', () => {
  assert.deepEqual(parseProcStat(STAT), { ok: true, value: { pid: 4242, parentPid: 7, processGroupId: 4242, startTime: 912345 } });
  assert.equal(parseProcStat('4242 (cut').ok, false);
  assert.equal(parseProcStat('x (y) S 1 2').ok, false);
});

test('/proc/uptime gives milliseconds, and the cgroup v2 membership its path', () => {
  assert.deepEqual(parseUptime('1234.56 900.00\n'), { ok: true, value: 1_234_560 });
  assert.equal(parseUptime('soon').ok, false);
  assert.deepEqual(parseCgroup('12:cpu:/x\n0::/worker/service\n'), { ok: true, value: '/worker/service' });
  assert.equal(parseCgroup('12:cpu:/x\n').ok, false);
});

test('the Linux platform reads identities, the deadline clock, and the namespace from /proc', (t) => {
  const proc = fakeProc();
  t.after(() => rmSync(proc, { recursive: true, force: true }));
  const platform = linuxPlatform({ proc, cgroupRoot: '/cg', containmentParent: '/cg/executions' });

  assert.deepEqual(platform.inspector.bootId(), { ok: true, value: 'boot-7' });
  assert.deepEqual(platform.inspector.identity(42), { ok: true, value: { bootId: 'boot-7', pid: 42, startTime: 900 } });
  assert.deepEqual(platform.inspector.identity(43), { ok: true, value: undefined });
  const listing = platform.inspector.listing();
  assert.ok(listing.ok);
  assert.equal(listing.value.length, 2);
  assert.deepEqual(platform.clock.read(), { ok: true, value: { bootId: 'boot-7', milliseconds: 1_234_560 } });
  assert.deepEqual(platform.namespaceIncarnation(), { ok: true, value: 'pid:[4026531836]@boot-7/5' });
  const containment = platform.containment('execution-1');
  assert.ok(containment?.ok);
  assert.equal(containment.value.path, '/cg/executions/execution-1');
});

test('a missing boot identity or uptime fails closed', (t) => {
  const proc = fakeProc();
  t.after(() => rmSync(proc, { recursive: true, force: true }));
  rmSync(join(proc, 'uptime'));
  const platform = linuxPlatform({ proc, containmentParent: '/cg/executions' });
  assert.equal(platform.clock.read().ok, false);
  rmSync(join(proc, 'sys/kernel/random/boot_id'));
  assert.equal(platform.inspector.bootId().ok, false);
  assert.equal(platform.inspector.identity(42).ok, false);
});

test('a containment writes the cgroup v2 controls of its own directory', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-cgroup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'home'));
  const containment = new LinuxContainment(root, 'execution-1', join(root, 'home'));

  assert.ok(containment.create().ok);
  assert.ok(containment.create().ok);
  writeFileSync(join(containment.path, 'cgroup.events'), 'populated 1\nfrozen 0\n');
  assert.deepEqual(containment.populated(), { ok: true, value: true });
  assert.ok(containment.admit(100).ok);
  assert.equal(readFileSync(join(containment.path, 'cgroup.procs'), 'utf8'), '100');
  assert.ok(containment.release(100).ok);
  assert.equal(readFileSync(join(root, 'home', 'cgroup.procs'), 'utf8'), '100');
  assert.ok(containment.kill().ok);
  assert.equal(readFileSync(join(containment.path, 'cgroup.kill'), 'utf8'), '1');
  writeFileSync(join(containment.path, 'cgroup.events'), 'frozen 0\n');
  assert.equal(containment.populated().ok, false);
  assert.equal(containment.remove().ok, false);
  for (const file of ['cgroup.events', 'cgroup.procs', 'cgroup.kill']) rmSync(join(containment.path, file));
  assert.ok(containment.remove().ok);
  assert.equal(new LinuxContainment(join(root, 'absent'), 'x', root).create().ok, false);
  assert.equal(new LinuxContainment(join(root, 'absent'), 'x', root).admit(1).ok, false);
});

function problems(result: Result<void, readonly string[]>): readonly string[] {
  assert.equal(result.ok, false);
  return result.ok ? [] : result.error;
}

test('the Linux self-check fails without cgroup v2, delegation, a kill control, or denied writes', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-selfcheck-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const account = { uid: process.getuid!(), gid: process.getgid!() };
  const options = { cgroupRoot: root, containmentParent: join(root, 'executions'), home: join(root, 'home'), account };

  assert.deepEqual(checkLinuxContainment(options), { ok: false, error: ['cgroup v2 is not mounted'] });
  writeFileSync(join(root, 'cgroup.controllers'), 'cpu memory\n');
  const undelegated = checkLinuxContainment(options);
  assert.equal(undelegated.ok, false);
  assert.match(problems(undelegated)[0]!, /not delegated/);

  mkdirSync(options.containmentParent);
  mkdirSync(options.home);
  mkdirSync(join(options.containmentParent, `self-check-${process.pid}`));
  const writable = checkLinuxContainment(options);
  assert.equal(writable.ok, false);
  assert.deepEqual(problems(writable).slice(0, 4), [
    'a containment has no cgroup.kill',
    `the execution account can write ${join(options.containmentParent, `self-check-${process.pid}`, 'cgroup.procs')}`,
    `the execution account can write ${join(options.containmentParent, 'cgroup.procs')}`,
    `the execution account can write ${join(options.home, 'cgroup.procs')}`,
  ]);
  assert.match(problems(writable).at(-1)!, /cannot be removed/);
});

test('the Linux self-check refuses a home cgroup at or under the containment parent', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-selfcheck-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'cgroup.controllers'), 'cpu memory\n');
  const account = { uid: process.getuid!(), gid: process.getgid!() };
  const parent = join(root, 'executions');
  const check = (home: string) => checkLinuxContainment({ cgroupRoot: root, containmentParent: parent, home, account });

  for (const home of [parent, `${parent}/`, join(parent, 'init'), join(parent, 'a', 'b')]) {
    assert.deepEqual(check(home), { ok: false, error: [`the home cgroup ${home} is at or under the containment parent ${parent}`] });
  }
  assert.equal(existsSync(join(parent, `self-check-${process.pid}`)), false);
});

test('the Linux self-check accepts a home beside the parent and compares whole segments', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-selfcheck-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'cgroup.controllers'), 'cpu memory\n');
  const account = { uid: process.getuid!(), gid: process.getgid!() };
  const parent = join(root, 'executions');
  mkdirSync(parent);
  const layoutProblems = (home: string) => problems(checkLinuxContainment({ cgroupRoot: root, containmentParent: parent, home, account }))
    .filter((problem) => problem.startsWith('the home cgroup'));

  // Each still fails for the writes an unprivileged test cannot deny.
  assert.deepEqual(layoutProblems(join(root, 'init')), []);
  assert.deepEqual(layoutProblems(join(root, 'executions-home')), []);
  assert.deepEqual(layoutProblems(root), []);
});
