import type { Result } from '@taskelith/kernel';

// Copies of the SdlcFramework port's plain shapes in @taskelith/sdlc, which
// plugin source cannot import yet; G1 item 12 settles that access.

export interface FrameworkContext {
  readonly workingCopy: string;
}

export interface WorkItemRequest extends FrameworkContext {
  readonly workItem: string;
}

export interface WorkflowRequest extends FrameworkContext {
  readonly workItem?: string;
}

export interface StageRequest extends WorkItemRequest {
  readonly stageId: string;
}

export interface ArtifactRevision {
  readonly artifactId: string;
  readonly digest: string;
  readonly nativeReference: string;
}

export interface StructuralValidationRequest extends WorkItemRequest {
  readonly subject: readonly ArtifactRevision[];
}

export interface WorkItem {
  readonly id: string;
  readonly nativeReference: string;
}

export interface Stage {
  readonly id: string;
  readonly obligations: readonly string[];
  readonly origin: string;
  readonly dependsOn: readonly string[];
}

export interface ResolvedWorkflow {
  readonly definition: { readonly id: string; readonly version: string; readonly stages: readonly Stage[] };
  readonly digest: string;
  readonly upstreamToolVersion: string;
}

export interface ArtifactRequirement {
  readonly artifactId: string;
  readonly stageId: string;
  readonly requires: readonly string[];
  readonly present: boolean;
}

export interface StageInstructions {
  readonly stageId: string;
  readonly instructions: string;
  readonly inputs: readonly ArtifactRevision[];
  readonly outputs: readonly string[];
}

export interface ValidationProblem {
  readonly artifactId?: string;
  readonly message: string;
}

export interface StructuralValidationReport {
  readonly validator: string;
  readonly verdict: string;
  readonly reference: string;
  readonly problems: readonly ValidationProblem[];
}

export interface FinalizationReport {
  readonly reference: string;
  readonly revisions: readonly ArtifactRevision[];
}

export interface SdlcFrameworkCapabilities {
  readonly optionalOperations: readonly string[];
  readonly nativeObligations: readonly string[];
}

export interface SdlcFramework {
  readonly capabilities: SdlcFrameworkCapabilities;
  discoverWorkItems(request: FrameworkContext): Promise<Result<readonly WorkItem[]>>;
  resolveWorkflow(request: WorkflowRequest): Promise<Result<ResolvedWorkflow>>;
  describeArtifacts(request: WorkItemRequest): Promise<Result<readonly ArtifactRequirement[]>>;
  inspectArtifactRevisions(request: WorkItemRequest): Promise<Result<readonly ArtifactRevision[]>>;
  prepareStageInstructions(request: StageRequest): Promise<Result<StageInstructions>>;
  validateStructure(request: StructuralValidationRequest): Promise<Result<StructuralValidationReport>>;
  finalize(request: WorkItemRequest): Promise<Result<FinalizationReport>>;
}
