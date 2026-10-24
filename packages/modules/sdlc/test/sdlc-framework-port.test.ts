import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  LIFECYCLE_OBLIGATIONS,
  OPTIONAL_SDLC_OPERATIONS,
  parseSdlcFrameworkCapabilities,
  runSdlcFrameworkConformance,
  type ArtifactRevisionInput,
  type ResolvedWorkflow,
  type SdlcConformanceCase,
  type SdlcFramework,
  type SdlcFrameworkCapabilities,
  type StageInstructions,
  type StructuralValidationReport,
  type WorkItemInput,
} from '@taskelith/sdlc';

// A framework-neutral stand-in for a plugin: a native graph without review,
// verification, or closure, which the platform supplies.
const CONTEXT = { workingCopy: '/work/copy' };
const ITEM = { ...CONTEXT, workItem: 'feature 12' };
const WORK_ITEMS: readonly WorkItemInput[] = [{ id: 'item-12', nativeReference: 'feature 12' }];
const REVISIONS: readonly ArtifactRevisionInput[] = [
  { artifactId: 'proposal', digest: `sha256:${'aa'.repeat(32)}`, nativeReference: 'feature 12/proposal.md@1a2b3c4' },
];
const WORKFLOW: ResolvedWorkflow = {
  definition: {
    id: 'example-workflow',
    version: '1',
    stages: [
      { id: 'proposal', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'build', obligations: ['implementation'], origin: 'native', dependsOn: ['proposal'] },
      { id: 'check', obligations: ['verification', 'review'], origin: 'platform-managed', dependsOn: ['build'] },
      { id: 'close', obligations: ['closure'], origin: 'platform-managed', dependsOn: ['check'] },
    ],
  },
  digest: `sha256:${'bb'.repeat(32)}`,
  upstreamToolVersion: '3.0.1',
};
// Another work item of the same working copy uses another workflow version.
const OTHER_WORKFLOW: ResolvedWorkflow = {
  ...WORKFLOW,
  definition: { ...WORKFLOW.definition, version: '2' },
  digest: `sha256:${'cc'.repeat(32)}`,
};
const INSTRUCTIONS: StageInstructions = { stageId: 'build', instructions: 'Implement the tasks.', inputs: REVISIONS, outputs: ['tasks'] };
const VALID_REPORT: StructuralValidationReport = { validator: 'example-validator', verdict: 'valid', reference: 'validate.log', problems: [] };
const CAPABILITIES: SdlcFrameworkCapabilities = {
  optionalOperations: ['validateStructure'],
  nativeObligations: ['intake', 'specification', 'implementation'],
};

type Overrides = Partial<Omit<SdlcFramework, 'capabilities'>> & { readonly capabilities?: SdlcFrameworkCapabilities };

function framework(overrides: Overrides = {}): SdlcFramework {
  return {
    capabilities: CAPABILITIES,
    discoverWorkItems: async () => ok(WORK_ITEMS),
    resolveWorkflow: async (request) => ok(request.workItem === 'feature 13' ? OTHER_WORKFLOW : WORKFLOW),
    describeArtifacts: async (request) => {
      if (!['feature 12', 'feature 13'].includes(request.workItem)) return err(failure('not-found', `no work item ${request.workItem}`));
      return ok([{ artifactId: 'proposal', stageId: 'proposal', requires: [], present: request.workItem === 'feature 12' }]);
    },
    inspectArtifactRevisions: async () => ok(REVISIONS),
    prepareStageInstructions: async () => ok(INSTRUCTIONS),
    validateStructure: async () => ok(VALID_REPORT),
    finalize: async () => err(failure('unavailable', 'the framework has no finalization')),
    ...overrides,
  };
}

