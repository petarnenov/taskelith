import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asyncapiContractChanges,
  compatibilityProblems,
  declaresBreakingChange,
  oasdiffBreakingChanges,
  versionProblems,
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

test('only a semantic version passes, including prerelease and build metadata', () => {
  for (const version of ['0.1.0', '1.0.0-alpha.1', '1.0.0-0.3.7', '1.0.0+build.7', '1.0.0-rc.1+sha.5114f85']) {
    assert.deepEqual(versionProblems('api.json', version), [], version);
  }
  for (const version of ['0.2.0-', '0.2.0+', '0.2.0-01', '0.2.0-invalid suffix', '01.0.0', '1.0', 2]) {
    assert.deepEqual(versionProblems('api.json', version), [`api.json: info.version ${version} is not a semantic version`], String(version));
  }
});

test('an invalid head version does not declare a breaking change', () => {
  assert.deepEqual(compatibilityProblems('api.json', '0.1.0', '0.2.0-', ['removed path']), ['api.json: info.version 0.2.0- is not a semantic version']);
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

test('breaking and unclassified AsyncAPI changes count, parser annotations and the version do not', () => {
  const changes = asyncapiContractChanges(
    [
      { action: 'remove', path: '/channels/sdlcEvents/messages/gateStale' },
      { action: 'edit', path: '/info/version' },
    ],
    [
      { action: 'add', path: '/components/messages/gateOpened/payload/properties/metadata/allOf/0/required/7' },
      { action: 'edit', path: '/components/messages/gateReopened/payload/properties/metadata/x-parser-schema-id' },
      { action: 'edit', path: '/components/messages/gateOpened/payload/properties/x-parser-user-field/type' },
    ],
  );

  assert.deepEqual(changes, [
    'remove /channels/sdlcEvents/messages/gateStale',
    'add /components/messages/gateOpened/payload/properties/metadata/allOf/0/required/7',
    'edit /components/messages/gateOpened/payload/properties/x-parser-user-field/type',
  ]);
});
