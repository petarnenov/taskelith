import assert from 'node:assert/strict';
import test from 'node:test';
import type { SelfCheckResult, WorkerId } from '@taskelith/execution';
import { parseInstant } from '@taskelith/kernel';
import {
  InMemoryFleetRegistry,
  InMemoryWorkerAdmissions,
  LINUX_CONTAINMENT_SCOPE,
  WORKER_ADMISSION_CONFORMANCE,
  decideWorkerAdmission,
  fleetToken,
  fleetWorker,
  notApplicableReason,
  stubAdmissionCheck,
} from '@taskelith/fleet';
import { value } from '@taskelith/testing';

const now = () => value(parseInstant('2026-10-28T09:00:00.000Z'));

for (const conformance of WORKER_ADMISSION_CONFORMANCE) {
  test(`in-memory worker admissions: ${conformance.name}`, async () => {
    const registry = new InMemoryFleetRegistry(now);
    assert.deepEqual(await conformance.check({ registry, admissions: new InMemoryWorkerAdmissions({ registry, now }) }), []);
  });
}

const passed = (checkId = 'linux-containment'): SelfCheckResult => ({ checkId, outcome: 'passed', details: [] });
const failed = (checkId = 'linux-containment'): SelfCheckResult => ({ checkId, outcome: 'failed', details: ['cgroup v2 is not mounted'] });
const notApplicable = (detail: string, checkId = 'linux-containment'): SelfCheckResult => (
  { checkId, outcome: 'not-applicable', details: [detail] });

test('only the platform and the launch command make the containment check not applicable', () => {
  assert.equal(notApplicableReason(LINUX_CONTAINMENT_SCOPE, { platform: 'darwin', launchCommand: true }), 'platform-not-covered');
  assert.equal(notApplicableReason(LINUX_CONTAINMENT_SCOPE, { platform: 'darwin', launchCommand: false }), 'platform-not-covered');
  assert.equal(notApplicableReason(LINUX_CONTAINMENT_SCOPE, { platform: 'linux', launchCommand: false }), 'no-launch-command');
  assert.equal(notApplicableReason(LINUX_CONTAINMENT_SCOPE, { platform: 'linux', launchCommand: true }), undefined);
});

test('a report without a failed result admits the worker, and one with a failed result does not', () => {
  assert.deepEqual(decideWorkerAdmission([passed()], 'linux'), { state: 'admitted', results: [passed()] });
  assert.deepEqual(decideWorkerAdmission([failed()], 'linux'), { state: 'self-check-failed', results: [failed()] });
  assert.equal(decideWorkerAdmission([passed('a-check'), failed()], 'linux').state, 'self-check-failed');
});

test('a macOS worker and a Linux worker without a launch command are admitted with a not-applicable result', () => {
  assert.deepEqual(decideWorkerAdmission([notApplicable('platform-not-covered')], 'darwin'),
    { state: 'admitted', results: [notApplicable('platform-not-covered')] });
  assert.deepEqual(decideWorkerAdmission([notApplicable('no-launch-command')], 'linux'),
    { state: 'admitted', results: [notApplicable('no-launch-command')] });
});

test('a not-applicable claim without a recognised reason counts as failed', () => {
  const refuted = [
    [notApplicable('platform-not-covered'), 'linux'],
    [notApplicable('no-launch-command'), 'darwin'],
    [notApplicable('the operator said so'), 'linux'],
    [{ checkId: 'linux-containment', outcome: 'not-applicable', details: ['no-launch-command', 'platform-not-covered'] }, 'linux'],
    [{ checkId: 'linux-containment', outcome: 'not-applicable', details: [] }, 'linux'],
  ] as const;
  for (const [result, platform] of refuted) {
    const decision = decideWorkerAdmission([result], platform);
    assert.equal(decision.state, 'self-check-failed');
    assert.equal(decision.results[0]?.outcome, 'failed');
    assert.match(decision.results[0]!.details[0]!, /^not-applicable without a recognised reason/);
  }
});

test('a check the control plane does not know keeps a recognised not-applicable reason', () => {
  const report = [passed(), notApplicable('no-launch-command', 'another-check')];
  assert.deepEqual(decideWorkerAdmission(report, 'linux'), { state: 'admitted', results: [notApplicable('no-launch-command', 'another-check'), passed()] });
});

test('a report without the containment check fails it, so it cannot be skipped', () => {
  const decision = decideWorkerAdmission([passed('another-check')], 'darwin');
  assert.equal(decision.state, 'self-check-failed');
  assert.deepEqual(decision.results, [passed('another-check'), { checkId: 'linux-containment', outcome: 'failed', details: ['the check was not reported'] }]);
});

test('the in-memory store mirrors the worker admission into placement', async () => {
  const registry = new InMemoryFleetRegistry(now);
  value(await registry.addToken(fleetToken('t1')));
  value(await registry.enroll(fleetToken('t1').hash, fleetWorker('w1', 'j1')));
  const mirrored: [WorkerId, boolean][] = [];
  const admissions = new InMemoryWorkerAdmissions({ registry, now, onAdmission: (workerId, admitted) => mirrored.push([workerId, admitted]) });
  const workerId = fleetWorker('w1', 'j1').workerId;
  value(await admissions.record(workerId, decideWorkerAdmission([passed()], 'linux'), 1 as never, now()));
  value(await admissions.awaitSelfCheck(workerId));
  assert.deepEqual(mirrored, [[workerId, true], [workerId, false]]);
});

test('the stub check has the containment check identity and scope', async () => {
  const stub = stubAdmissionCheck({ outcome: 'failed', problems: ['broken'] });
  assert.deepEqual([stub.checkId, stub.scope, await stub.run()], ['linux-containment', LINUX_CONTAINMENT_SCOPE, { outcome: 'failed', problems: ['broken'] }]);
  assert.deepEqual(await stubAdmissionCheck().run(), { outcome: 'passed' });
});
