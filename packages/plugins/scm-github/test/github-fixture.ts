import { createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { RunCredential, SignedChangeRequestEvent, SourceControlConformanceFixture, SourceControlProvider } from '@taskelith/integrations';
import { createGithubSourceControl, type GithubSourceControlOptions } from '@taskelith/scm-github';
import { API_URL, GIT_URL, GithubEmulator, type EmulatorSetup } from './github-emulator.ts';

// The plugin over the emulated GitHub, with the conformance fixture's
// native helpers acting on the emulator directly.

export const PROJECT = 'acme/project';
export const FOREIGN = 'acme/other';
export const HIDDEN = 'acme/hidden';
export const WEBHOOK_SECRET = 'synthetic-webhook-secret';
const APP_ID = '1234';
const INSTALLATION_ID = '5678';
const BASE = 'main';
const SIGNATURE_HEADER = 'x-hub-signature-256';

// Generated per test run, so no private key is stored in the repository.
const APP_KEYS = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_KEY = APP_KEYS.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

export interface GithubTestbed {
  readonly emulator: GithubEmulator;
  readonly provider: SourceControlProvider;
  readonly options: GithubSourceControlOptions;
}

export function githubTestbed(
  overrides: Partial<GithubSourceControlOptions> = {},
  setup: Partial<Omit<EmulatorSetup, 'appId' | 'installationId' | 'appPublicKey' | 'installed'>> = {},
): GithubTestbed {
  const emulator = new GithubEmulator({
    appId: APP_ID,
    installationId: INSTALLATION_ID,
    appPublicKey: APP_KEYS.publicKey,
    installed: [PROJECT, FOREIGN],
    ...setup,
  });
  const options = {
    appId: APP_ID,
    installationId: INSTALLATION_ID,
    privateKey: PRIVATE_KEY,
    baseUrl: API_URL,
    fetch: emulator.fetch,
    webhookSecret: WEBHOOK_SECRET,
    mergeMethods: ['merge-commit', 'squash', 'rebase'],
    clock: { now: () => emulator.now(), sleep: async (milliseconds: number) => emulator.advance(milliseconds) },
    ...overrides,
  };
  const provider = createGithubSourceControl(options);
  if (!provider.ok) throw new Error(provider.error.message);
  return { emulator, provider: provider.value, options };
}

export function conformanceFixture({ emulator, provider }: GithubTestbed): SourceControlConformanceFixture {
  return {
    provider,
    projectRepository: PROJECT,
    projectRemoteUrl: `${GIT_URL}/${PROJECT}.git`,
    foreignRepository: FOREIGN,
    hiddenRepository: HIDDEN,
    baseBranch: BASE,
    mergeMethod: 'squash',
    signatureHeader: SIGNATURE_HEADER,
    prepareHeadBranch: async () => {
      const branch = `topic-${randomUUID()}`;
      return { branch, commit: emulator.createBranch(PROJECT, branch) };
    },
    advanceHead: async (branch) => emulator.createBranch(PROJECT, branch),
    readBranchHead: async (branch) => emulator.branchHead(PROJECT, branch),
    attemptAction: (credential, repository, permission) => attemptAction(emulator, credential, repository, permission),
    attemptBypassMerge: async (changeRequest) => {
      const token = emulator.installationToken();
      const path = `/repos/${changeRequest.repository}/pulls/${changeRequest.id}/merge`;
      return outcome(await apiCall(emulator, token, 'PUT', path, { merge_method: 'merge' }));
    },
    observeMergeMethod: async (mergeCommit) => emulator.methodOf(mergeCommit),
    signDelivery: async (event) => signedDelivery(event, WEBHOOK_SECRET),
    signWithForeignSecret: async (event) => signedDelivery(event, 'another-secret'),
  };
}

// Code access sends the credential's authorization as Git does; change
// request and status writes call the API with the token.
async function attemptAction(emulator: GithubEmulator, credential: RunCredential, repository: string, permission: string): Promise<Result<void>> {
  const headers = { authorization: credential.authorization };
  switch (permission) {
    case 'read-code':
      return outcome(await emulator.fetch(`${GIT_URL}/${repository}.git/info/refs?service=git-upload-pack`, { headers }));
    case 'write-code':
      return outcome(await emulator.fetch(`${GIT_URL}/${repository}.git/git-receive-pack`, { method: 'POST', headers }));
    case 'write-change-requests': {
      const head = `probe-${randomUUID()}`;
      emulator.createBranch(repository, head);
      return outcome(await apiCall(emulator, credential.secret, 'POST', `/repos/${repository}/pulls`, { head, base: BASE, title: 'probe' }));
    }
    case 'write-statuses': {
      const path = `/repos/${repository}/statuses/${emulator.branchHead(repository, BASE)}`;
      return outcome(await apiCall(emulator, credential.secret, 'POST', path, { state: 'pending', context: 'probe' }));
    }
    default:
      return err(failure('invalid', 'unknown permission'));
  }
}

function apiCall(emulator: GithubEmulator, token: string, method: string, path: string, body: unknown): Promise<Response> {
  return emulator.fetch(`${API_URL}${path}`, {
    method,
    headers: { authorization: `token ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function outcome(response: Response): Result<void> {
  if (response.ok) return ok(undefined);
  if ([401, 403, 404].includes(response.status)) return err(failure('forbidden', 'refused'));
  if (response.status === 405) return err(failure('precondition-failed', 'not mergeable'));
  return err(failure('internal', `status ${response.status}`));
}

// A pull_request delivery as GitHub sends it, compact JSON with its
// delivery GUID.
export function signedDelivery(event: SignedChangeRequestEvent, secret: string, deliveryId: string = randomUUID()) {
  const payload = {
    action: 'opened',
    number: Number(event.changeRequest),
    pull_request: { number: Number(event.changeRequest), head: { sha: 'abc123' } },
    repository: { full_name: event.repository },
  };
  return signedBody(Buffer.from(JSON.stringify(payload)), secret, deliveryId, 'pull_request');
}

export function signedBody(rawBody: Uint8Array, secret: string, deliveryId: string, event: string) {
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const headers = { [SIGNATURE_HEADER]: signature, 'x-github-delivery': deliveryId, 'x-github-event': event };
  return { headers, rawBody: new Uint8Array(rawBody) };
}
