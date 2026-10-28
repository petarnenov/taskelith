import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { DAEMON_MEMORY_MEBIBYTES, DEFAULT_SLOTS, currentHost, readWorkerSettings, type HostFacts } from '@taskelith/worker';
import { failed, value } from '@taskelith/testing';

const directory = mkdtempSync(join(tmpdir(), 'taskelith-worker-settings-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const FACTS: HostFacts = { platform: 'linux', architecture: 'x64', hostname: 'build-1', cpuMillicores: 8000, memoryMebibytes: 16_384 };
const BASE = { TASKELITH_DATA_DIR: directory, TASKELITH_CONTROL_PLANE_URL: 'https://control-plane:8443/', TASKELITH_NATS_URL: 'nats://broker:4222' };

const SHA256 = 'ab'.repeat(32);

test('the settings default the capacity to the host less the daemon, without a token or fingerprint', () => {
  const settings = value(readWorkerSettings(BASE, FACTS));
  assert.equal(settings.dataRoot, directory);
  assert.equal(settings.controlPlaneUrl.href, 'https://control-plane:8443/');
  assert.equal(settings.natsUrl.href, 'nats://broker:4222');
  assert.deepEqual(settings.host, { platform: 'linux', architecture: 'x64', hostname: 'build-1' });
  assert.deepEqual(settings.capacity, { slots: DEFAULT_SLOTS, cpuMillicores: 8000, memoryMebibytes: 16_384 - DAEMON_MEMORY_MEBIBYTES, controls: [] });
  assert.equal('enrollmentToken' in settings, false);
  assert.equal('installationCaSha256' in settings, false);
  assert.equal(value(readWorkerSettings(BASE, { ...FACTS, memoryMebibytes: 100 })).capacity.memoryMebibytes, 1);
});

test('the token, the fingerprint, and the capacity come from the environment; a broker CA is not read', () => {
  writeFileSync(join(directory, 'ca.pem'), 'PEM');
  const settings = value(readWorkerSettings({
    ...BASE, TASKELITH_ENROLLMENT_TOKEN: 'tken_x', TASKELITH_INSTALLATION_CA_SHA256: SHA256, TASKELITH_NATS_CA: join(directory, 'ca.pem'),
    TASKELITH_WORKER_SLOTS: '4', TASKELITH_WORKER_CPU_MILLICORES: '2000', TASKELITH_WORKER_MEMORY_MEBIBYTES: '4096',
  }, FACTS));
  assert.equal(settings.enrollmentToken, 'tken_x');
  assert.equal(settings.installationCaSha256, SHA256);
  assert.equal('natsTls' in settings, false);
  assert.deepEqual(settings.capacity, { slots: 4, cpuMillicores: 2000, memoryMebibytes: 4096, controls: [] });
  assert.equal('enrollmentToken' in value(readWorkerSettings({ ...BASE, TASKELITH_ENROLLMENT_TOKEN: '' }, FACTS)), false);
});

test('the fingerprint is taken as printed or with the colons and capitals of openssl', () => {
  const openssl = SHA256.toUpperCase().match(/../g)!.join(':');
  for (const printed of [SHA256, SHA256.toUpperCase(), openssl]) {
    assert.equal(value(readWorkerSettings({ ...BASE, TASKELITH_INSTALLATION_CA_SHA256: printed }, FACTS)).installationCaSha256, SHA256, printed);
  }
  assert.equal('installationCaSha256' in value(readWorkerSettings({ ...BASE, TASKELITH_INSTALLATION_CA_SHA256: '' }, FACTS)), false);
});

test('a failure names the variable and never its value', () => {
  const cases: Array<[Record<string, string | undefined>, string]> = [
    [{ TASKELITH_CONTROL_PLANE_URL: undefined }, 'TASKELITH_CONTROL_PLANE_URL'],
    [{ TASKELITH_CONTROL_PLANE_URL: 'ftp://host/' }, 'TASKELITH_CONTROL_PLANE_URL'],
    [{ TASKELITH_NATS_URL: 'not a url' }, 'TASKELITH_NATS_URL'],
    [{ TASKELITH_NATS_URL: 'http://broker' }, 'TASKELITH_NATS_URL'],
    [{ TASKELITH_CONTROL_PLANE_URL: 'http://control-plane:8443/' }, 'TASKELITH_CONTROL_PLANE_URL'],
    [{ TASKELITH_INSTALLATION_CA_SHA256: 'ab'.repeat(31) }, 'TASKELITH_INSTALLATION_CA_SHA256'],
    [{ TASKELITH_INSTALLATION_CA_SHA256: `${'ab:'.repeat(31)}a` }, 'TASKELITH_INSTALLATION_CA_SHA256'],
    [{ TASKELITH_INSTALLATION_CA_SHA256: 'g'.repeat(64) }, 'TASKELITH_INSTALLATION_CA_SHA256'],
    [{ TASKELITH_WORKER_SLOTS: '0' }, 'TASKELITH_WORKER_SLOTS'],
    [{ TASKELITH_WORKER_CPU_MILLICORES: '1.5' }, 'TASKELITH_WORKER_CPU_MILLICORES'],
    [{ TASKELITH_WORKER_MEMORY_MEBIBYTES: '99999999999' }, 'TASKELITH_WORKER_MEMORY_MEBIBYTES'],
  ];
  for (const [change, variable] of cases) {
    const failure = failed(readWorkerSettings({ ...BASE, ...change }, FACTS));
    assert.equal(failure.details.variable, variable);
    for (const text of Object.values(change)) if (text !== undefined) assert.equal(failure.message.includes(text), false, failure.message);
  }
  assert.equal(failed(readWorkerSettings({ ...BASE, TASKELITH_DATA_DIR: 'relative' }, FACTS)).code, 'invalid');
});

test('only linux or darwin on x64 or arm64 hosts a worker', () => {
  assert.equal(failed(readWorkerSettings(BASE, { ...FACTS, platform: 'win32' })).code, 'precondition-failed');
  assert.equal(failed(readWorkerSettings(BASE, { ...FACTS, architecture: 'ia32' })).code, 'precondition-failed');
  const host = currentHost();
  assert.ok(host.cpuMillicores >= 1000 && host.memoryMebibytes >= 1 && host.hostname !== '');
});

const LINUX_LAUNCH = {
  TASKELITH_WORKER_COMMAND: '["/usr/bin/scripted","--exit","0"]', TASKELITH_CONTAINMENT_PARENT: '/sys/fs/cgroup/taskelith',
  TASKELITH_EXECUTION_UID: '2000', TASKELITH_EXECUTION_GID: '2001',
};

test('without a launch command the worker has no launch settings', () => {
  assert.equal('launch' in value(readWorkerSettings(BASE, FACTS)), false);
  assert.equal('launch' in value(readWorkerSettings({ ...BASE, TASKELITH_WORKER_COMMAND: '' }, FACTS)), false);
});

test('the launch command, and on Linux the containment parent and execution account, come from the environment', () => {
  const linux = value(readWorkerSettings({ ...BASE, ...LINUX_LAUNCH }, FACTS));
  assert.deepEqual(linux.launch, {
    command: { executable: '/usr/bin/scripted', arguments: ['--exit', '0'] }, executionAccount: { uid: 2000, gid: 2001 },
  });
  assert.equal(linux.containmentParent, '/sys/fs/cgroup/taskelith');
  const darwin = value(readWorkerSettings({ ...BASE, TASKELITH_WORKER_COMMAND: '["/bin/true"]' }, { ...FACTS, platform: 'darwin' }));
  assert.deepEqual(darwin.launch, { command: { executable: '/bin/true', arguments: [] } });
});

test('the containment parent is read on Linux without a launch command, and only on Linux', () => {
  const parent = { TASKELITH_CONTAINMENT_PARENT: '/sys/fs/cgroup/taskelith' };
  const linux = value(readWorkerSettings({ ...BASE, ...parent }, FACTS));
  assert.deepEqual([linux.containmentParent, 'launch' in linux], ['/sys/fs/cgroup/taskelith', false]);
  assert.equal('containmentParent' in value(readWorkerSettings({ ...BASE, ...parent }, { ...FACTS, platform: 'darwin' })), false);
  assert.equal('containmentParent' in value(readWorkerSettings({ ...BASE, TASKELITH_CONTAINMENT_PARENT: '' }, FACTS)), false);
  const relative = failed(readWorkerSettings({ ...BASE, TASKELITH_CONTAINMENT_PARENT: 'cgroup' }, FACTS));
  assert.equal(relative.details.variable, 'TASKELITH_CONTAINMENT_PARENT');
});

test('an invalid launch setting fails startup and names only its variable', () => {
  const cases: Array<[Record<string, string | undefined>, string]> = [
    [{ TASKELITH_WORKER_COMMAND: 'secret-not-json' }, 'TASKELITH_WORKER_COMMAND'],
    [{ TASKELITH_WORKER_COMMAND: '[]' }, 'TASKELITH_WORKER_COMMAND'],
    [{ TASKELITH_WORKER_COMMAND: '["/bin/x", 3]' }, 'TASKELITH_WORKER_COMMAND'],
    [{ TASKELITH_WORKER_COMMAND: '{"executable":"/bin/x"}' }, 'TASKELITH_WORKER_COMMAND'],
    [{ TASKELITH_CONTAINMENT_PARENT: undefined }, 'TASKELITH_CONTAINMENT_PARENT'],
    [{ TASKELITH_CONTAINMENT_PARENT: 'relative/cgroup' }, 'TASKELITH_CONTAINMENT_PARENT'],
    [{ TASKELITH_EXECUTION_UID: '0' }, 'TASKELITH_EXECUTION_UID'],
    [{ TASKELITH_EXECUTION_GID: 'staff' }, 'TASKELITH_EXECUTION_GID'],
  ];
  for (const [change, variable] of cases) {
    const failure = failed(readWorkerSettings({ ...BASE, ...LINUX_LAUNCH, ...change }, FACTS));
    assert.equal(failure.details.variable, variable);
    for (const text of Object.values(change)) if (text !== undefined) assert.equal(failure.message.includes(text), false, failure.message);
  }
});
