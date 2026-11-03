import assert from 'node:assert/strict';
import test from 'node:test';
import { PLUGIN_API_VERSION, satisfiesCaretRange } from '@taskelith/plugin-sdk';
import { createGithubSourceControl, GITHUB_PLUGIN_MANIFEST, registerGithubSourceControl } from '@taskelith/scm-github';
import { githubTestbed } from './github-fixture.ts';

test('registration admits the plugin for a host that offers the SourceControlProvider port', () => {
  const { options } = githubTestbed();
  const registered = registerGithubSourceControl({ ports: ['SdlcFramework', 'SourceControlProvider'] }, options);
  assert.ok(registered.ok);
  assert.deepEqual(registered.value.capabilities, { mergeMethods: ['merge-commit', 'squash', 'rebase'], reviewEvidence: ['required-status'] });
  assert.ok(Object.isFrozen(registered.value));
});

test('registration fails when the host does not offer the port', () => {
  const registered = registerGithubSourceControl({ ports: ['SdlcFramework'] }, githubTestbed().options);
  assert.equal(!registered.ok && registered.error.code, 'not-found');
});

test('the manifest accepts the SDK plugin API and declares required-status review evidence', () => {
  assert.equal(satisfiesCaretRange(PLUGIN_API_VERSION, GITHUB_PLUGIN_MANIFEST.pluginApiRange), true);
  assert.deepEqual(GITHUB_PLUGIN_MANIFEST.capabilities, ['required-status']);
});

test('merge methods and the webhook secret are checked', () => {
  const { options } = githubTestbed();
  for (const overrides of [{ mergeMethods: [] }, { mergeMethods: ['merge'] }, { webhookSecret: '' }]) {
    const created = createGithubSourceControl({ ...options, ...overrides });
    assert.equal(!created.ok && created.error.code, 'invalid', JSON.stringify(overrides));
  }
});
