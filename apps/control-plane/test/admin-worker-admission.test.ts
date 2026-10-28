import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_USAGE, printableWorkerAdmission } from '@taskelith/control-plane';
import type { WorkerId } from '@taskelith/execution';
import type { WorkerAdmissionSnapshot } from '@taskelith/fleet';
import type { Instant } from '@taskelith/kernel';
import { NodeSecrets, REDACTED } from '@taskelith/secrets';

const secret = new NodeSecrets().issue('worker').secret;

const snapshot: WorkerAdmissionSnapshot = {
  asOf: '2026-10-28T10:00:05.000Z' as Instant,
  workers: [{
    workerId: 'worker-1' as WorkerId,
    host: { platform: 'linux', architecture: 'x64', hostname: 'worker' },
    enrolledAt: '2026-10-28T09:59:00.000Z' as Instant,
    admission: 'self-check-failed',
    reportedAt: '2026-10-28T10:00:01.000Z' as Instant,
    results: [{ checkId: 'linux-containment', outcome: 'failed', details: [`probe saw ${secret}`, 'no cgroup.kill'] }],
  }],
};

test('the printed workers view redacts every detail and keeps the rest', () => {
  const printed = printableWorkerAdmission(snapshot);
  assert.ok(!JSON.stringify(printed).includes(secret));
  assert.deepEqual(printed, {
    ...snapshot,
    workers: [{
      ...snapshot.workers[0]!,
      results: [{ checkId: 'linux-containment', outcome: 'failed', details: [`probe saw ${REDACTED}`, 'no cgroup.kill'] }],
    }],
  });
});

test('the usage names the worker admission command among the operator commands', () => {
  assert.match(ADMIN_USAGE, /^ {2}worker-admission$/m);
  assert.match(ADMIN_USAGE, /The last five read the operator credential/);
});
