import { err, failure, isFailureCode, parseIdentifier, type Failure, type FailureCode, type Result } from '@taskelith/kernel';
import { parseArtifactRevision, type ArtifactRevisionInput } from '../domain/artifact-revision.js';
import { parseContentDigest } from '../domain/content-digest.js';
import { STRUCTURAL_VERDICTS, parseEvidenceReference } from '../domain/gate-evidence.js';
import type { LifecycleObligation } from '../domain/lifecycle.js';
import { parseWorkItem, type WorkItemInput } from '../domain/work-item.js';
import { parseWorkflowDefinition } from '../domain/workflow-definition.js';
import {
  BOOLEAN_SHAPE,
  STRING_SHAPE,
  UNKNOWN_SHAPE,
  arrayOf,
  clonePlainCopy,
  copyPlainData,
  dictionaryOf,
  isSamePlainData,
  plainShapeProblems,
  recordOf,
  type PlainShape,
} from './plain-data.js';
import {
  OPTIONAL_SDLC_OPERATIONS,
  parseSdlcFrameworkCapabilities,
  type ArtifactRequirement,
  type FinalizationReport,
  type ParsedSdlcFrameworkCapabilities,
  type ResolvedWorkflow,
  type SdlcFramework,
  type SdlcOperation,
  type StageInstructions,
  type StructuralValidationReport,
} from './sdlc-framework.js';

// DRAFT (G1 item 6): a framework-neutral conformance suite. A plugin package's
// own tests run it with that package's fixtures and expected outputs and
// assert that the report has no findings. The suite is plain code without a
// test runner, so that any runner can drive it. Everything a plugin returns is
// checked at run time before it is used.

export type ExpectedOutcome<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly code: FailureCode };

type RequestOf<Operation extends SdlcOperation> = Parameters<SdlcFramework[Operation]>[0];
type ValueOf<Operation extends SdlcOperation> = Awaited<ReturnType<SdlcFramework[Operation]>> extends Result<infer Value> ? Value : never;

interface CaseOf<Operation extends SdlcOperation> {
  readonly name: string;
  readonly operation: Operation;
  readonly request: RequestOf<Operation>;
  readonly expected: ExpectedOutcome<ValueOf<Operation>>;
}

// One fixture: an operation, its request, and the outcome the plugin must
// return for it.
export type SdlcConformanceCase = { readonly [Operation in SdlcOperation]: CaseOf<Operation> }[SdlcOperation];

export type SdlcConformanceCheck = 'capabilities' | 'fixture' | 'threw' | 'result' | 'undeclared-operation' | 'outcome' | 'shape';

export interface SdlcConformanceFinding {
  readonly caseName: string;
  readonly check: SdlcConformanceCheck;
  readonly message: string;
}

export interface SdlcConformanceReport {
  readonly cases: number;
  readonly findings: readonly SdlcConformanceFinding[];
}

const CAPABILITIES_CASE = 'capabilities';

const REVISION_SHAPE = recordOf({ artifactId: STRING_SHAPE, digest: STRING_SHAPE, nativeReference: STRING_SHAPE });
const STAGE_SHAPE = recordOf({
  id: STRING_SHAPE,
  obligations: arrayOf(STRING_SHAPE),
  origin: STRING_SHAPE,
  dependsOn: arrayOf(STRING_SHAPE),
});

const VALUE_SHAPES: Readonly<Record<SdlcOperation, PlainShape>> = Object.freeze({
  discoverWorkItems: arrayOf(recordOf({ id: STRING_SHAPE, nativeReference: STRING_SHAPE })),
  resolveWorkflow: recordOf({
    definition: recordOf({ id: STRING_SHAPE, version: STRING_SHAPE, stages: arrayOf(STAGE_SHAPE) }),
    digest: STRING_SHAPE,
    upstreamToolVersion: STRING_SHAPE,
  }),
  describeArtifacts: arrayOf(recordOf({ artifactId: STRING_SHAPE, stageId: STRING_SHAPE, requires: arrayOf(STRING_SHAPE), present: BOOLEAN_SHAPE })),
  inspectArtifactRevisions: arrayOf(REVISION_SHAPE),
  prepareStageInstructions: recordOf({ stageId: STRING_SHAPE, instructions: STRING_SHAPE, inputs: arrayOf(REVISION_SHAPE), outputs: arrayOf(STRING_SHAPE) }),
  validateStructure: recordOf({
    validator: STRING_SHAPE,
    verdict: STRING_SHAPE,
    reference: STRING_SHAPE,
    problems: arrayOf(recordOf({ artifactId: STRING_SHAPE, message: STRING_SHAPE }, ['artifactId'])),
  }),
  finalize: recordOf({ reference: STRING_SHAPE, revisions: arrayOf(REVISION_SHAPE) }),
});