const CASES: readonly SdlcConformanceCase[] = [
  { name: 'discover', operation: 'discoverWorkItems', request: CONTEXT, expected: { ok: true, value: WORK_ITEMS } },
  { name: 'resolve', operation: 'resolveWorkflow', request: CONTEXT, expected: { ok: true, value: WORKFLOW } },
  { name: 'resolve for the first item', operation: 'resolveWorkflow', request: ITEM, expected: { ok: true, value: WORKFLOW } },
  { name: 'resolve for an item', operation: 'resolveWorkflow', request: { ...CONTEXT, workItem: 'feature 13' }, expected: { ok: true, value: OTHER_WORKFLOW } },
  {
    name: 'describe another item',
    operation: 'describeArtifacts',
    request: { ...CONTEXT, workItem: 'feature 13' },
    expected: { ok: true, value: [{ artifactId: 'proposal', stageId: 'proposal', requires: [], present: false }] },
  },
  {
    name: 'describe',
    operation: 'describeArtifacts',
    request: ITEM,
    expected: { ok: true, value: [{ artifactId: 'proposal', stageId: 'proposal', requires: [], present: true }] },
  },
  { name: 'unknown work item', operation: 'describeArtifacts', request: { ...CONTEXT, workItem: 'missing' }, expected: { ok: false, code: 'not-found' } },
  { name: 'inspect', operation: 'inspectArtifactRevisions', request: ITEM, expected: { ok: true, value: REVISIONS } },
  { name: 'prepare', operation: 'prepareStageInstructions', request: { ...ITEM, stageId: 'build' }, expected: { ok: true, value: INSTRUCTIONS } },
  { name: 'validate', operation: 'validateStructure', request: { ...ITEM, subject: REVISIONS }, expected: { ok: true, value: VALID_REPORT } },
  { name: 'finalize', operation: 'finalize', request: ITEM, expected: { ok: false, code: 'unavailable' } },
];

async function findings(subject: SdlcFramework, cases: readonly SdlcConformanceCase[] = CASES): Promise<string[]> {
  const report = await runSdlcFrameworkConformance(subject, cases);
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.findings));
  return report.findings.map((entry) => `${entry.caseName} ${entry.check}: ${entry.message}`);
}

function only(name: string): SdlcConformanceCase[] {
  return CASES.filter((testCase) => testCase.name === name);
}

test('a conforming framework passes every case', async () => {
  const report = await runSdlcFrameworkConformance(framework(), CASES);
  assert.equal(report.cases, CASES.length);
  assert.deepEqual(report.findings, []);
});

test('a result that differs from the expected outcome is reported', async () => {
  assert.deepEqual(await findings(framework({ discoverWorkItems: async () => ok([]) }), only('discover')), [
    'discover outcome: discoverWorkItems returned ok [], not the expected outcome',
  ]);
  assert.deepEqual(await findings(framework({ describeArtifacts: async () => err(failure('unavailable', 'tool missing')) }), only('unknown work item')), [
    'unknown work item outcome: describeArtifacts returned failure unavailable, not the expected outcome',
  ]);
});

test('an operation that throws is reported and the suite continues with the next case', async () => {
  const throwing = framework({ inspectArtifactRevisions: async () => { throw new Error('tool crashed'); } });
  const report = await runSdlcFrameworkConformance(throwing, [...only('inspect'), ...only('discover')]);
  assert.equal(report.cases, 2);
  assert.deepEqual(report.findings, [
    { caseName: 'inspect', check: 'threw', message: 'inspectArtifactRevisions threw instead of returning a Result: Error: tool crashed' },
  ]);
  const thrownValue = framework({ discoverWorkItems: () => { throw 'plain text'; } });
  assert.deepEqual(await findings(thrownValue, only('discover')), ['discover threw: discoverWorkItems threw instead of returning a Result: "plain text"']);
  const unprintable = framework({ discoverWorkItems: () => { throw 10n; } });
  assert.deepEqual(await findings(unprintable, only('discover')), ['discover threw: discoverWorkItems threw instead of returning a Result: an unprintable value']);
});

test('an undeclared optional operation must fail with unavailable', async () => {
  const declaresNothing = framework({ capabilities: { ...CAPABILITIES, optionalOperations: [] } });
  assert.deepEqual(await findings(declaresNothing, only('validate')), [
    'validate undeclared-operation: validateStructure is not declared and must fail with unavailable',
  ]);
  assert.deepEqual(await findings(framework(), only('finalize')), []);
});

