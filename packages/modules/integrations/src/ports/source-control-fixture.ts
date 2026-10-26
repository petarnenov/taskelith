import type { Result } from '@taskelith/kernel';
import type { ChangeRequestData, RunCredential, SourceControlProvider, WebhookDelivery } from './source-control.js';

export interface PreparedHead {
  readonly branch: string;
  readonly commit: string;
}

export interface SignedChangeRequestEvent {
  readonly kind: 'change-request';
  readonly repository: string;
  readonly changeRequest: string;
}

// The fixture acts on the service by its own native means, outside the
// plugin, to set up state and to observe what really happened.
export interface SourceControlConformanceFixture {
  readonly provider: SourceControlProvider;
  readonly projectRepository: string;
  readonly foreignRepository: string;
  readonly baseBranch: string;
  readonly mergeMethod: string;
  // The lower-case name of the header that carries a delivery's signature.
  readonly signatureHeader: string;
  prepareHeadBranch(): Promise<PreparedHead>;
  advanceHead(branch: string): Promise<string>;
  readBranchHead(branch: string): Promise<string>;
  attemptRead(credential: RunCredential, repository: string): Promise<Result<void>>;
  attemptWrite(credential: RunCredential, repository: string): Promise<Result<void>>;
  attemptBypassMerge(changeRequest: ChangeRequestData): Promise<Result<void>>;
  // The method, in port terms, by which this commit was merged.
  observeMergeMethod(mergeCommit: string): Promise<string>;
  signDelivery(event: SignedChangeRequestEvent): Promise<WebhookDelivery>;
  // A well-formed signature made with a secret other than the webhook's.
  signWithForeignSecret(event: SignedChangeRequestEvent): Promise<WebhookDelivery>;
}