const OK_SHAPE = recordOf({ ok: BOOLEAN_SHAPE, value: UNKNOWN_SHAPE });
const FAILURE_SHAPE = recordOf({ ok: BOOLEAN_SHAPE, error: recordOf({ code: STRING_SHAPE, message: STRING_SHAPE, details: dictionaryOf(STRING_SHAPE) }) });

export async function runSdlcFrameworkConformance(
  framework: SdlcFramework,
  cases: readonly SdlcConformanceCase[],
): Promise<SdlcConformanceReport> {
  const capabilities = readCapabilities(framework);
  if (!capabilities.ok) return conformanceReport(0, [finding(CAPABILITIES_CASE, 'capabilities', capabilities.error.message)]);
  // Every case is copied before the plugin runs, so that a plugin cannot
  // change a request or an expected outcome that the suite later checks.
  const snapshots = cases.map(snapshotCase);
  const findings: SdlcConformanceFinding[] = [];
  for (const snapshot of snapshots) {
    findings.push(...(snapshot.ok ? await checkCase(framework, capabilities.value, snapshot.value) : snapshot.error));
  }
  return conformanceReport(cases.length, findings);
}

function snapshotCase(testCase: SdlcConformanceCase): Result<SdlcConformanceCase, SdlcConformanceFinding[]> {
  const request = copyPlainData('request', testCase.request);
  const expected = snapshotExpected(testCase.expected);
  if (!request.ok || !expected.ok) {
    const problems = [...(request.ok ? [] : request.error), ...(expected.ok ? [] : expected.error)];
    return { ok: false, error: problems.map((problem) => finding(testCase.name, 'fixture', problem)) };
  }
  return { ok: true, value: { ...testCase, request: request.value, expected: expected.value } as SdlcConformanceCase };
}

function snapshotExpected(expected: ExpectedOutcome<unknown>): Result<ExpectedOutcome<unknown>, readonly string[]> {
  if (!expected.ok) return { ok: true, value: expected };
  const value = copyPlainData('expected.value', expected.value);
  return value.ok ? { ok: true, value: { ok: true, value: value.value } } : value;
}

// Reading the property itself may run a plugin getter.
function readCapabilities(framework: SdlcFramework): Result<ParsedSdlcFrameworkCapabilities> {
  try {
    return parseSdlcFrameworkCapabilities(framework.capabilities);
  } catch (error) {
    return err(failure('invalid', `capabilities could not be read: ${describe(error)}`, { field: 'capabilities' }));
  }
}

async function checkCase(
  framework: SdlcFramework,
  capabilities: ParsedSdlcFrameworkCapabilities,
  testCase: SdlcConformanceCase,
): Promise<SdlcConformanceFinding[]> {
  let raw: unknown;
  try {
    raw = await invoke(framework, testCase);
  } catch (error) {
    return [finding(testCase.name, 'threw', `${testCase.operation} threw instead of returning a Result: ${describe(error)}`)];
  }
  return evaluate(capabilities, testCase, raw);
}

// The plugin gets its own copy of the request, which it may change freely.
function invoke(framework: SdlcFramework, testCase: SdlcConformanceCase): Promise<unknown> {
  const operation = framework[testCase.operation] as (request: unknown) => Promise<unknown>;
  return operation.call(framework, clonePlainCopy(testCase.request));
}