test('invalid capabilities are reported before any case runs', async () => {
  const cases: [SdlcFrameworkCapabilities, string][] = [
    [{ ...CAPABILITIES, optionalOperations: ['approve'] }, `optionalOperations: optional operation must be one of ${OPTIONAL_SDLC_OPERATIONS.join(', ')}`],
    [{ ...CAPABILITIES, optionalOperations: ['finalize', 'finalize'] }, 'optionalOperations: operation finalize is listed twice'],
    [{ ...CAPABILITIES, nativeObligations: ['planning'] }, `nativeObligations: LifecycleObligation must be one of ${LIFECYCLE_OBLIGATIONS.join(', ')}`],
    [{ ...CAPABILITIES, nativeObligations: ['intake', 'intake'] }, 'nativeObligations: obligation intake is listed twice'],
  ];
  for (const [capabilities, message] of cases) {
    const report = await runSdlcFrameworkConformance(framework({ capabilities }), CASES);
    assert.equal(report.cases, 0);
    assert.deepEqual(report.findings, [{ caseName: 'capabilities', check: 'capabilities', message }]);
  }
});

test('capabilities of the wrong structure are reported and no operation is called', async () => {
  const declarations: [unknown, string][] = [
    [null, 'capabilities must be an object'],
    [{}, 'capabilities.optionalOperations is missing; capabilities.nativeObligations is missing'],
    [{ optionalOperations: '', nativeObligations: '' }, 'capabilities.optionalOperations must be an array; capabilities.nativeObligations must be an array'],
    [{ optionalOperations: new Set(['finalize']), nativeObligations: [] }, 'capabilities.optionalOperations must be a plain object'],
    [{ optionalOperations: [], nativeObligations: [1] }, 'capabilities.nativeObligations[0] must be a string'],
    [{ optionalOperations: Object.defineProperty([], '0', { value: 'finalize', enumerable: false }), nativeObligations: [] }, 'capabilities.optionalOperations[0] is not enumerable'],
    [{ ...CAPABILITIES, approves: true }, 'capabilities.approves is not a defined field'],
  ];
  for (const [capabilities, message] of declarations) {
    let calls = 0;
    const counted = framework({ capabilities: capabilities as SdlcFrameworkCapabilities, discoverWorkItems: async () => { calls += 1; return ok(WORK_ITEMS); } });
    const report = await runSdlcFrameworkConformance(counted, only('discover'));
    assert.deepEqual(report.findings, [{ caseName: 'capabilities', check: 'capabilities', message }]);
    assert.equal(calls, 0);
  }
  const unreadable = { ...framework(), get capabilities(): SdlcFrameworkCapabilities { throw new Error('no declaration'); } };
  assert.deepEqual(await findings(unreadable), ['capabilities capabilities: capabilities could not be read: Error: no declaration']);
});

test('parseSdlcFrameworkCapabilities returns invalid instead of running a getter', () => {
  let calls = 0;
  const declaration = { nativeObligations: [], get optionalOperations(): string[] { calls += 1; throw new Error('unreadable'); } };
  const result = parseSdlcFrameworkCapabilities(declaration);
  assert.deepEqual(result, { ok: false, error: { code: 'invalid', message: 'capabilities.optionalOperations is an accessor, not a data property', details: { field: 'capabilities' } } });
  assert.equal(calls, 0);
  const trap = new Proxy({}, { ownKeys: () => { throw new Error('trap'); } });
  assert.equal(!parseSdlcFrameworkCapabilities(trap).ok && 'invalid', 'invalid');
});

test('parseSdlcFrameworkCapabilities returns frozen typed capabilities', () => {
  const result = parseSdlcFrameworkCapabilities(CAPABILITIES);
  assert.deepEqual(result, { ok: true, value: CAPABILITIES });
  assert.ok(result.ok && Object.isFrozen(result.value) && Object.isFrozen(result.value.optionalOperations) && Object.isFrozen(result.value.nativeObligations));
  assert.equal(!parseSdlcFrameworkCapabilities({ ...CAPABILITIES, nativeObligations: [''] }).ok, true);
});

// Runs one case whose expected outcome is the plugin's own value, so that only
// shape findings remain.
async function shapeFindings<Value>(operation: SdlcConformanceCase['operation'], request: unknown, value: Value, capabilities = CAPABILITIES): Promise<string[]> {
  const plugin = framework({ capabilities, [operation]: async (): Promise<Result<Value>> => ok(value) });
  const testCase = { name: 'shape', operation, request, expected: { ok: true, value } } as unknown as SdlcConformanceCase;
  return findings(plugin, [testCase]);
}

