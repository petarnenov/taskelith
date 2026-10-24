import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asyncapiContractChanges,
  compatibilityProblems,
  declaresBreakingChange,
  oasdiffBreakingChanges,
} from '../scripts/check-contract-compatibility.ts';

test('a breaking change is declared by a higher major version, or a higher minor version while 0.x', () => {
  const cases: readonly [string, string, boolean][] = [
    ['1.4.0', '2.0.0', true],
    ['0.1.0', '0.2.0', true],
    ['0.1.0', '1.0.0', true],
    ['0.1.0', '0.1.1', false],
    ['1.4.0', '1.5.0', false],
    ['2.0.0', '1.9.0', false],
    ['not-a-version', '2.0.0', false],
  ];
  for (const [base, head, declared] of cases) assert.equal(declaresBreakingChange(base, head), declared, `${base} -> ${head}`);
});

test('undeclared breaking changes are reported, declared ones and compatible changes pass', () => {
  assert.deepEqual(compatibilityProblems('api.json', '0.1.0', '0.1.0', []), []);
  assert.deepEqual(compatibilityProblems('api.json', '0.1.0', '0.2.0', ['removed path']), []);
  assert.deepEqual(compatibilityProblems('api.json', '0.1.0', '0.1.1', ['removed path']), [
    'api.json: breaking change without a new major version (or minor while 0.x) over 0.1.0: removed path',
  ]);
  assert.deepEqual(compatibilityProblems('api.json', '0.1.0', 'next', []), ['api.json: info.version next is not a semantic version']);
});

test('only oasdiff changes of level ERR are breaking', () => {
  const output = JSON.stringify([
    { id: 'api-path-removed-without-deprecation', text: 'api path removed without deprecation', level: 3, operationId: 'readAdmission' },
    { id: 'request-property-became-required', text: 'the request property `workItem` became required', level: 3 },
    { id: 'response-optional-property-removed', text: 'an optional response property was removed', level: 2 },
  ]);

  assert.deepEqual(oasdiffBreakingChanges(output), [
    'api-path-removed-without-deprecation (readAdmission): api path removed without deprecation',
    'request-property-became-required: the request property `workItem` became required',
  ]);
  assert.deepEqual(oasdiffBreakingChanges('null'), []);
});

test('breaking and unclassified AsyncAPI changes count, parser annotations do not', () => {
  const changes = asyncapiContractChanges(
    [{ action: 'remove', path: '/channels/sdlcEvents/messages/gateStale' }],
    [
      { action: 'add', path: '/components/messages/gateOpened/payload/properties/metadata/allOf/0/required/7' },
      { action: 'edit', path: '/components/messages/gateReopened/payload/properties/metadata/x-parser-schema-id' },
    ],
  );

  assert.deepEqual(changes, [
    'remove /channels/sdlcEvents/messages/gateStale',
    'add /components/messages/gateOpened/payload/properties/metadata/allOf/0/required/7',
  ]);
});
