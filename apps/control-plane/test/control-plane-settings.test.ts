import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  admissionIdOf,
  controlPlaneMain,
  DEFAULT_API_HOST,
  DEFAULT_API_PORT,
  DEFAULT_BROWSER_HOST,
  DEFAULT_BROWSER_PORT,
  LOCAL_SERVER_HOSTS,
  MAX_SERVER_HOSTS,
  readBrokerTls,
  readControlPlaneSettings,
  readServerHosts,
  serveUntilStopped,
  WorkflowRegistry,
} from '@taskelith/control-plane';
import { TRANSPORT_LIMITS } from '@taskelith/nats';
import { parseWorkflowDefinition, parseWorkflowRunBinding } from '@taskelith/sdlc';
import { failed, value } from '@taskelith/testing';

const directory = mkdtempSync(join(tmpdir(), 'taskelith-settings-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const BASE = { TASKELITH_POSTGRES_URL: 'postgres://u:p@127.0.0.1/taskelith', TASKELITH_NATS_URL: 'nats://127.0.0.1:4222', TASKELITH_DATA_DIR: directory };
const DEFINITION = {
  id: 'wf', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
};

test('the API binds loopback on the default port unless configured', () => {
  const settings = value(readControlPlaneSettings(BASE, 'linux', 501));
  assert.deepEqual([settings.api, settings.workflows, settings.dataRoot], [{ host: DEFAULT_API_HOST, port: DEFAULT_API_PORT }, [], directory]);
  const configured = value(readControlPlaneSettings({ ...BASE, TASKELITH_API_HOST: '0.0.0.0', TASKELITH_API_PORT: '0' }, 'linux', 501));
  assert.deepEqual(configured.api, { host: '0.0.0.0', port: 0 });
  assert.equal(failed(readControlPlaneSettings({ ...BASE, TASKELITH_API_PORT: '70000' }, 'linux', 501)).details.variable, 'TASKELITH_API_PORT');
  assert.equal(failed(readControlPlaneSettings({ ...BASE, TASKELITH_NATS_URL: '' }, 'linux', 501)).details.variable, 'TASKELITH_NATS_URL');
  assert.equal(failed(readControlPlaneSettings({ ...BASE, TASKELITH_NATS_CA: join(directory, 'missing.pem') }, 'linux', 501)).details.variable, 'TASKELITH_NATS_CA');
  writeFileSync(join(directory, 'ca.pem'), 'PEM');
  assert.deepEqual(value(readControlPlaneSettings({ ...BASE, TASKELITH_NATS_CA: join(directory, 'ca.pem') }, 'linux', 501)).natsTls, { ca: 'PEM' });
});

test('the browser endpoint binds loopback on 8443 and takes both TLS files or none', () => {
  assert.deepEqual(value(readControlPlaneSettings(BASE, 'linux', 501)).browser, { host: DEFAULT_BROWSER_HOST, port: DEFAULT_BROWSER_PORT });
  assert.deepEqual([DEFAULT_BROWSER_HOST, DEFAULT_BROWSER_PORT], ['127.0.0.1', 8443]);
  writeFileSync(join(directory, 'browser-cert.pem'), 'CERT');
  writeFileSync(join(directory, 'browser-key.pem'), 'KEY');
  const files = { TASKELITH_BROWSER_TLS_CERT: join(directory, 'browser-cert.pem'), TASKELITH_BROWSER_TLS_KEY: join(directory, 'browser-key.pem') };
  const configured = value(readControlPlaneSettings({ ...BASE, ...files, TASKELITH_BROWSER_HOST: '0.0.0.0', TASKELITH_BROWSER_PORT: '9443' }, 'linux', 501));
  assert.deepEqual(configured.browser, { host: '0.0.0.0', port: 9443, tls: { certificate: 'CERT', key: 'KEY' } });
  const variable = (environment: Record<string, string>) => failed(readControlPlaneSettings({ ...BASE, ...environment }, 'linux', 501)).details.variable;
  assert.equal(variable({ TASKELITH_BROWSER_TLS_CERT: files.TASKELITH_BROWSER_TLS_CERT }), 'TASKELITH_BROWSER_TLS_KEY');
  assert.equal(variable({ TASKELITH_BROWSER_TLS_KEY: files.TASKELITH_BROWSER_TLS_KEY }), 'TASKELITH_BROWSER_TLS_CERT');
  assert.equal(variable({ ...files, TASKELITH_BROWSER_TLS_CERT: join(directory, 'missing.pem') }), 'TASKELITH_BROWSER_TLS_CERT');
  assert.equal(variable({ ...files, TASKELITH_BROWSER_TLS_KEY: join(directory, 'missing.pem') }), 'TASKELITH_BROWSER_TLS_KEY');
  assert.equal(variable({ TASKELITH_BROWSER_PORT: 'https' }), 'TASKELITH_BROWSER_PORT');
});

const ownerUid = process.getuid!();

test('without TASKELITH_NATS_CA the broker trusts the installation CA once it exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-broker-trust-'));
  try {
    assert.equal(value(readBrokerTls({}, root, ownerUid)), undefined, 'before init the connection stays plain');
    mkdirSync(join(root, 'control-plane'), { mode: 0o700 });
    writeFileSync(join(root, 'control-plane', 'installation-ca.pem'), 'INSTALLATION CA', { mode: 0o600 });
    assert.deepEqual(value(readBrokerTls({}, root, ownerUid)), { ca: 'INSTALLATION CA' });
    assert.deepEqual(value(readControlPlaneSettings({ ...BASE, TASKELITH_DATA_DIR: root }, 'linux', ownerUid)).natsTls, { ca: 'INSTALLATION CA' });
    writeFileSync(join(directory, 'ca.pem'), 'PEM');
    assert.deepEqual(value(readBrokerTls({ TASKELITH_NATS_CA: join(directory, 'ca.pem') }, root, ownerUid)), { ca: 'PEM' }, 'the setting wins');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A data root whose control-plane namespace holds the installation record.
function initializedRoot(): { root: string; ca: string } {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-broker-trust-'));
  mkdirSync(join(root, 'control-plane'), { mode: 0o700 });
  const record = JSON.stringify({ format: 1, installationId: '0123abcd', recoveryEpoch: 1 });
  writeFileSync(join(root, 'control-plane', 'installation'), record, { mode: 0o600 });
  return { root, ca: join(root, 'control-plane', 'installation-ca.pem') };
}

test('an initialized installation without its CA refuses a plain broker connection', () => {
  const { root, ca } = initializedRoot();
  try {
    const lost = failed(readBrokerTls({}, root, ownerUid));
    assert.deepEqual([lost.code, lost.details.path], ['precondition-failed', ca]);
    assert.equal(failed(readControlPlaneSettings({ ...BASE, TASKELITH_DATA_DIR: root }, 'linux', ownerUid)).details.path, ca);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the installation CA is read only as an owner-only file of the owner', () => {
  const { root, ca } = initializedRoot();
  try {
    writeFileSync(join(directory, 'outside-ca.pem'), 'OUTSIDE CA', { mode: 0o600 });
    symlinkSync(join(directory, 'outside-ca.pem'), ca);
    assert.equal(failed(readBrokerTls({}, root, ownerUid)).details.reason, 'unsafe-path', 'a symbolic link');
    rmSync(ca);
    writeFileSync(ca, 'INSTALLATION CA', { mode: 0o644 });
    assert.equal(failed(readBrokerTls({}, root, ownerUid)).details.reason, 'unsafe-path', 'readable by others');
    chmodSync(ca, 0o600);
    assert.equal(failed(readBrokerTls({}, root, ownerUid + 1)).details.reason, 'unsafe-path', 'another owner');
    assert.deepEqual(value(readBrokerTls({}, root, ownerUid)), { ca: 'INSTALLATION CA' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the certificate hosts are DNS names or IP addresses, localhost by default', () => {
  assert.deepEqual(value(readServerHosts({})), LOCAL_SERVER_HOSTS);
  assert.deepEqual(LOCAL_SERVER_HOSTS.api.map((host) => host.name), ['localhost', '127.0.0.1', '::1']);
  const hosts = value(readServerHosts({ TASKELITH_API_HOSTS: 'Control-Plane, 10.0.0.5,fd00::1,control-plane', TASKELITH_NATS_HOSTS: 'nats' }));
  assert.deepEqual(hosts.api, [{ kind: 'dns', name: 'control-plane' }, { kind: 'ip', name: '10.0.0.5' }, { kind: 'ip', name: 'fd00::1' }]);
  assert.deepEqual(hosts.nats, [{ kind: 'dns', name: 'nats' }]);
  const tooMany = Array.from({ length: MAX_SERVER_HOSTS + 1 }, (_, index) => `host-${index}`).join(',');
  for (const text of ['*.example.com', 'a,,b', '-leading', 'trailing-', 'under_score', `${'a'.repeat(64)}.com`, tooMany]) {
    const failure = failed(readServerHosts({ TASKELITH_NATS_HOSTS: text }));
    assert.deepEqual([failure.code, failure.details.variable], ['invalid', 'TASKELITH_NATS_HOSTS'], text);
  }
  assert.equal(failed(readServerHosts({ TASKELITH_API_HOSTS: 'bad host' })).details.variable, 'TASKELITH_API_HOSTS');
});

test('the streams take the target byte limit unless configured', () => {
  assert.equal(value(readControlPlaneSettings(BASE, 'linux', 501)).transportLimits, TRANSPORT_LIMITS);
  const configured = value(readControlPlaneSettings({ ...BASE, TASKELITH_STREAM_MAX_BYTES: '1073741824' }, 'linux', 501));
  assert.deepEqual(configured.transportLimits, { ...TRANSPORT_LIMITS, streamMaxBytes: 1024 ** 3 });
  for (const text of ['0', '-1', '1.5', 'many', '9007199254740992']) {
    const failure = failed(readControlPlaneSettings({ ...BASE, TASKELITH_STREAM_MAX_BYTES: text }, 'linux', 501));
    assert.equal(failure.details.variable, 'TASKELITH_STREAM_MAX_BYTES', text);
  }
});

test('the known workflows come from a JSON file', () => {
  const file = join(directory, 'workflows.json');
  writeFileSync(file, JSON.stringify([{ definition: DEFINITION, digest: `sha256:${'aa'.repeat(32)}` }]));
  const settings = value(readControlPlaneSettings({ ...BASE, TASKELITH_WORKFLOWS: file }, 'linux', 501));
  assert.equal(settings.workflows[0]?.definition.id, 'wf');
  for (const content of ['{', '{}', JSON.stringify([{ definition: { id: 'a.b' }, digest: 1 }])]) {
    writeFileSync(file, content);
    assert.equal(failed(readControlPlaneSettings({ ...BASE, TASKELITH_WORKFLOWS: file }, 'linux', 501)).details.variable, 'TASKELITH_WORKFLOWS');
  }
});

test('the registry accepts only a known workflow with its digest', () => {
  const registry = new WorkflowRegistry([{ definition: value(parseWorkflowDefinition(DEFINITION)), digest: `sha256:${'aa'.repeat(32)}` }]);
  const binding = (workflowId: string, digest: string) => value(parseWorkflowRunBinding({
    pluginId: 'p', pluginVersion: '1', upstreamToolVersion: '1', workflowId, workflowVersion: '1', workflowDigest: digest,
    configurationRevision: 'c', policyRevision: 'r',
  }));
  assert.equal(value(registry.resolve(binding('wf', `sha256:${'aa'.repeat(32)}`))).id, 'wf');
  assert.equal(failed(registry.resolve(binding('wf', `sha256:${'bb'.repeat(32)}`))).code, 'precondition-failed');
  assert.equal(failed(registry.resolve(binding('other', `sha256:${'aa'.repeat(32)}`))).code, 'precondition-failed');
});

test('an admission identity derives from its run and task, within the identifier limit', () => {
  const long = 'x'.repeat(128);
  assert.equal(admissionIdOf('run-1', 'task-1'), admissionIdOf('run-1', 'task-1'));
  assert.notEqual(admissionIdOf('run-1', 'task-1'), admissionIdOf('run-2', 'task-1'));
  assert.match(admissionIdOf(long, long), /^a[0-9a-f]{64}$/);
});

test('the service entry reports a missing setting by name and does not start', async () => {
  const lines: string[] = [];
  assert.equal(await controlPlaneMain({}, (line) => lines.push(line)), undefined);
  assert.match(lines[0]!, /TASKELITH_POSTGRES_URL is not set/);
});

// A process stand-in that records its listeners and can deliver a signal.
function fakeProcess() {
  const listeners = new Map<string, Set<() => void>>();
  const host = {
    exitCode: undefined as number | string | null | undefined,
    on: (signal: string, listener: () => void) => listeners.set(signal, new Set([...(listeners.get(signal) ?? []), listener])),
    off: (signal: string, listener: () => void) => listeners.get(signal)?.delete(listener),
    emit: (signal: string) => [...(listeners.get(signal) ?? [])].forEach((listener) => listener()),
    count: (signal: string) => listeners.get(signal)?.size ?? 0,
  };
  return host;
}

function fakeRunning(outcome: 'stopped' | 'failed') {
  let stops = 0;
  let finish!: (value: 'stopped' | 'failed') => void;
  const stopped = new Promise<'stopped' | 'failed'>((resolve) => { finish = resolve; });
  return {
    running: { api: { host: '127.0.0.1', port: 0 }, browser: { host: '127.0.0.1', port: 0 }, metrics: undefined as never, stopped, stop: async () => { stops += 1; } },
    stops: () => stops,
    finish: () => finish(outcome),
  };
}

test('a repeated signal joins the one stop, and the handlers stay until it ends', async () => {
  const host = fakeProcess();
  const service = fakeRunning('stopped');
  const served = serveUntilStopped(service.running, host);
  host.emit('SIGTERM');
  host.emit('SIGTERM');
  host.emit('SIGINT');
  assert.equal(host.count('SIGTERM'), 1, 'a second SIGTERM still reaches the handler');
  service.finish();
  await served;
  assert.deepEqual([service.stops(), host.count('SIGTERM'), host.exitCode], [3, 0, undefined]);
});

test('a stop after a loop defect exits non-zero', async () => {
  const host = fakeProcess();
  const service = fakeRunning('failed');
  const served = serveUntilStopped(service.running, host);
  service.finish();
  await served;
  assert.equal(host.exitCode, 1);
});