test('work items must parse and be unique', async () => {
  assert.deepEqual(await shapeFindings('discoverWorkItems', CONTEXT, [...WORK_ITEMS, ...WORK_ITEMS, { id: '', nativeReference: 'x' }]), [
    'shape shape: value[2]: id: WorkItemId must be 1-128 printable ASCII characters without whitespace',
    'shape shape: work item item-12 is listed twice',
  ]);
});

test('a resolved workflow must parse and match the declared native obligations', async () => {
  assert.deepEqual(await shapeFindings('resolveWorkflow', CONTEXT, { ...WORKFLOW, digest: 'md5:00', upstreamToolVersion: '' }), [
    'shape shape: value.digest: ContentDigest must be sha256: followed by 64 lowercase hexadecimal characters',
    'shape shape: value.upstreamToolVersion: ToolVersion must be 1-128 printable ASCII characters without whitespace',
  ]);
  assert.deepEqual(await shapeFindings('resolveWorkflow', CONTEXT, { ...WORKFLOW, definition: { ...WORKFLOW.definition, stages: [] } }), [
    'shape shape: value.definition: stages: a workflow needs at least one stage',
  ]);
  const mismatched = { ...CAPABILITIES, nativeObligations: ['intake', 'specification', 'review'] };
  assert.deepEqual(await shapeFindings('resolveWorkflow', CONTEXT, WORKFLOW, mismatched), [
    'shape shape: native obligation review is declared but no native stage covers it',
    'shape shape: a native stage covers implementation, which is not a declared native obligation',
  ]);
});

test('artifact requirements, revisions, and instructions must parse', async () => {
  assert.deepEqual(await shapeFindings('describeArtifacts', ITEM, [{ artifactId: '', stageId: ' ', requires: ['a b'], present: false }]), [
    'shape shape: value[0].artifactId: ArtifactId must be 1-128 printable ASCII characters without whitespace',
    'shape shape: value[0].stageId: StageId must be 1-128 printable ASCII characters without whitespace',
    'shape shape: value[0].requires: ArtifactId must be 1-128 printable ASCII characters without whitespace',
  ]);
  assert.deepEqual(await shapeFindings('inspectArtifactRevisions', ITEM, [{ ...REVISIONS[0]!, digest: 'x' }]), [
    'shape shape: value[0]: digest: ContentDigest must be sha256: followed by 64 lowercase hexadecimal characters',
  ]);
  for (const stageId of ['', 'has space', 'é', 'x'.repeat(129)]) {
    assert.deepEqual(await shapeFindings('prepareStageInstructions', { ...ITEM, stageId }, { ...INSTRUCTIONS, stageId }), [
      'shape shape: value.stageId: StageId must be 1-128 printable ASCII characters without whitespace',
    ]);
  }
  const wrong = { stageId: 'proposal', instructions: '', inputs: [{ ...REVISIONS[0]!, artifactId: '' }], outputs: [''] };
  assert.deepEqual(await shapeFindings('prepareStageInstructions', { ...ITEM, stageId: 'build' }, wrong), [
    'shape shape: value.inputs[0]: artifactId: ArtifactId must be 1-128 printable ASCII characters without whitespace',
    'shape shape: value.outputs: ArtifactId must be 1-128 printable ASCII characters without whitespace',
    'shape shape: instructions are for stage proposal, not build',
    'shape shape: instructions are empty',
  ]);
});

test('a structural validation report must be consistent and never a semantic verdict', async () => {
  const request = { ...ITEM, subject: REVISIONS };
  assert.deepEqual(await shapeFindings('validateStructure', request, { ...VALID_REPORT, verdict: 'approved' }), [
    'shape shape: verdict must be one of valid, invalid',
  ]);
  assert.deepEqual(await shapeFindings('validateStructure', request, { ...VALID_REPORT, verdict: 'invalid' }), [
    'shape shape: a valid report has no problems and an invalid report has at least one',
  ]);
  const invalid = { validator: '', verdict: 'invalid', reference: '', problems: [{ artifactId: 'a b', message: '' }, { message: 'missing section' }] };
  assert.deepEqual(await shapeFindings('validateStructure', request, invalid), [
    'shape shape: value.validator: ValidatorId must be 1-128 printable ASCII characters without whitespace',
    'shape shape: value.reference: EvidenceReference must be 1-1024 characters without control characters',
    'shape shape: value.problems[0].artifactId: ArtifactId must be 1-128 printable ASCII characters without whitespace',
    'shape shape: value.problems[0].message is empty',
  ]);
});

