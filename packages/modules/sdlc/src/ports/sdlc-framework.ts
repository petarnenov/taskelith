import { err, failure, ok, type Result } from '@taskelith/kernel';
import { parseLifecycleObligation, type LifecycleObligation } from '../domain/lifecycle.js';
import { STRING_SHAPE, arrayOf, copyPlainData, plainShapeProblems, recordOf } from './plain-data.js';

// The port a framework plugin implements, frozen as version 1 (ADR 0009).
// Plain text shapes, which the module parses: plugin output is untrusted.
export const SDLC_FRAMEWORK_PORT_VERSION = '1.0.0';

// The working copy the plugin reads, as an opaque location from the caller.
// Every work-item operation names its work item explicitly, so that no
// operation depends on a framework's implicit current item in the working copy.
export interface FrameworkContext {
  readonly workingCopy: string;
}

export interface WorkItemRequest extends FrameworkContext {
  readonly workItem: string;
}

// Without a work item, the workflow a new work item would get; with one, the
// workflow that work item uses, since a framework may select it per item.
export interface WorkflowRequest extends FrameworkContext {
  readonly workItem?: string;
}

export interface StageRequest extends WorkItemRequest {
  readonly stageId: string;
}

export interface StructuralValidationRequest extends WorkItemRequest {
  readonly subject: readonly ArtifactRevisionData[];
}

// The port's own shapes, so that a domain change cannot change the port.
export interface WorkItemData {
  readonly id: string;
  readonly nativeReference: string;
}

export interface ArtifactRevisionData {
  readonly artifactId: string;
  readonly digest: string;
  readonly nativeReference: string;
}

export interface StageData {
  readonly id: string;
  readonly obligations: readonly string[];
  readonly origin: string;
  readonly dependsOn: readonly string[];
}

export interface WorkflowDefinitionData {
  readonly id: string;
  readonly version: string;
  readonly stages: readonly StageData[];
}

// The workflow a new run is bound to: the native workflow as a stage graph,
// the digest of its exact native definition, and the upstream tool version.
export interface ResolvedWorkflow {
  readonly definition: WorkflowDefinitionData;
  readonly digest: string;
  readonly upstreamToolVersion: string;
}

// An artifact the work item needs, the stage that produces it, the artifacts it
// requires first, and whether it exists yet.
export interface ArtifactRequirement {
  readonly artifactId: string;
  readonly stageId: string;
  readonly requires: readonly string[];
  readonly present: boolean;
}

// Instructions for the agent task that performs a stage. The port prepares
// them; it never runs an agent step, which needs a harness.
export interface StageInstructions {
  readonly stageId: string;
  readonly instructions: string;
  readonly inputs: readonly ArtifactRevisionData[];
  readonly outputs: readonly string[];
}

export interface ValidationProblem {
  readonly artifactId?: string;
  readonly message: string;
}

// A structural check of form and references. It becomes structural-validation
// evidence and is never a semantic approval.
export interface StructuralValidationReport {
  readonly validator: string;
  readonly verdict: string;
  readonly reference: string;
  readonly problems: readonly ValidationProblem[];
}

export interface FinalizationReport {
  readonly reference: string;
  readonly revisions: readonly ArtifactRevisionData[];
}

// Operations a framework may lack; an undeclared one fails with `unavailable`,
// and the platform supplies a platform-managed gate or record instead.
export const OPTIONAL_SDLC_OPERATIONS = Object.freeze(['validateStructure', 'finalize'] as const);

export type OptionalSdlcOperation = (typeof OPTIONAL_SDLC_OPERATIONS)[number];

// What the plugin declares about its framework: the optional operations it
// supports and the lifecycle obligations its native stages cover.
export interface SdlcFrameworkCapabilities {
  readonly optionalOperations: readonly string[];
  readonly nativeObligations: readonly string[];
}

export interface ParsedSdlcFrameworkCapabilities {
  readonly optionalOperations: readonly OptionalSdlcOperation[];
  readonly nativeObligations: readonly LifecycleObligation[];
}

// Every operation reports expected outcomes as a kernel Result, using its
// failure codes, for example `not-found` for an unknown work item and
// `unavailable` for an undeclared operation or a missing tool. No operation
// approves anything: semantic approval and gate decisions are recorded by the
// platform, not returned by a plugin.
export interface SdlcFramework {
  readonly capabilities: SdlcFrameworkCapabilities;
  discoverWorkItems(request: FrameworkContext): Promise<Result<readonly WorkItemData[]>>;
  resolveWorkflow(request: WorkflowRequest): Promise<Result<ResolvedWorkflow>>;
  describeArtifacts(request: WorkItemRequest): Promise<Result<readonly ArtifactRequirement[]>>;
  inspectArtifactRevisions(request: WorkItemRequest): Promise<Result<readonly ArtifactRevisionData[]>>;
  prepareStageInstructions(request: StageRequest): Promise<Result<StageInstructions>>;
  validateStructure(request: StructuralValidationRequest): Promise<Result<StructuralValidationReport>>;
  finalize(request: WorkItemRequest): Promise<Result<FinalizationReport>>;
}

export type SdlcOperation = Exclude<keyof SdlcFramework, 'capabilities'>;

// The declaration comes from a plugin, so it is copied and its structure is
// checked at run time before its values are parsed.
export function parseSdlcFrameworkCapabilities(capabilities: unknown): Result<ParsedSdlcFrameworkCapabilities> {
  const copy = copyPlainData('capabilities', capabilities);
  if (!copy.ok) return structureFailure(copy.error);
  const shape = plainShapeProblems('capabilities', copy.value, CAPABILITIES_SHAPE);
  if (shape.length > 0) return structureFailure(shape);
  const declared = copy.value as SdlcFrameworkCapabilities;
  const optionalOperations: OptionalSdlcOperation[] = [];
  for (const text of declared.optionalOperations) {
    if (!(OPTIONAL_SDLC_OPERATIONS as readonly string[]).includes(text)) {
      return capabilityFailure('optionalOperations', `optional operation must be one of ${OPTIONAL_SDLC_OPERATIONS.join(', ')}`);
    }
    if (optionalOperations.includes(text as OptionalSdlcOperation)) {
      return capabilityFailure('optionalOperations', `operation ${text} is listed twice`);
    }
    optionalOperations.push(text as OptionalSdlcOperation);
  }
  const nativeObligations: LifecycleObligation[] = [];
  for (const text of declared.nativeObligations) {
    const obligation = parseLifecycleObligation(text);
    if (!obligation.ok) return capabilityFailure('nativeObligations', obligation.error.message);
    if (nativeObligations.includes(obligation.value)) return capabilityFailure('nativeObligations', `obligation ${text} is listed twice`);
    nativeObligations.push(obligation.value);
  }
  return ok(Object.freeze({
    optionalOperations: Object.freeze(optionalOperations),
    nativeObligations: Object.freeze(nativeObligations),
  }));
}

const CAPABILITIES_SHAPE = recordOf({ optionalOperations: arrayOf(STRING_SHAPE), nativeObligations: arrayOf(STRING_SHAPE) });

function structureFailure(problems: readonly string[]): Result<never> {
  return err(failure('invalid', problems.join('; '), { field: 'capabilities' }));
}

function capabilityFailure(field: keyof SdlcFrameworkCapabilities, message: string): Result<never> {
  return err(failure('invalid', `${field}: ${message}`, { field }));
}
