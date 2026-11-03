export {
  AUTO_MERGE_DEFAULT_ENABLED,
  CONFLICT_ATTEMPT_BUDGET,
  IN_FLIGHT_MERGE_STATES,
  MERGE_REQUEST_STATES,
  WITHDRAWAL_REASONS,
  type AutoMergeChange,
  type AutoMergeSetting,
  type AutoMergeSettings,
  type BranchName,
  type CodeHead,
  type IntegratedRevision,
  type ManualMerge,
  type MergeClaim,
  type MergeEnqueue,
  type MergeQueue,
  type MergeRequest,
  type MergeRequestId,
  type MergeRequestState,
  type MergeTransition,
  type Revision,
  type SettingChange,
  type WithdrawalReason,
} from './ports/auto-merge.js';
export {
  MAX_INTAKE_BODY_BYTES,
  MAX_INTAKE_TITLE_LENGTH,
  type IntakeItemData,
  type IntakeRequest,
  type IntakeSource,
  type IntakeSourceDescription,
} from './ports/intake-source.js';
export type {
  ChangeRequestLink,
  ProgressReport,
  SourceItemRef,
  SourceResolution,
  WriteBack,
} from './ports/write-back.js';
export * from './port.js';
export type { SourceControlConformanceCheck, SourceControlConformanceFinding } from './ports/conformance-case.js';
export { runSourceControlConformance, type SourceControlConformanceReport } from './ports/source-control-conformance.js';
export type {
  PreparedHead,
  SignedChangeRequestEvent,
  SourceControlConformanceFixture,
} from './ports/source-control-fixture.js';
export type {
  DeliveryRecording,
  EventlessDeliveries,
  ScmIntegrationId,
  ScmIntegrationVerifiers,
  ScmWebhookDeliveries,
} from './ports/webhook-receipt.js';
export { ScmWebhookReceiver, type ScmWebhookReceiverPorts, type WebhookReceipt } from './application/webhook-receiver.js';
export { normalizeOrigin, MAX_ORIGIN_LENGTH, type NormalizedOrigin } from './domain/normalized-origin.js';
export { MAX_SCM_SECRETS, ScmSecrets, type ScmIntegration } from './domain/scm-integration.js';
export {
  changedConfiguration,
  type ScmIntegrationChange,
  type ScmIntegrationIds,
  type ScmIntegrations,
  type ScmPluginDefect,
  type ScmPluginDefectKind,
  type ScmPluginDefects,
  type ScmPluginOperation,
  type ScmPlugins,
  type StoredScmConfiguration,
  type UnverifiableIntegrations,
  type UnverifiableReason,
} from './ports/scm-integrations.js';
export {
  SCM_INTEGRATION_AUDIT_KINDS,
  changeAudit,
  creationAudit,
  type ScmIntegrationAudit,
  type ScmIntegrationAuditEntry,
  type ScmIntegrationAuditEvent,
  type ScmIntegrationAuditKind,
} from './ports/scm-integration-audit.js';
export { SCM_INTEGRATION_AUDIT_CONFORMANCE, type ScmIntegrationAuditTarget } from './ports/scm-integration-audit-conformance.js';
export { InMemoryScmIntegrationAudit } from './adapters/in-memory-scm-integration-audit.js';
export {
  SCM_INTEGRATION_PAGE_SIZE,
  ScmIntegrationService,
  type ScmIntegrationCreation,
  type ScmIntegrationInvocation,
  type ScmIntegrationPage,
  type ScmIntegrationServicePorts,
  type ScmIntegrationUpdate,
} from './application/scm-integration-service.js';
export { StoredScmIntegrationVerifiers } from './application/stored-integration-verifiers.js';
export { InMemoryScmIntegrations } from './adapters/in-memory-scm-integrations.js';
export { SCM_INTEGRATIONS_CONFORMANCE } from './ports/scm-integrations-conformance.js';
export { NoMergeQueue } from './adapters/no-merge-queue.js';
export {
  integrationMoved,
  nextBinding,
  type BindableProjects,
  type BindingPut,
  type RepositoryBinding,
  type RepositoryBindings,
  type RepositoryBindingValues,
} from './ports/repository-bindings.js';
export { REPOSITORY_BINDINGS_CONFORMANCE, type RepositoryBindingsTarget } from './ports/repository-bindings-conformance.js';
export {
  RepositoryBindingService,
  type RepositoryBindingRequest,
  type RepositoryBindingServicePorts,
  type RepositoryBindingUpdate,
} from './application/repository-binding-service.js';
export { InMemoryRepositoryBindings } from './adapters/in-memory-repository-bindings.js';
