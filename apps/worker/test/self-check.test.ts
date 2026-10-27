import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMessageSchema } from '@taskelith/contracts';
import { LINUX_CONTAINMENT_SCOPE, type SelfCheckRun, type StartFacts, type WorkerAdmissionCheck } from '@taskelith/fleet';
import { err, ok } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import type { WorkerSettings } from '@taskelith/worker';
import { checkComposition, hasFailedCheck, linuxContainmentCheck, runSelfCheck, type LinuxContainmentProbe } from '@taskelith/worker';

const LINUX = { platform: 'linux', launchCommand: true } as const;
const SECRET = `tkwk_${'S'.repeat(43)}`;

function check(checkId: string, run: () => Promise<SelfCheckRun>, scope = LINUX_CONTAINMENT_SCOPE): WorkerAdmissionCheck & { runs: number } {
  const counted = { checkId, scope, runs: 0, run: () => { counted.runs += 1; return run(); } };
  return counted;
}

async function reportOf(checks: readonly WorkerAdmissionCheck[], facts: StartFacts) {
  return value(await runSelfCheck(checks, facts));
}

function reportSchema(results: readonly unknown[]): boolean {
  return checkMessageSchema('SelfCheckReportedPayload', { results }).ok;
}

test('checks run in identifier order and give one result each', async () => {
  const results = await reportOf([
    check('z-check', async () => ({ outcome: 'passed' })),
    check('a-check', async () => ({ outcome: 'failed', problems: ['broken'] })),
  ], LINUX);
  assert.deepEqual(results, [
    { checkId: 'a-check', outcome: 'failed', details: ['broken'] },
    { checkId: 'z-check', outcome: 'passed', details: [] },
  ]);
  assert.equal(hasFailedCheck(results), true);
  assert.equal(hasFailedCheck(results.slice(1)), false);
  assert.ok(reportSchema(results));
});

test('a check whose scope excludes this start is not run and is not applicable with its reason', async () => {
  const failing = check('linux-containment', async () => ({ outcome: 'failed', problems: ['broken'] }));
  assert.deepEqual(await reportOf([failing], { platform: 'darwin', launchCommand: true }),
    [{ checkId: 'linux-containment', outcome: 'not-applicable', details: ['platform-not-covered'] }]);
  assert.deepEqual(await reportOf([failing], { platform: 'linux', launchCommand: false }),
    [{ checkId: 'linux-containment', outcome: 'not-applicable', details: ['no-launch-command'] }]);
  assert.equal(failing.runs, 0);
});

test('a check that applies cannot report itself not applicable', async () => {
  const evasive = check('linux-containment', async () => ({ outcome: 'not-applicable' }) as unknown as SelfCheckRun);
  const [result] = await reportOf([evasive], LINUX);
  assert.deepEqual(result, { checkId: 'linux-containment', outcome: 'failed', details: ['the check failed without naming a problem'] });
});

test('a throwing check fails with its message redacted', async () => {
  const [result] = await reportOf([check('linux-containment', async () => { throw new Error(`token ${SECRET} leaked`); })], LINUX);
  assert.equal(result?.outcome, 'failed');
  assert.equal(result?.details[0], 'token [redacted] leaked');
  const [thrownValue] = await reportOf([check('linux-containment', async () => { throw 'plain'; })], LINUX);
  assert.deepEqual(thrownValue?.details, ['plain']);
});

test('details are bounded and have no control characters', async () => {
  const problems = ['line one\nline two', 'x'.repeat(2000), '\u0007', ...Array.from({ length: 10 }, (_, index) => `problem ${index}`)];
  const [result] = await reportOf([check('linux-containment', async () => ({ outcome: 'failed', problems }))], LINUX);
  assert.equal(result?.details.length, 8);
  assert.equal(result?.details[0], 'line one line two');
  assert.equal(result?.details[1]?.length, 1024);
  assert.equal(result?.details[2], 'the check failed without naming a problem');
  assert.ok(reportSchema([result]));
  const [empty] = await reportOf([check('linux-containment', async () => ({ outcome: 'failed', problems: [] }))], LINUX);
  assert.deepEqual(empty?.details, ['the check failed without naming a problem']);
});

