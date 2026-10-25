export { InMemoryAdmissionRepository } from './adapters/in-memory-admission-repository.js';
export { InMemoryGateRepository } from './adapters/in-memory-gate-repository.js';
export { InMemoryOutbox } from './adapters/in-memory-outbox.js';
export { InMemoryWorkflowRunRepository } from './adapters/in-memory-workflow-run-repository.js';
export { TaskAdmissionService, type CreatedRevisionOutcome } from './application/task-admission-service.js';
export {
  isSameArtifactRevision,
  parseArtifactRevision,
  type ArtifactId,
  type ArtifactRevision,
  type ArtifactRevisionInput,
} from './domain/artifact-revision.js';
export { parseContentDigest, type ContentDigest } from './domain/content-digest.js';
export {
  LIFECYCLE_OBLIGATIONS,
  STAGE_ORIGINS,
  parseLifecycleObligation,
  parseStageOrigin,
  type LifecycleObligation,
  type StageOrigin,
} from './domain/lifecycle.js';
export {
  EVIDENCE_KINDS,
  MAX_EVIDENCE_REFERENCE_LENGTH,
  PLATFORM_RECORD_VERDICTS,
  SEMANTIC_VERDICTS,
  STRUCTURAL_VERDICTS,
  isPassingEvidence,
  parseEvidenceKind,
  parseEvidenceReference,
  parsePlatformRecord,
  parseSemanticApproval,
  parseStructuralValidation,
  type ApproverId,
  type EvidenceKind,
  type EvidenceReference,
  type GateEvidence,
  type PlatformRecord,
  type PlatformRecordInput,
  type PlatformRecordVerdict,
  type RecorderId,
  type SemanticApproval,
  type SemanticApprovalInput,
  type SemanticVerdict,
  type StructuralValidation,
  type StructuralValidationInput,
  type StructuralVerdict,
  type ValidatorId,
} from './domain/gate-evidence.js';
export type { GateSubject } from './domain/gate-subject.js';
export {
  GATE_STATES,
  GATE_TRANSITIONS,
  MAX_BLOCK_REASON_LENGTH,
  blockGate,
  isGateOutdatedBy,
  markGateStale,
  openGate,
  parseBlockReason,
  recordGateEvidence,
  reopenGate,
  type BlockReason,
  type Gate,
  type GateId,
  type GateInput,
  type GateState,
} from './domain/gate.js';
export { FIRST_GENERATION, checkGeneration, nextGeneration, parseGeneration, type Generation } from './domain/generation.js';
export {
  FIRST_OWNERSHIP_GENERATION,
  nextOwnershipGeneration,
  parseOwnershipGeneration,
  type OwnershipGeneration,
} from './domain/ownership-generation.js';
export { MAX_NATIVE_REFERENCE_LENGTH, parseNativeReference, type NativeReference } from './domain/native-reference.js';
export {
  STAGE_STATES,
  STAGE_TRANSITIONS,
  beginWorkflowProgress,
  completeStage,
  hasStagePassed,
  startStage,
  type StageProgress,
  type StageState,
  type WorkflowProgress,
} from './domain/stage-progress.js';
export {
  ADMISSION_STATES,
  ADMISSION_TRANSITIONS,
  TASK_KINDS,
  admitImplementationTask,
  admitPlanningTask,
  invalidateAdmission,
  isAdmissionOutdatedBy,
  recordCreatedRevision,
  useAdmission,
  type AdmissionId,
  type AdmissionState,
  type GatedRunContext,
  type RunContext,
  type TaskAdmission,
  type TaskAdmissionRequest,
  type TaskId,
  type TaskKind,
} from './domain/task-admission.js';
export { parseWorkItem, type WorkItem, type WorkItemId, type WorkItemInput } from './domain/work-item.js';
export {
  parseWorkflowDefinition,
  type Stage,
  type StageId,
  type StageInput,
  type WorkflowDefinition,
  type WorkflowDefinitionInput,
  type WorkflowId,
  type WorkflowVersion,
} from './domain/workflow-definition.js';
export {
  parseWorkflowRunBinding,
  type ConfigurationRevision,
  type PluginId,
  type PluginVersion,
  type PolicyRevision,
  type ToolVersion,
  type WorkflowRunBinding,
  type WorkflowRunBindingInput,
} from './domain/workflow-run-binding.js';
export { beginWorkflowRun, type WorkflowRun, type WorkflowRunId, type WorkflowRunInput } from './domain/workflow-run.js';
export {
  OPTIONAL_SDLC_OPERATIONS,
  SDLC_FRAMEWORK_PORT_VERSION,
  type ArtifactRequirement,
  type ArtifactRevisionData,
  type FinalizationReport,
  type FrameworkContext,
  type OptionalSdlcOperation,
  type ResolvedWorkflow,
  type SdlcFramework,
  type SdlcFrameworkCapabilities,
  type SdlcOperation,
  type StageData,
  type StageInstructions,
  type StageRequest,
  type StructuralValidationReport,
  type StructuralValidationRequest,
  type ValidationProblem,
  type WorkItemData,
  type WorkItemRequest,
  type WorkflowDefinitionData,
  type WorkflowRequest,
} from './ports/sdlc-framework.js';
export { parseSdlcFrameworkCapabilities, type ParsedSdlcFrameworkCapabilities } from './ports/sdlc-framework-capabilities.js';
export {
  runSdlcFrameworkConformance,
  type ExpectedOutcome,
  type SdlcConformanceCase,
  type SdlcConformanceCheck,
  type SdlcConformanceFinding,
  type SdlcConformanceReport,
} from './ports/sdlc-framework-conformance.js';
export type { AdmissionRepository } from './ports/admission-repository.js';
export { expectCode, expectSame, expectSuccess, type ConformanceCase } from './ports/conformance-case.js';
export type { GateRepository } from './ports/gate-repository.js';
export type { Outbox, OutboxMessage } from './ports/outbox.js';
export {
  ADMISSION_REPOSITORY_CONFORMANCE,
  GATE_REPOSITORY_CONFORMANCE,
  OUTBOX_CONFORMANCE,
  WORKFLOW_RUN_REPOSITORY_CONFORMANCE,
  type OutboxConformanceTarget,
} from './ports/repository-conformance.js';
export type { WorkflowRunRepository } from './ports/workflow-run-repository.js';
export type { Clock } from './ports/clock.js';