test('a finalization report must parse', async () => {
  const declared = { ...CAPABILITIES, optionalOperations: ['finalize'] };
  assert.deepEqual(await shapeFindings('finalize', ITEM, { reference: 'archive.log', revisions: REVISIONS }, declared), []);
  assert.deepEqual(await shapeFindings('finalize', ITEM, { reference: '', revisions: [{ ...REVISIONS[0]!, nativeReference: '' }] }, declared), [
    'shape shape: value.reference: EvidenceReference must be 1-1024 characters without control characters',
    'shape shape: value.revisions[0]: nativeReference: NativeReference must be 1-1024 characters without control characters',
  ]);
});


test('expected values are compared structurally, ignoring key order', async () => {
  const reordered = WORK_ITEMS.map((item) => ({ nativeReference: item.nativeReference, id: item.id }));
  assert.deepEqual(await findings(framework({ discoverWorkItems: async () => ok(reordered) }), only('discover')), []);
  for (const value of [[{ id: 'item-12' }], [{ ...WORK_ITEMS[0]!, extra: undefined }], [null], WORK_ITEMS[0]]) {
    const result = await findings(framework({ discoverWorkItems: async () => ok(value as never) }), only('discover'));
    assert.ok(result.some((entry) => entry.startsWith('discover outcome:')));
  }
});

test('a value that is not a Result is reported, and the suite continues', async () => {
  const results: [unknown, string[]][] = [
    [null, ['the operation did not resolve to a Result']],
    [{}, ['the operation did not resolve to a Result']],
    [{ ok: 1, value: [] }, ['the operation did not resolve to a Result']],
    [{ ok: false }, ['result.error is missing']],
    [{ ok: false, error: { code: 'not-found' } }, ['result.error.message is missing', 'result.error.details is missing']],
    [{ ok: false, error: { code: 'gone', message: 'm', details: {} } }, ['result.error.code gone is not a kernel failure code']],
    [{ ok: false, error: { code: 'not-found', message: 'm', details: { line: 3 } } }, ['result.error.details.line must be a string']],
    [{ ok: false, error: { code: 'not-found', message: 'm', details: [] } }, ['result.error.details must be an object']],
    [{ ok: true, value: WORK_ITEMS, extra: 1 }, ['result.extra is not a defined field']],
  ];
  for (const [result, messages] of results) {
    const report = await runSdlcFrameworkConformance(framework({ discoverWorkItems: async () => result as never }), [...only('discover'), ...only('inspect')]);
    assert.deepEqual(report.findings.map((entry) => `${entry.caseName} ${entry.check}: ${entry.message}`), messages.map((message) => `discover result: ${message}`));
  }
});

