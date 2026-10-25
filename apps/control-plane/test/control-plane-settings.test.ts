import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  admissionIdOf,
  controlPlaneMain,
  DEFAULT_API_HOST,
  DEFAULT_API_PORT,
  readControlPlaneSettings,
  WorkflowRegistry,
} from '@taskelith/control-plane';
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