function evaluate(capabilities: ParsedSdlcFrameworkCapabilities, testCase: SdlcConformanceCase, raw: unknown): SdlcConformanceFinding[] {
  const envelope = readResult(raw);
  if (!envelope.ok) return envelope.error.map((problem) => finding(testCase.name, 'result', problem));
  const actual = envelope.value;
  const findings: SdlcConformanceFinding[] = [];
  if (isUndeclared(testCase.operation, capabilities) && !isFailureWithCode(actual, 'unavailable')) {
    findings.push(finding(testCase.name, 'undeclared-operation', `${testCase.operation} is not declared and must fail with unavailable`));
  }
  if (!matchesExpected(actual, testCase.expected)) {
    findings.push(finding(testCase.name, 'outcome', `${testCase.operation} returned ${describeOutcome(actual)}, not the expected outcome`));
  }
  if (actual.ok) {
    for (const problem of valueProblems(testCase, actual.value, capabilities)) findings.push(finding(testCase.name, 'shape', problem));
  }
  return findings;
}

// A copy of a kernel Result: `ok` true with a value, or `ok` false with a
// failure whose code is a kernel failure code.
function readResult(raw: unknown): Result<Result<unknown>, readonly string[]> {
  const copy = copyPlainData('result', raw);
  if (!copy.ok) return copy;
  const result = copy.value as { readonly ok?: unknown; readonly value?: unknown; readonly error?: unknown } | null;
  if (typeof result !== 'object' || result === null || typeof result.ok !== 'boolean') {
    return { ok: false, error: ['the operation did not resolve to a Result'] };
  }
  const problems = plainShapeProblems('result', result, result.ok ? OK_SHAPE : FAILURE_SHAPE);
  if (problems.length > 0) return { ok: false, error: problems };
  if (result.ok) return { ok: true, value: { ok: true, value: result.value } };
  const error = result.error as Failure;
  if (!isFailureCode(error.code)) return { ok: false, error: [`result.error.code ${error.code} is not a kernel failure code`] };
  return { ok: true, value: { ok: false, error } };
}

function isUndeclared(operation: SdlcOperation, capabilities: ParsedSdlcFrameworkCapabilities): boolean {
  return (OPTIONAL_SDLC_OPERATIONS as readonly string[]).includes(operation)
    && !(capabilities.optionalOperations as readonly string[]).includes(operation);
}

function isFailureWithCode(result: Result<unknown>, code: FailureCode): boolean {
  return !result.ok && result.error.code === code;
}

function matchesExpected(actual: Result<unknown>, expected: ExpectedOutcome<unknown>): boolean {
  if (expected.ok) return actual.ok && isSamePlainData(actual.value, expected.value);
  return isFailureWithCode(actual, expected.code);
}

function describeOutcome(result: Result<unknown>): string {
  return result.ok ? `ok ${describe(result.value)}` : `failure ${result.error.code}`;
}

function describe(value: unknown): string {
  try {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    return JSON.stringify(value) ?? String(value);
  } catch {
    return 'an unprintable value';
  }
}

// Structure first, so that the domain parsers and the rules below only see
// values of the declared types.
function valueProblems(testCase: SdlcConformanceCase, value: unknown, capabilities: ParsedSdlcFrameworkCapabilities): string[] {
  const shape = plainShapeProblems('value', value, VALUE_SHAPES[testCase.operation]);
  if (shape.length > 0) return shape;
  switch (testCase.operation) {
    case 'discoverWorkItems': return workItemProblems(value as readonly WorkItemInput[]);
    case 'resolveWorkflow': return workflowProblems(value as ResolvedWorkflow, capabilities.nativeObligations);
    case 'describeArtifacts': return requirementProblems(value as readonly ArtifactRequirement[]);
    case 'inspectArtifactRevisions': return revisionProblems('value', value as readonly ArtifactRevisionInput[]);
    case 'prepareStageInstructions': return instructionProblems(value as StageInstructions, testCase.request.stageId);
    case 'validateStructure': return validationProblems(value as StructuralValidationReport);
    case 'finalize': return finalizationProblems(value as FinalizationReport);
  }
}

