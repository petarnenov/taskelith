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
export { ScmSecrets, type ScmIntegration } from './domain/scm-integration.js';
export type {
  ScmIntegrationChange,
  ScmIntegrationIds,
  ScmIntegrations,
  ScmPlugins,
  StoredScmConfiguration,
} from './ports/scm-integrations.js';
export {
  SCM_INTEGRATION_PAGE_SIZE,
  ScmIntegrationService,
  type ScmIntegrationCreation,
  type ScmIntegrationPage,
  type ScmIntegrationServicePorts,
  type ScmIntegrationUpdate,
} from './application/scm-integration-service.js';
export { StoredScmIntegrationVerifiers } from './application/stored-integration-verifiers.js';
export { InMemoryScmIntegrations } from './adapters/in-memory-scm-integrations.js';
export { SCM_INTEGRATIONS_CONFORMANCE } from './ports/scm-integrations-conformance.js';
