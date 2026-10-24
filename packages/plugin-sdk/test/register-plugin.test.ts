import assert from 'node:assert/strict';
import test from 'node:test';
import { PLUGIN_API_VERSION, registerPlugin } from '@taskelith/plugin-sdk';

const host = { ports: ['SdlcFramework'] };

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sdlc-example',
    version: '1.4.0-rc.1+build.7',
    pluginApiRange: `^${PLUGIN_API_VERSION}`,
    port: 'SdlcFramework',
    capabilities: ['structural-validation', 'native-archive'],
    ...overrides,
  };
}

function failureOf(input: unknown) {
  const result = registerPlugin(input, host);
  assert.equal(result.ok, false);
  return result.error;
}

test('a valid manifest is admitted as a frozen copy', () => {
  const input = manifest();
  const result = registerPlugin(input, host);
  assert.ok(result.ok);
  assert.deepEqual(result.value, input);
  assert.notEqual(result.value, input);
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.capabilities));
});

test('a manifest with no capabilities is admitted', () => {
  assert.equal(registerPlugin(manifest({ capabilities: [] }), host).ok, true);
});

test('a manifest that is not an object is invalid', () => {
  for (const input of [null, 'sdlc-example', 42, []]) {
    assert.equal(failureOf(input).code, 'invalid');
  }
});

test('every missing field is reported', () => {
  const error = failureOf({});
  assert.equal(error.code, 'invalid');
  for (const field of ['id', 'version', 'pluginApiRange', 'port', 'capabilities']) {
    assert.match(error.message, new RegExp(`required property '${field}'`));
  }
});

test('an unknown field is invalid and named', () => {
  const error = failureOf(manifest({ entryPoint: './index.js' }));
  assert.equal(error.code, 'invalid');
  assert.match(error.message, /additional properties "entryPoint"/);
});

test('malformed field values are invalid and located', () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ id: 'Sdlc_Example' }, '/id'],
    [{ id: 'sdlc-' }, '/id'],
    [{ id: `a${'b'.repeat(64)}` }, '/id'],
    [{ version: '1.4' }, '/version'],
    [{ version: '01.4.0' }, '/version'],
    [{ pluginApiRange: '>=0.1.0' }, '/pluginApiRange'],
    [{ pluginApiRange: '0.1.0' }, '/pluginApiRange'],
    [{ pluginApiRange: '^0.1' }, '/pluginApiRange'],
    [{ port: 'sdlcFramework' }, '/port'],
    [{ capabilities: 'structural-validation' }, '/capabilities'],
    [{ capabilities: ['Structural'] }, '/capabilities/0'],
    [{ capabilities: ['resume', 'resume'] }, '/capabilities'],
    [{ capabilities: Array.from({ length: 65 }, (_, index) => `capability-${index}`) }, '/capabilities'],
    [{ version: `1.0.0-${'a'.repeat(64)}` }, '/version'],
  ];
  for (const [overrides, location] of cases) {
    const error = failureOf(manifest(overrides));
    assert.equal(error.code, 'invalid', JSON.stringify(overrides));
    assert.ok(error.message.includes(`${location} `), `${error.message} should locate ${location}`);
  }
});

test('a plugin for a port the host does not offer is rejected before admission', () => {
  const error = failureOf(manifest({ port: 'AgentHarness' }));
  assert.equal(error.code, 'not-found');
  assert.deepEqual(error.details, { pluginId: 'sdlc-example', port: 'AgentHarness' });
});

test('a plugin whose plugin API range excludes this SDK is rejected before admission', () => {
  for (const pluginApiRange of ['^1.0.0', '^0.2.0', '^0.0.1']) {
    const error = failureOf(manifest({ pluginApiRange }));
    assert.equal(error.code, 'precondition-failed');
    assert.deepEqual(error.details, { pluginId: 'sdlc-example', pluginApiRange, pluginApiVersion: PLUGIN_API_VERSION });
  }
});

test('the port is checked before the plugin API range', () => {
  assert.equal(failureOf(manifest({ port: 'AgentHarness', pluginApiRange: '^9.0.0' })).code, 'not-found');
});
