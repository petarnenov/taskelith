import assert from 'node:assert/strict';
import test from 'node:test';
import * as sdk from '@taskelith/plugin-sdk';
import type { draft } from '@taskelith/plugin-sdk';
import type { SourceControlProvider } from '@taskelith/integrations/port';

// The draft SCM port is reachable only as `draft`, and only as types.

// @ts-expect-error The frozen root export carries no draft port.
type RootProvider = sdk.SourceControlProvider;

function sameType<Left, Right>(check: [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false): boolean {
  return check;
}

test('the draft namespace carries the port type of the integrations module', () => {
  assert.equal(sameType<draft.SourceControlProvider, SourceControlProvider>(true), true);
});

test('the draft namespace adds no runtime export to the plugin SDK', () => {
  assert.deepEqual(Object.keys(sdk).sort(), ['PLUGIN_API_PORT_VERSIONS', 'PLUGIN_API_VERSION', 'registerPlugin', 'satisfiesCaretRange']);
});

export type { RootProvider };
