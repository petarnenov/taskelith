import assert from 'node:assert/strict';
import test from 'node:test';
import { PLUGIN_API_VERSION, satisfiesCaretRange } from '@taskelith/plugin-sdk';

test('the plugin API version is a release version its own caret range accepts', () => {
  assert.match(PLUGIN_API_VERSION, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.equal(satisfiesCaretRange(PLUGIN_API_VERSION, `^${PLUGIN_API_VERSION}`), true);
});

test('a caret range from 1.0.0 accepts the same major version from its minimum', () => {
  assert.equal(satisfiesCaretRange('1.2.3', '^1.2.3'), true);
  assert.equal(satisfiesCaretRange('1.9.0', '^1.2.3'), true);
  assert.equal(satisfiesCaretRange('1.2.2', '^1.2.3'), false);
  assert.equal(satisfiesCaretRange('2.0.0', '^1.2.3'), false);
});

test('a caret range below 1.0.0 accepts the same minor version from its minimum', () => {
  assert.equal(satisfiesCaretRange('0.2.3', '^0.2.3'), true);
  assert.equal(satisfiesCaretRange('0.2.9', '^0.2.3'), true);
  assert.equal(satisfiesCaretRange('0.3.0', '^0.2.3'), false);
  assert.equal(satisfiesCaretRange('1.2.3', '^0.2.3'), false);
});

test('a caret range below 0.1.0 accepts only its exact version', () => {
  assert.equal(satisfiesCaretRange('0.0.3', '^0.0.3'), true);
  assert.equal(satisfiesCaretRange('0.0.4', '^0.0.3'), false);
});

test('versions and ranges outside the understood forms are not satisfied', () => {
  assert.equal(satisfiesCaretRange('1.2.3-beta', '^1.2.3'), false);
  assert.equal(satisfiesCaretRange('1.2', '^1.2.3'), false);
  assert.equal(satisfiesCaretRange('1.2.3', '1.2.3'), false);
  assert.equal(satisfiesCaretRange('1.2.3', '^1.2'), false);
  assert.equal(satisfiesCaretRange('1.2.3', '>=1.2.3'), false);
});