function workItemProblems(workItems: readonly WorkItemInput[]): string[] {
  const problems = workItems.flatMap((workItem, index) => failed(`value[${index}]`, parseWorkItem(workItem)));
  const ids = workItems.map((workItem) => workItem.id);
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
  return [...problems, ...repeated.map((id) => `work item ${id} is listed twice`)];
}

function workflowProblems(workflow: ResolvedWorkflow, declared: readonly LifecycleObligation[]): string[] {
  const problems = [
    ...failed('value.digest', parseContentDigest(workflow.digest)),
    ...failed('value.upstreamToolVersion', parseIdentifier('ToolVersion', workflow.upstreamToolVersion)),
  ];
  const definition = parseWorkflowDefinition(workflow.definition);
  if (!definition.ok) return [...problems, `value.definition: ${definition.error.message}`];
  const covered = new Set(definition.value.stages.filter((stage) => stage.origin === 'native').flatMap((stage) => stage.obligations));
  for (const obligation of declared) {
    if (!covered.has(obligation)) problems.push(`native obligation ${obligation} is declared but no native stage covers it`);
  }
  for (const obligation of covered) {
    if (!declared.includes(obligation)) problems.push(`a native stage covers ${obligation}, which is not a declared native obligation`);
  }
  return problems;
}

function requirementProblems(requirements: readonly ArtifactRequirement[]): string[] {
  return requirements.flatMap((requirement, index) => [
    ...failed(`value[${index}].artifactId`, parseIdentifier('ArtifactId', requirement.artifactId)),
    ...failed(`value[${index}].stageId`, parseIdentifier('StageId', requirement.stageId)),
    ...requirement.requires.flatMap((artifactId) => failed(`value[${index}].requires`, parseIdentifier('ArtifactId', artifactId))),
  ]);
}

function revisionProblems(path: string, revisions: readonly ArtifactRevisionInput[]): string[] {
  return revisions.flatMap((revision, index) => failed(`${path}[${index}]`, parseArtifactRevision(revision)));
}

function instructionProblems(instructions: StageInstructions, requestedStage: string): string[] {
  const problems = [
    ...failed('value.stageId', parseIdentifier('StageId', instructions.stageId)),
    ...revisionProblems('value.inputs', instructions.inputs),
    ...instructions.outputs.flatMap((artifactId) => failed('value.outputs', parseIdentifier('ArtifactId', artifactId))),
  ];
  if (instructions.stageId !== requestedStage) problems.push(`instructions are for stage ${instructions.stageId}, not ${requestedStage}`);
  if (instructions.instructions.length === 0) problems.push('instructions are empty');
  return problems;
}

function validationProblems(report: StructuralValidationReport): string[] {
  const problems = [
    ...failed('value.validator', parseIdentifier('ValidatorId', report.validator)),
    ...failed('value.reference', parseEvidenceReference(report.reference)),
    ...report.problems.flatMap((problem, index) => [
      ...(problem.artifactId === undefined ? [] : failed(`value.problems[${index}].artifactId`, parseIdentifier('ArtifactId', problem.artifactId))),
      ...(problem.message.length === 0 ? [`value.problems[${index}].message is empty`] : []),
    ]),
  ];
  if (!(STRUCTURAL_VERDICTS as readonly string[]).includes(report.verdict)) {
    problems.push(`verdict must be one of ${STRUCTURAL_VERDICTS.join(', ')}`);
  } else if ((report.verdict === 'valid') !== (report.problems.length === 0)) {
    problems.push('a valid report has no problems and an invalid report has at least one');
  }
  return problems;
}

function finalizationProblems(report: FinalizationReport): string[] {
  return [...failed('value.reference', parseEvidenceReference(report.reference)), ...revisionProblems('value.revisions', report.revisions)];
}

function failed(path: string, result: Result<unknown>): string[] {
  return result.ok ? [] : [`${path}: ${result.error.message}`];
}

function finding(caseName: string, check: SdlcConformanceCheck, message: string): SdlcConformanceFinding {
  return Object.freeze({ caseName, check, message });
}

function conformanceReport(cases: number, findings: readonly SdlcConformanceFinding[]): SdlcConformanceReport {
  return Object.freeze({ cases, findings: Object.freeze([...findings]) });
}