test('hidden, symbol, accessor, cyclic, and unreadable data in a result is reported without running its code', async () => {
  let getterCalls = 0;
  const workItem = WORK_ITEMS[0]!;
  const hidden = Object.defineProperty({ ...workItem }, 'approved', { value: true, enumerable: false });
  const symbol = { ...workItem, [Symbol('approved')]: true };
  const accessor = { ...workItem, get approved(): boolean { getterCalls += 1; return true; } };
  const cyclic: Record<string, unknown> = { ...workItem };
  cyclic.self = cyclic;
  const holeWithExtra = Object.assign(new Array(1), { extra: 'unexpected' });
  const hiddenElement = Object.defineProperty([workItem], 'extra', { value: 1, enumerable: false });
  const unreadable = new Proxy({}, { ownKeys: () => { throw new Error('trap'); } });
  const cases: [unknown, string][] = [
    [[hidden], 'result.value[0].approved is not enumerable'],
    [[symbol], 'result.value[0] has a symbol property'],
    [[accessor], 'result.value[0].approved is an accessor, not a data property'],
    [[cyclic], 'result.value[0].self refers to itself'],
    [holeWithExtra, 'result.value has the property extra, which is not an element'],
    [new Array(1), 'result.value has a hole at 0'],
    [Object.defineProperty([], '0', { value: workItem, enumerable: false, configurable: true, writable: true }), 'result.value[0] is not enumerable'],
    [[{ ...workItem, nested: Object.defineProperty([], '0', { value: 'x', enumerable: false }) }], 'result.value[0].nested[0] is not enumerable'],
    [hiddenElement, 'result.value has the property extra, which is not an element'],
    [[10n], 'result.value[0] is a bigint, not plain data'],
    [[new Date(0)], 'result.value[0] must be a plain object'],
    [unreadable, 'result could not be read'],
  ];
  for (const [value, message] of cases) {
    const result = await findings(framework({ discoverWorkItems: async () => ok(value as never) }), only('discover'));
    assert.equal(result[0], `discover result: ${message}`);
  }
  const details = { ok: false, error: { code: 'not-found', message: 'm', details: Object.defineProperty({}, 'line', { value: '3', enumerable: false }) } };
  assert.deepEqual(await findings(framework({ discoverWorkItems: async () => details as never }), only('discover')), ['discover result: result.error.details.line is not enumerable']);
  const subclassed = Object.setPrototypeOf([], class extends Array {}.prototype);
  assert.equal((await findings(framework({ discoverWorkItems: async () => ok(subclassed) }), only('discover')))[0], 'discover result: result.value must be a plain array');
  assert.equal(getterCalls, 0);
});

test('an object with a null prototype is plain data', async () => {
  const value = WORK_ITEMS.map((item) => Object.assign(Object.create(null), item));
  assert.deepEqual(await findings(framework({ discoverWorkItems: async () => ok(value) }), only('discover')), []);
});

test('a key named __proto__ stays an ordinary field of the copy', async () => {
  const value = [JSON.parse('{"id":"item-12","nativeReference":"feature 12","__proto__":{"approved":true}}')];
  assert.deepEqual(await findings(framework({ discoverWorkItems: async () => ok(value) }), only('discover')), [
    'discover outcome: discoverWorkItems returned ok [{"id":"item-12","nativeReference":"feature 12","__proto__":{"approved":true}}], not the expected outcome',
    'discover shape: value[0].__proto__ is not a defined field',
  ]);
});

test('a value is described without failing the suite', async () => {
  const absent = await findings(framework({ discoverWorkItems: async () => ok(undefined as never) }), only('discover'));
  assert.equal(absent[0], 'discover outcome: discoverWorkItems returned ok undefined, not the expected outcome');
});

test('result values of the wrong runtime types are reported', async () => {
  const revision = REVISIONS[0]!;
  const cases: [SdlcConformanceCase['operation'], unknown, unknown, string[]][] = [
    ['discoverWorkItems', CONTEXT, { not: 'an array' }, ['value must be an array']],
    ['discoverWorkItems', CONTEXT, [{ id: 7, nativeReference: ['x'] }], ['value[0].id must be a string', 'value[0].nativeReference must be a string']],
    ['resolveWorkflow', CONTEXT, { ...WORKFLOW, digest: 1 }, ['value.digest must be a string']],
    ['resolveWorkflow', CONTEXT, { ...WORKFLOW, definition: { ...WORKFLOW.definition, stages: [{ id: 's', obligations: 'intake', origin: 'native', dependsOn: [] }] } }, ['value.definition.stages[0].obligations must be an array']],
    ['describeArtifacts', ITEM, [{ artifactId: 'a', stageId: 's', requires: [] }], ['value[0].present is missing']],
    ['describeArtifacts', ITEM, [{ artifactId: 'a', stageId: 's', requires: [], present: 'yes' }], ['value[0].present must be a boolean']],
    ['prepareStageInstructions', { ...ITEM, stageId: 'build' }, { ...INSTRUCTIONS, instructions: 42 }, ['value.instructions must be a string']],
    ['validateStructure', { ...ITEM, subject: REVISIONS }, { ...VALID_REPORT, reference: ['x'], approved: true }, ['value.approved is not a defined field', 'value.reference must be a string']],
    ['validateStructure', { ...ITEM, subject: REVISIONS }, { ...VALID_REPORT, verdict: 'invalid', problems: [{ message: 42 }] }, ['value.problems[0].message must be a string']],
    ['finalize', ITEM, { reference: 'r', revisions: [{ ...revision, digest: undefined }] }, ['value.revisions[0].digest must be a string']],
  ];
  const declared = { ...CAPABILITIES, optionalOperations: ['validateStructure', 'finalize'] };
  for (const [operation, request, value, messages] of cases) {
    assert.deepEqual(await shapeFindings(operation, request, value, declared), messages.map((message) => `shape shape: ${message}`), `${operation} ${messages[0]}`);
  }
});