test('eight checks are all reported, and a ninth is refused before any check runs', async () => {
  const checks = Array.from({ length: 9 }, (_, index) => check(`check-${index}`, async () => ({ outcome: index === 8 ? 'failed' : 'passed', problems: ['broken'] }) as SelfCheckRun));
  assert.equal((await reportOf(checks.slice(0, 8), LINUX)).length, 8);
  const refused = await runSelfCheck(checks, LINUX);
  assert.deepEqual([failed(refused).code, failed(refused).message], ['invalid', 'at most 8 admission checks can be composed, not 9']);
  assert.equal(checks[8]!.runs, 0);
});

test('a check composed twice or with a malformed id is refused', () => {
  const passing = async (): Promise<SelfCheckRun> => ({ outcome: 'passed' });
  assert.equal(failed(checkComposition([check('a-check', passing), check('a-check', passing)])).message, 'admission check a-check is composed more than once');
  assert.equal(failed(checkComposition([check('A check', passing)])).message, 'admission check id "A check" is malformed');
  assert.equal(checkComposition([check('a-check', passing)]).ok, true);
});

const ACCOUNT = { uid: 10003, gid: 10003 };
const SETTINGS = {
  host: { platform: 'linux', architecture: 'x64', hostname: 'h' }, containmentParent: '/sys/fs/cgroup/executions',
  launch: { command: ['/bin/true'], executionAccount: ACCOUNT },
} as unknown as WorkerSettings;

function probe(overrides: Partial<LinuxContainmentProbe> = {}): LinuxContainmentProbe & { calls: unknown[] } {
  const calls: unknown[] = [];
  return { cgroupRoot: '/cg', readSelfCgroup: () => '0::/init\n', check: (options) => { calls.push(options); return ok(undefined); }, ...overrides, calls };
}

test('the containment check passes the home, parent, and account to the self-check', async () => {
  const host = probe();
  const containment = linuxContainmentCheck(SETTINGS, host);
  assert.equal(containment.checkId, 'linux-containment');
  assert.deepEqual(await containment.run(), { outcome: 'passed' });
  assert.deepEqual(host.calls, [{ cgroupRoot: '/cg', containmentParent: '/sys/fs/cgroup/executions', home: '/cg/init', account: ACCOUNT }]);
});

test('the containment check fails with the self-check problems', async () => {
  const host = probe({ check: () => err(['cgroup v2 is not mounted', 'a containment has no cgroup.kill']) });
  assert.deepEqual(await linuxContainmentCheck(SETTINGS, host).run(),
    { outcome: 'failed', problems: ['cgroup v2 is not mounted', 'a containment has no cgroup.kill'] });
});

test('the containment check fails without a home cgroup or an execution account', async () => {
  const noHome = await linuxContainmentCheck(SETTINGS, probe({ readSelfCgroup: () => '1:cpu:/x\n' })).run();
  assert.equal(noHome.outcome, 'failed');
  assert.match(noHome.outcome === 'failed' ? noHome.problems[0]! : '', /home cgroup cannot be read/);
  const withoutAccount = { ...SETTINGS, launch: { command: ['/bin/true'] } } as unknown as WorkerSettings;
  assert.deepEqual(await linuxContainmentCheck(withoutAccount, probe()).run(),
    { outcome: 'failed', problems: ['a launching Linux worker needs a containment parent and an execution account'] });
});

test('an unreadable cgroup membership fails the check through the runner', async () => {
  const unreadable = linuxContainmentCheck(SETTINGS, probe({ readSelfCgroup: () => { throw new Error('EACCES: /proc/self/cgroup'); } }));
  assert.deepEqual(await reportOf([unreadable], LINUX), [{ checkId: 'linux-containment', outcome: 'failed', details: ['EACCES: /proc/self/cgroup'] }]);
});
