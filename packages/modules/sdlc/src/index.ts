export { InMemoryAdmissionRepository } from './adapters/in-memory-admission-repository.js';
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
export { parseGeneration, type Generation } from './domain/generation.js';
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
export type { Clock } from './ports/clock.js';
