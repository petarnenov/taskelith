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
import { flag, identifier, oneOf, optional, readRecord, text, texts, type RecordShape } from './untrusted-shapes.js';

// The runtime shape of every value a source control plugin returns.

function reader<Value>(label: string, shape: RecordShape): ValueReader<Value> {
  return (value) => readRecord<Value>(label, value, shape);
}

export const readCapabilities = reader<SourceControlCapabilities>('capabilities', {
  mergeMethods: texts,
  reviewEvidence: texts,
});

export const readRunCredential = reader<RunCredential>('credential', {
  credentialId: identifier,
  runId: text,
  secret: identifier,
  repositories: texts,
  permissions: texts,
  expiresAt: text,
});

export const readMergeProtection = reader<MergeProtectionData>('protection', {
  repository: text,
  branch: text,
  requiredStatuses: texts,
  bindsProvider: flag,
});

export const readChangeRequest = reader<ChangeRequestData>('changeRequest', {
  id: identifier,
  repository: text,
  baseBranch: text,
  headBranch: text,
  headCommit: identifier,
  state: oneOf(CHANGE_REQUEST_STATES),
  url: text,
});

export const readCommitStatus = reader<CommitStatusData>('status', {
  repository: text,
  commit: text,
  context: text,
  state: oneOf(COMMIT_STATUS_STATES),
});

export const readMergeResult = reader<MergeResult>('merge', {
  changeRequest: text,
  mergeCommit: identifier,
  method: text,
});

export const readWebhookEvent = reader<WebhookEvent>('event', {
  deliveryId: identifier,
  kind: oneOf(WEBHOOK_EVENT_KINDS),
  repository: text,
  changeRequest: optional(text),
  commit: optional(text),
});
