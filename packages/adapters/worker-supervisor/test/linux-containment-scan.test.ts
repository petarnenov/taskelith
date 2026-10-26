import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { LinuxContainmentScan, LinuxProcessInspector } from '@taskelith/worker-supervisor';

function statLine(pid: number, group: number, start: number): string {
  return `${pid} (node) S 1 ${group} ${group} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0 0 0`;
}

// A /proc with processes 42 and 43, and an empty cgroup parent.
function fixture(t: TestContext): { readonly scan: LinuxContainmentScan; readonly parent: string } {
  const base = mkdtempSync(join(tmpdir(), 'taskelith-scan-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const proc = join(base, 'proc');
  mkdirSync(join(proc, 'sys/kernel/random'), { recursive: true });
  writeFileSync(join(proc, 'sys/kernel/random/boot_id'), 'boot-7\n');
  for (const [pid, group, start] of [[42, 42, 900], [43, 42, 901]] as const) {
    mkdirSync(join(proc, String(pid)));
    writeFileSync(join(proc, String(pid), 'stat'), statLine(pid, group, start));
  }
  const parent = join(base, 'executions');
  mkdirSync(parent);
  return { scan: new LinuxContainmentScan(parent, new LinuxProcessInspector(proc)), parent };
}

function containment(parent: string, name: string, populated: 0 | 1, procs?: string): void {
  mkdirSync(join(parent, name));
  writeFileSync(join(parent, name, 'cgroup.events'), `populated ${populated}\nfrozen 0\n`);
  if (procs !== undefined) writeFileSync(join(parent, name, 'cgroup.procs'), procs);
}

test('only populated containments are listed, with the members still running', (t) => {
  const { scan, parent } = fixture(t);
  containment(parent, 'execution-1', 1, '42\n43\n99\n');
  containment(parent, 'execution-2', 0, '');
  writeFileSync(join(parent, 'cgroup.procs'), '');
  assert.deepEqual(scan.populated(), {
    ok: true,
    value: [{
      name: 'execution-1',
      path: join(parent, 'execution-1'),
      processes: [
        { identity: { bootId: 'boot-7', pid: 42, startTime: 900 }, parentPid: 1, processGroupId: 42 },
        { identity: { bootId: 'boot-7', pid: 43, startTime: 901 }, parentPid: 1, processGroupId: 42 },
      ],
    }],
  });
});

test('a containment removed since the listing, or a missing parent, holds nothing', (t) => {
  const { scan, parent } = fixture(t);
  mkdirSync(join(parent, 'execution-gone'));
  containment(parent, 'execution-emptied', 1);
  assert.deepEqual(scan.populated(), { ok: true, value: [{ name: 'execution-emptied', path: join(parent, 'execution-emptied'), processes: [] }] });
  rmSync(parent, { recursive: true });
  assert.deepEqual(scan.populated(), { ok: true, value: [] });
});

test('one malformed containment never hides the others', (t) => {
  const { scan, parent } = fixture(t);
  containment(parent, 'execution-a', 1, '42\n');
  writeFileSync(join(parent, 'execution-a', 'cgroup.events'), 'frozen 0\n');
  for (const [name, procs] of [['execution-b', '0x2a\n'], ['execution-c', ' 42\n'], ['execution-d', '1e3\n'], ['execution-e', '42\n']]) {
    containment(parent, name!, 1, procs);
  }
  const found = scan.populated();
  assert.ok(found.ok);
  const byName = [...found.value].sort((left, right) => left.name.localeCompare(right.name));
  assert.deepEqual(byName.map(({ name, processes }) => [name, processes.map(({ identity }) => identity.pid)]), [
    ['execution-b', []], ['execution-c', []], ['execution-d', []], ['execution-e', [42]],
  ]);
});

test('an unreadable parent fails the scan', (t) => {
  const { parent } = fixture(t);
  const file = join(parent, 'not-a-directory');
  writeFileSync(file, '');
  assert.equal(new LinuxContainmentScan(file, new LinuxProcessInspector(parent)).populated().ok, false);
});
