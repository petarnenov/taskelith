import type { ValueReader } from './conformance-case.js';
import {
  CHANGE_REQUEST_STATES,
  COMMIT_STATUS_STATES,
  WEBHOOK_EVENT_KINDS,
  type ChangeRequestData,
  type CommitStatusData,
  type MergeProtectionData,
  type MergeResult,
  type RunCredential,
  type SourceControlCapabilities,
  type WebhookEvent,
} from './source-control.js';
import {
  externalIdentifier,
  externalIdentifiers,
  flag,
  kernelIdentifier,
  nonEmptyText,
  oneOf,
  optional,
  readRecord,
  text,
  texts,
  type RecordShape,
} from './untrusted-shapes.js';

// The runtime shape of every value a source control plugin returns. Run
// identifiers are kernel ones; the SCM issues the other identifiers.

function reader<Value>(label: string, shape: RecordShape): ValueReader<Value> {
  return (value) => readRecord<Value>(label, value, shape);
}

export const readCapabilities = reader<SourceControlCapabilities>('capabilities', {
  mergeMethods: texts,
  reviewEvidence: texts,
});

export const readRunCredential = reader<RunCredential>('credential', {
  credentialId: externalIdentifier,
  runId: kernelIdentifier,
  secret: nonEmptyText,
  repositories: externalIdentifiers,
  permissions: texts,
  expiresAt: text,
});

export const readMergeProtection = reader<MergeProtectionData>('protection', {
  repository: externalIdentifier,
  branch: text,
  requiredStatuses: texts,
  bindsProvider: flag,
});

export const readChangeRequest = reader<ChangeRequestData>('changeRequest', {
  id: externalIdentifier,
  repository: externalIdentifier,
  baseBranch: text,
  headBranch: text,
  headCommit: externalIdentifier,
  state: oneOf(CHANGE_REQUEST_STATES),
  url: text,
});

export const readCommitStatus = reader<CommitStatusData>('status', {
  repository: externalIdentifier,
  commit: externalIdentifier,
  context: text,
  state: oneOf(COMMIT_STATUS_STATES),
});

export const readMergeResult = reader<MergeResult>('merge', {
  changeRequest: externalIdentifier,
  mergeCommit: externalIdentifier,
  method: text,
});

export const readWebhookEvent = reader<WebhookEvent>('event', {
  deliveryId: externalIdentifier,
  kind: oneOf(WEBHOOK_EVENT_KINDS),
  repository: externalIdentifier,
  changeRequest: optional(externalIdentifier),
  commit: optional(externalIdentifier),
});
