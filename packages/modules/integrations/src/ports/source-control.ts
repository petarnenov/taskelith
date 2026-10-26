import type { Result } from '@taskelith/kernel';

// The port an SCM plugin implements, a draft until a second SCM maps onto it.
// Plain text shapes, which the module checks: plugin output is untrusted.
export const SOURCE_CONTROL_PORT_VERSION = '0.1.0';

// Permissions a run may need, in SCM-neutral terms; a plugin maps each one to
// its service's narrowest native permission.
export const SCM_PERMISSIONS = Object.freeze([
  'read-code',
  'write-code',
  'write-change-requests',
  'write-statuses',
] as const);

export type ScmPermission = (typeof SCM_PERMISSIONS)[number];

export const MERGE_METHODS = Object.freeze(['merge-commit', 'squash', 'rebase'] as const);

export type MergeMethod = (typeof MERGE_METHODS)[number];

export const COMMIT_STATUS_STATES = Object.freeze(['pending', 'success', 'failure', 'error'] as const);

export type CommitStatusState = (typeof COMMIT_STATUS_STATES)[number];

export const CHANGE_REQUEST_STATES = Object.freeze(['open', 'closed', 'merged'] as const);

export type ChangeRequestState = (typeof CHANGE_REQUEST_STATES)[number];

// Repositories, change requests, commits, credentials, and deliveries are
// named by opaque strings, which the module compares and never parses.
export interface RepositoryRequest {
  readonly repository: string;
}

export interface RunCredentialRequest {
  readonly runId: string;
  readonly repositories: readonly string[];
  readonly permissions: readonly string[];
}

export interface RunCredentialReference {
  readonly credentialId: string;
}

// A credential for one run only. `secret` is delivered to that run and is
// never logged or stored; `permissions` are the effective ones granted.
export interface RunCredential {
  readonly credentialId: string;
  readonly runId: string;
  readonly secret: string;
  readonly repositories: readonly string[];
  readonly permissions: readonly string[];
  // A kernel Instant: UTC, YYYY-MM-DDTHH:mm:ss.sssZ.
  readonly expiresAt: string;
}

export interface RunCredentialIssuer {
  issueRunCredential(request: RunCredentialRequest): Promise<Result<RunCredential>>;
  refreshRunCredential(request: RunCredentialReference): Promise<Result<RunCredential>>;
  revokeRunCredential(request: RunCredentialReference): Promise<Result<void>>;
}

export interface MergeProtectionRequest extends RepositoryRequest {
  readonly branch: string;
  readonly requiredStatuses: readonly string[];
}

// Protection the service enforces; `bindsProvider` is true only when the
// plugin's own identity cannot bypass it.
export interface MergeProtectionData {
  readonly repository: string;
  readonly branch: string;
  readonly requiredStatuses: readonly string[];
  readonly bindsProvider: boolean;
}

export interface OpenChangeRequest extends RepositoryRequest {
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly title: string;
  readonly description: string;
}

export interface ChangeRequestReference extends RepositoryRequest {
  readonly changeRequest: string;
}

export interface ChangeRequestData {
  readonly id: string;
  readonly repository: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly headCommit: string;
  readonly state: string;
  readonly url: string;
}

// A status on one commit. Independent review is recorded this way (G3 plan
// D8 (a)), as a required status that merge protection enforces.
export interface CommitStatusRequest extends RepositoryRequest {
  readonly commit: string;
  readonly context: string;
  readonly state: string;
  readonly description: string;
  readonly targetUrl?: string;
}

export interface CommitStatusData {
  readonly repository: string;
  readonly commit: string;
  readonly context: string;
  readonly state: string;
}

// The merge names the head it expects, so that only the verified and
// reviewed head can merge, and the project's merge method.
export interface MergeRequest extends ChangeRequestReference {
  readonly expectedHead: string;
  readonly method: string;
}

export interface MergeResult {
  readonly changeRequest: string;
  readonly mergeCommit: string;
  readonly method: string;
}

// Plugin operations act as the plugin's own identity. A refused merge, such
// as one with a pending required status, fails with `precondition-failed`.
export interface ChangeRequestHost {
  ensureMergeProtection(request: MergeProtectionRequest): Promise<Result<MergeProtectionData>>;
  openChangeRequest(request: OpenChangeRequest): Promise<Result<ChangeRequestData>>;
  readChangeRequest(request: ChangeRequestReference): Promise<Result<ChangeRequestData>>;
  setCommitStatus(request: CommitStatusRequest): Promise<Result<CommitStatusData>>;
  mergeChangeRequest(request: MergeRequest): Promise<Result<MergeResult>>;
}

// A delivery as received: header names in lower case and the body bytes
// exactly as sent, because the signature covers the raw body.
export interface WebhookDelivery {
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: Uint8Array;
}

export const WEBHOOK_EVENT_KINDS = Object.freeze(['change-request', 'commit-status', 'push', 'other'] as const);

export type WebhookEventKind = (typeof WEBHOOK_EVENT_KINDS)[number];

// A verified delivery. A redelivery repeats `deliveryId`, by which the
// module deduplicates it.
export interface WebhookEvent {
  readonly deliveryId: string;
  readonly kind: string;
  readonly repository: string;
  readonly changeRequest?: string;
  readonly commit?: string;
}

export interface WebhookVerifier {
  verifyWebhookDelivery(delivery: WebhookDelivery): Promise<Result<WebhookEvent>>;
}

// Review evidence a plugin can carry: `required-status` is mandatory; a
// native approval by a separate reviewer identity may be added later.
export const REVIEW_EVIDENCE_KINDS = Object.freeze(['required-status', 'native-approval'] as const);

export type ReviewEvidenceKind = (typeof REVIEW_EVIDENCE_KINDS)[number];

export interface SourceControlCapabilities {
  readonly mergeMethods: readonly string[];
  readonly reviewEvidence: readonly string[];
}

// The whole plugin; clients depend on the narrower port they use.
export interface SourceControlProvider extends RunCredentialIssuer, ChangeRequestHost, WebhookVerifier {
  readonly capabilities: SourceControlCapabilities;
}
