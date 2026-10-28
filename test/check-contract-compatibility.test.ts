import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  asyncapiContractChanges,
  BREAKING_CHANGES_PATH,
  type BreakingChangeDeclaration,
  compatibilityProblems,
  declarationProblems,
  declaresBreakingChange,
  formatDeclarations,
  listedDeclarations,
  oasdiffBreakingChanges,
  readDeclarations,
  reservedParserKeys,
  sortedChanges,
  versionProblems,
} from '../scripts/check-contract-compatibility.ts';
import { CONTRACT_DOCUMENTS } from '../scripts/generate-contracts.ts';

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
    ],
  );

  assert.deepEqual(changes, [
    'remove /channels/sdlcEvents/messages/gateStale',
    'add /components/messages/gateOpened/payload/properties/metadata/allOf/0/required/7',
  ]);
});

test('a document may not use the parser prefix for any key', () => {
  const document = {
    operations: { 'x-parser-user': { action: 'send' }, sendEvent: { action: 'send' } },
    components: { schemas: { Event: { properties: { 'x-parser-field': { type: 'string' }, id: { type: 'string' } } } } },
  };

  assert.deepEqual(reservedParserKeys(document), ['/operations/x-parser-user', '/components/schemas/Event/properties/x-parser-field']);
  assert.deepEqual(reservedParserKeys({ info: { title: 'x-parser-value' }, tags: ['x-parser-tag'] }), []);
});

const API = 'packages/contracts/documents/sdlc.asyncapi.json';
const OTHER = 'packages/contracts/documents/sdlc.openapi.json';
const DOCUMENT_PATHS = [API, OTHER];
const FILE = BREAKING_CHANGES_PATH;

function declaration(version: string, breakingChanges: readonly string[], path = API): BreakingChangeDeclaration {
  return { path, version, reason: 'A reason.', breakingChanges };
}

function fileText(declarations: readonly unknown[]): string {
  return JSON.stringify({ declarations });
}

test('an undeclared breaking change under a minor bump on 0.x fails and is named', () => {
  const document = { path: API, baseVersion: '0.4.0', headVersion: '0.5.0', breakingChanges: ['remove /channels/a', 'add /channels/b'] };

  assert.deepEqual(declarationProblems(document, []), [
    `${API}: breaking change of 0.5.0 over 0.4.0 not listed in ${FILE}: add /channels/b`,
    `${API}: breaking change of 0.5.0 over 0.4.0 not listed in ${FILE}: remove /channels/a`,
  ]);
  assert.deepEqual(declarationProblems(document, [declaration('0.5.0', ['add /channels/b'])]), [
    `${API}: breaking change of 0.5.0 over 0.4.0 not listed in ${FILE}: remove /channels/a`,
  ]);
});

test('a major bump also needs its breaking changes listed', () => {
  const document = { path: API, baseVersion: '1.2.0', headVersion: '2.0.0', breakingChanges: ['remove /channels/a'] };

  assert.deepEqual(declarationProblems(document, []), [
    `${API}: breaking change of 2.0.0 over 1.2.0 not listed in ${FILE}: remove /channels/a`,
  ]);
  assert.deepEqual(declarationProblems(document, [declaration('2.0.0', ['remove /channels/a'])]), []);
});

test('a listed change that the check does not find is stale and named', () => {
  const document = { path: API, baseVersion: '0.4.0', headVersion: '0.5.0', breakingChanges: ['remove /channels/a'] };

  assert.deepEqual(declarationProblems(document, [declaration('0.5.0', ['remove /channels/a', 'remove /channels/z'])]), [
    `${API}: ${FILE} lists for 0.5.0 a change not found over 0.4.0: remove /channels/z`,
  ]);
  const noChanges = { ...document, breakingChanges: [] };
  assert.deepEqual(declarationProblems(noChanges, [declaration('0.5.0', ['remove /channels/a'])]), [
    `${API}: ${FILE} lists for 0.5.0 a change not found over 0.4.0: remove /channels/a`,
  ]);
  assert.deepEqual(declarationProblems(noChanges, []), []);
});

test('an entry for a version that declares no breaking change is stale', () => {
  const patch = { path: API, baseVersion: '0.4.0', headVersion: '0.4.1', breakingChanges: [] };
  const stale = `${API}: stale entry 0.4.1 in ${FILE}: 0.4.1 over 0.4.0 declares no breaking change of that version`;

  assert.deepEqual(declarationProblems(patch, [declaration('0.4.1', ['remove /channels/a'])]), [stale]);
  const minor = { ...patch, headVersion: '0.5.0', breakingChanges: ['remove /channels/a'] };
  assert.deepEqual(declarationProblems(minor, [declaration('0.5.0', ['remove /channels/a']), declaration('0.6.0', ['remove /channels/b'])]), [
    `${API}: stale entry 0.6.0 in ${FILE}: 0.5.0 over 0.4.0 declares no breaking change of that version`,
  ]);
});

test('a matching entry passes whatever the order of the changes', () => {
  const document = { path: API, baseVersion: '0.4.0', headVersion: '0.5.0', breakingChanges: ['remove /channels/b', 'add /channels/a', 'remove /channels/b'] };

  assert.deepEqual(declarationProblems(document, [declaration('0.5.0', ['add /channels/a', 'remove /channels/b'])]), []);
  assert.deepEqual(declarationProblems({ ...document, breakingChanges: ['add /channels/a', 'remove /channels/b'] }, [declaration('0.5.0', ['remove /channels/b', 'add /channels/a'])]), []);
});

