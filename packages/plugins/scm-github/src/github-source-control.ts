import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { draft } from '@taskelith/plugin-sdk';
import { GithubChangeRequests, GITHUB_MERGE_METHODS } from './change-requests.js';
import { GithubApi, type GithubConnection } from './github-api.js';
import { InstallationTokens } from './installation-tokens.js';
import { GithubRunCredentials, SYSTEM_CLOCK, type CredentialClock } from './run-credentials.js';
import { GithubWebhookVerifier } from './webhook-verifier.js';

export interface GithubSourceControlOptions extends GithubConnection {
  readonly webhookSecret: string;
  // The port merge methods that the repositories' settings allow.
  readonly mergeMethods: readonly string[];
  // Replaces the system clock, for tests against an emulated service.
  readonly clock?: CredentialClock;
}

// The port over one App installation. Review evidence is a required
// commit status, as the App cannot approve its own pull requests (D8 (a)).
export function createGithubSourceControl(options: GithubSourceControlOptions): Result<draft.SourceControlProvider> {
  const { appId, installationId, privateKey, mergeMethods, webhookSecret } = options;
  if ([appId, installationId, privateKey].some((setting) => setting.trim().length === 0)) {
    return err(failure('invalid', 'The App ID, installation ID, and private key must not be empty'));
  }
  if (mergeMethods.length === 0 || !mergeMethods.every((method) => Object.hasOwn(GITHUB_MERGE_METHODS, method))) {
    return err(failure('invalid', 'The merge methods must be a non-empty list of port merge methods'));
  }
  if (webhookSecret.length === 0) return err(failure('invalid', 'The webhook secret must not be empty'));
  const api = new GithubApi(options);
  const credentials = new GithubRunCredentials(new InstallationTokens(api, installationId), options.clock ?? SYSTEM_CLOCK);
  const changeRequests = new GithubChangeRequests(api, [...mergeMethods]);
  const webhooks = new GithubWebhookVerifier(webhookSecret);
  return ok(Object.freeze({
    capabilities: Object.freeze({ mergeMethods: Object.freeze([...mergeMethods]), reviewEvidence: Object.freeze(['required-status']) }),
    issueRunCredential: (request) => credentials.issueRunCredential(request),
    refreshRunCredential: (request) => credentials.refreshRunCredential(request),
    confirmRunCredentialAdoption: (request) => credentials.confirmRunCredentialAdoption(request),
    revokeRunCredential: (request) => credentials.revokeRunCredential(request),
    resolveRemoteUrl: (request) => changeRequests.resolveRemoteUrl(request),
    ensureMergeProtection: (request) => changeRequests.ensureMergeProtection(request),
    openChangeRequest: (request) => changeRequests.openChangeRequest(request),
    readChangeRequest: (request) => changeRequests.readChangeRequest(request),
    setCommitStatus: (request) => changeRequests.setCommitStatus(request),
    mergeChangeRequest: (request) => changeRequests.mergeChangeRequest(request),
    verifyWebhookDelivery: (delivery) => webhooks.verifyWebhookDelivery(delivery),
  } satisfies draft.SourceControlProvider));
}
