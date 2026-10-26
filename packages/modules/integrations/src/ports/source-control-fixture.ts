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
// plugin, to set up state and to probe what a credential can really do.
export interface SourceControlConformanceFixture {
  readonly provider: SourceControlProvider;
  readonly projectRepository: string;
  readonly foreignRepository: string;
  readonly baseBranch: string;
  readonly mergeMethod: string;
  prepareHeadBranch(): Promise<PreparedHead>;
  advanceHead(branch: string): Promise<string>;
  readBranchHead(branch: string): Promise<string>;
  attemptWrite(credential: RunCredential, repository: string): Promise<Result<void>>;
  attemptBypassMerge(changeRequest: ChangeRequestData): Promise<Result<void>>;
  signDelivery(event: SignedChangeRequestEvent): Promise<WebhookDelivery>;
}