test('an expected value that is not plain data is a fixture finding', async () => {
  const workItem = WORK_ITEMS[0]!;
  const fixtures: [unknown, string][] = [
    [new Array(1), 'expected.value has a hole at 0'],
    [[new Date(0)], 'expected.value[0] must be a plain object'],
    [[Object.defineProperty({ ...workItem }, 'approved', { value: true, enumerable: false })], 'expected.value[0].approved is not enumerable'],
    [[{ ...workItem, [Symbol('approved')]: true }], 'expected.value[0] has a symbol property'],
    [Object.defineProperty([workItem], 'extra', { value: 1, enumerable: false }), 'expected.value has the property extra, which is not an element'],
    [Object.assign([workItem], { [Symbol('extra')]: 1 }), 'expected.value has the property Symbol(extra), which is not an element'],
  ];
  for (const [expected, message] of fixtures) {
    const testCase = { name: 'fixture', operation: 'discoverWorkItems', request: CONTEXT, expected: { ok: true, value: expected } } as unknown as SdlcConformanceCase;
    assert.deepEqual(await findings(framework(), [testCase]), [`fixture fixture: ${message}`]);
  }
});

test('a plugin that changes its request or a shared expected value cannot make a case pass', async () => {
  const stageCase: SdlcConformanceCase = {
    name: 'mutated request',
    operation: 'prepareStageInstructions',
    request: { ...ITEM, stageId: 'requested' },
    expected: { ok: true, value: { ...INSTRUCTIONS, stageId: 'wrong' } },
  };
  const mutating = framework({
    prepareStageInstructions: async (request) => {
      (request as { stageId: string }).stageId = 'wrong';
      return ok({ ...INSTRUCTIONS, stageId: request.stageId });
    },
  });
  assert.deepEqual(await findings(mutating, [stageCase]), ['mutated request shape: instructions are for stage wrong, not requested']);
  const shared = [{ id: 'expected', nativeReference: 'feature 12' }];
  const sharing = framework({ discoverWorkItems: async () => { shared[0]!.id = 'unexpected'; return ok(shared); } });
  const sharedCase: SdlcConformanceCase = { name: 'shared', operation: 'discoverWorkItems', request: CONTEXT, expected: { ok: true, value: shared } };
  const result = await findings(sharing, [sharedCase]);
  assert.equal(result.length, 1);
  assert.match(result[0]!, /^shared outcome: discoverWorkItems returned ok \[\{"id":"unexpected"/);
});

test('a change to a shared request in one case does not reach the next case', async () => {
  const request = { ...CONTEXT };
  const seen: string[] = [];
  const recording = framework({
    discoverWorkItems: async (received) => {
      seen.push(received.workingCopy);
      (received as { workingCopy: string }).workingCopy = 'changed';
      request.workingCopy = 'changed';
      return ok(WORK_ITEMS);
    },
  });
  const cases: SdlcConformanceCase[] = ['first', 'second'].map((name) => ({ name, operation: 'discoverWorkItems', request, expected: { ok: true, value: WORK_ITEMS } }));
  assert.deepEqual(await findings(recording, cases), []);
  assert.deepEqual(seen, [CONTEXT.workingCopy, CONTEXT.workingCopy]);
});

test('a request that is not plain data is a fixture finding and the plugin is not called', async () => {
  let calls = 0;
  const counted = framework({ discoverWorkItems: async () => { calls += 1; return ok(WORK_ITEMS); } });
  const testCase = { name: 'bad request', operation: 'discoverWorkItems', request: { workingCopy: new Date(0) }, expected: { ok: false, code: 'not-found' } } as unknown as SdlcConformanceCase;
  assert.deepEqual(await findings(counted, [testCase]), ['bad request fixture: request.workingCopy must be a plain object']);
  assert.equal(calls, 0);
});