test('entries at or below the merge-base version and of other documents are history', () => {
  const history = [
    declaration('0.3.0', ['remove /channels/old']),
    declaration('0.4.0-rc.1', ['remove /channels/older']),
    declaration('0.4.0', ['remove /channels/a']),
    declaration('0.9.0', ['remove /paths/x'], OTHER),
  ];

  assert.deepEqual(declarationProblems({ path: API, baseVersion: '0.4.0', headVersion: '0.4.0', breakingChanges: [] }, history), []);
  assert.deepEqual(declarationProblems({ path: API, baseVersion: '0.4.0', headVersion: '0.5.0', breakingChanges: ['add /channels/b'] }, [...history, declaration('0.5.0', ['add /channels/b'])]), []);
});

test('the existing rule still applies when the head version declares nothing', () => {
  const document = { path: API, baseVersion: '0.4.0', headVersion: '0.4.1', breakingChanges: ['remove /channels/a'] };

  assert.deepEqual(declarationProblems(document, []), []);
  assert.deepEqual(compatibilityProblems(API, '0.4.0', '0.4.1', ['remove /channels/a']), [
    `${API}: breaking change without a new major version (or minor while 0.x) over 0.4.0: remove /channels/a`,
  ]);
});

test('a well-formed declarations file is read', () => {
  const declarations = [
    declaration('0.9.0', ['remove /channels/a']),
    declaration('0.10.0', ['add /channels/b', 'remove /channels/c']),
    declaration('1.0.0-alpha', ['remove /channels/d']),
    declaration('1.0.0-alpha.1', ['remove /channels/e']),
    declaration('1.0.0-beta', ['remove /channels/f']),
    declaration('1.0.0', ['remove /channels/g']),
    declaration('0.2.0', ['removed path'], OTHER),
  ];

  assert.deepEqual(readDeclarations(fileText(declarations), DOCUMENT_PATHS), { declarations, problems: [] });
  assert.deepEqual(readDeclarations(fileText([]), DOCUMENT_PATHS), { declarations: [], problems: [] });
});

test('a malformed declarations file fails and names each problem', () => {
  const cases: readonly [string, readonly string[]][] = [
    ['{', [`${FILE}: is not valid JSON`]],
    [JSON.stringify({ entries: [] }), [`${FILE}: / must have required property 'declarations'`, `${FILE}: / must NOT have additional properties`]],
    [fileText([{ path: API, version: '0.5.0', breakingChanges: ['a'] }]), [`${FILE}: /declarations/0 must have required property 'reason'`]],
    [fileText([{ ...declaration('0.5.0', ['a']), reason: '  ' }]), [`${FILE}: /declarations/0/reason must match pattern "\\S"`]],
    [fileText([declaration('0.5.0', [])]), [`${FILE}: /declarations/0/breakingChanges must NOT have fewer than 1 items`]],
    [fileText([declaration('0.4', ['a'])]), [`${FILE}: declarations/0: version 0.4 is not a semantic version`]],
    [fileText([declaration('0.5.0', ['a'], 'packages/contracts/documents/unknown.json')]), [`${FILE}: declarations/0: packages/contracts/documents/unknown.json is not a contract document`]],
    [fileText([declaration('0.5.0', ['a']), declaration('0.5.0', ['b'])]), [`${FILE}: declarations/1: repeats ${API} 0.5.0`]],
    [fileText([declaration('0.10.0', ['a']), declaration('0.9.0', ['b'])]), [`${FILE}: declarations/1: is not sorted by path and version`]],
    [fileText([declaration('0.5.0', ['a'], OTHER), declaration('0.5.0', ['b'])]), [`${FILE}: declarations/1: is not sorted by path and version`]],
    [fileText([declaration('0.5.0', ['b', 'a'])]), [`${FILE}: declarations/0: breakingChanges are not sorted and unique`]],
    [fileText([declaration('0.5.0', ['a', 'a'])]), [`${FILE}: declarations/0: breakingChanges are not sorted and unique`]],
  ];
  for (const [text, problems] of cases) assert.deepEqual(readDeclarations(text, DOCUMENT_PATHS), { declarations: [], problems }, text);
});

test('the tracked declarations file is valid and keeps the SDLC AsyncAPI 0.4.0 history', () => {
  const read = readDeclarations(readFileSync(FILE, 'utf8'), CONTRACT_DOCUMENTS.map(({ path }) => path));

  assert.deepEqual(read.problems, []);
  const sdlc = read.declarations.find((entry) => entry.path === API && entry.version === '0.4.0');
  assert.equal(sdlc?.breakingChanges.length, 306);
});

test('changes sort by UTF-16 code units, not by locale, without duplicates', () => {
  assert.deepEqual(sortedChanges(['b', 'B', 'a', '_', 'é', 'e', 'a']), ['B', '_', 'a', 'b', 'e', 'é']);
});

test('the listing prints the file format with the head version and an empty reason', () => {
  const listed = listedDeclarations([
    { path: OTHER, baseVersion: '0.2.0', headVersion: '0.3.0', breakingChanges: ['removed path'] },
    { path: API, baseVersion: '0.4.0', headVersion: '0.5.0', breakingChanges: ['remove /channels/b', 'add /channels/a', 'add /channels/a'] },
    { path: API, baseVersion: '0.4.0', headVersion: '0.4.0', breakingChanges: [] },
  ]);

  assert.equal(formatDeclarations(listed), `${JSON.stringify({
    declarations: [
      { path: API, version: '0.5.0', reason: '', breakingChanges: ['add /channels/a', 'remove /channels/b'] },
      { path: OTHER, version: '0.3.0', reason: '', breakingChanges: ['removed path'] },
    ],
  }, null, 2)}\n`);
  assert.deepEqual(readDeclarations(formatDeclarations(listed), DOCUMENT_PATHS).problems, [
    `${FILE}: /declarations/0/reason must match pattern "\\S"`,
    `${FILE}: /declarations/1/reason must match pattern "\\S"`,
  ]);
});
