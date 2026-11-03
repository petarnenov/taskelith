import { createHmac, randomUUID } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type {
  RunCredential,
  SignedChangeRequestEvent,
  SourceControlConformanceFixture,
  SourceControlProvider,
  WebhookDelivery,
} from '@taskelith/integrations';
import type { ApiReply, GithubNativeClient } from './github-conformance-client.ts';
import { CONFORMANCE_BASE_BRANCH, CONFORMANCE_REPOSITORIES } from './github-conformance-settings.ts';

// The conformance fixture on GitHub.com: it sets up and observes state in
// the disposable repositories by the App's own token, outside the plugin.

export const CONFORMANCE_BRANCH_PREFIX = 'taskelith-conformance/';
const COMMIT_MARKER = 'taskelith-conformance commit';
const SIGNATURE_HEADER = 'x-hub-signature-256';
const PROBE_CONTEXT = 'taskelith-conformance/probe';
// A commit no token can see, for status probes where the fixture cannot.
const UNSEEN_COMMIT = '0'.repeat(40);
const INSTALLED: ReadonlySet<string> = new Set([CONFORMANCE_REPOSITORIES.project, CONFORMANCE_REPOSITORIES.foreign]);

export interface LiveFixtureOptions {
  readonly provider: SourceControlProvider;
  readonly client: GithubNativeClient;
  readonly webhookSecret: string;
}

interface CommitRef {
  readonly sha: string;
  readonly tree: string;
}

export function liveConformanceFixture({ provider, client, webhookSecret }: LiveFixtureOptions): SourceControlConformanceFixture {
  const repository = new DisposableRepository(client);
  const project = CONFORMANCE_REPOSITORIES.project;
  return {
    provider,
    projectRepository: project,
    projectRemoteUrl: `https://github.com/${project}.git`,
    foreignRepository: CONFORMANCE_REPOSITORIES.foreign,
    hiddenRepository: CONFORMANCE_REPOSITORIES.hidden,
    baseBranch: CONFORMANCE_BASE_BRANCH,
    mergeMethod: 'squash',
    signatureHeader: SIGNATURE_HEADER,
    prepareHeadBranch: () => repository.prepareHeadBranch(project),
    advanceHead: (branch) => repository.advanceHead(project, branch),
    readBranchHead: (branch) => repository.readBranchHead(project, branch),
    attemptAction: (credential, target, permission) => attemptAction(repository, credential, target, permission),
    attemptBypassMerge: async (changeRequest) => {
      const path = `/repos/${changeRequest.repository}/pulls/${changeRequest.id}/merge`;
      return outcome(await client.request('PUT', path, { merge_method: 'merge' }));
    },
    observeMergeMethod: (mergeCommit) => repository.mergeMethodOf(project, mergeCommit),
    signDelivery: async (event) => signedDelivery(event, webhookSecret),
    signWithForeignSecret: async (event) => signedDelivery(event, `${webhookSecret}-foreign`),
  };
}

// Native Git data operations; each head commit's message is recorded, so
// a rebase, which keeps the message, is told apart from a squash.
class DisposableRepository {
  private readonly messages = new Set<string>();

  readonly client: GithubNativeClient;

  constructor(client: GithubNativeClient) {
    this.client = client;
  }

  // Two commits, so that GitHub titles a squash after the pull request.
  async prepareHeadBranch(repository: string): Promise<{ branch: string; commit: string }> {
    const branch = `${CONFORMANCE_BRANCH_PREFIX}${randomUUID()}`;
    const base = await this.readCommit(repository, await this.readBranchHead(repository, CONFORMANCE_BASE_BRANCH));
    const first = await this.addCommit(repository, base, branch);
    const second = await this.addCommit(repository, first, branch);
    await this.expect(201, 'POST', `/repos/${repository}/git/refs`, { ref: `refs/heads/${branch}`, sha: second.sha });
    return { branch, commit: second.sha };
  }

  async advanceHead(repository: string, branch: string): Promise<string> {
    const head = await this.readCommit(repository, await this.readBranchHead(repository, branch));
    const next = await this.addCommit(repository, head, branch);
    await this.expect(200, 'PATCH', `/repos/${repository}/git/refs/heads/${branch}`, { sha: next.sha, force: false });
    return next.sha;
  }

  async readBranchHead(repository: string, branch: string): Promise<string> {
    const read = await this.expect(200, 'GET', `/repos/${repository}/git/ref/heads/${branch}`);
    return textAt(read, 'object', 'sha');
  }

  async mergeMethodOf(repository: string, commit: string): Promise<string> {
    const read = await this.expect(200, 'GET', `/repos/${repository}/git/commits/${commit}`);
    const parents = (read.data as { parents?: unknown } | null)?.parents;
    if (Array.isArray(parents) && parents.length === 2) return 'merge-commit';
    if (!Array.isArray(parents) || parents.length !== 1) return 'none';
    return this.messages.has(textAt(read, 'message')) ? 'rebase' : 'squash';
  }

  private async readCommit(repository: string, sha: string): Promise<CommitRef> {
    const read = await this.expect(200, 'GET', `/repos/${repository}/git/commits/${sha}`);
    return { sha, tree: textAt(read, 'tree', 'sha') };
  }

  private async addCommit(repository: string, parent: CommitRef, branch: string): Promise<CommitRef> {
    const message = `${COMMIT_MARKER} ${randomUUID()}`;
    const entry = { path: `conformance/${branch.slice(CONFORMANCE_BRANCH_PREFIX.length)}.txt`, mode: '100644', type: 'blob', content: `${message}\n` };
    const tree = await this.expect(201, 'POST', `/repos/${repository}/git/trees`, { base_tree: parent.tree, tree: [entry] });
    const treeSha = textAt(tree, 'sha');
    const commit = await this.expect(201, 'POST', `/repos/${repository}/git/commits`, { message, tree: treeSha, parents: [parent.sha] });
    this.messages.add(message);
    return { sha: textAt(commit, 'sha'), tree: treeSha };
  }

  // A fixture step that fails throws, which the suite reports as a
  // fixture finding.
  private async expect(status: number, method: string, path: string, body?: unknown): Promise<ApiReply> {
    const reply = await this.client.request(method, path, body);
    if (reply.status !== status) throw new Error(`the fixture's ${method} ${path} returned ${reply.status}`);
    return reply;
  }

  async probeBranch(repository: string): Promise<string> {
    if (!INSTALLED.has(repository)) return `${CONFORMANCE_BRANCH_PREFIX}absent`;
    return (await this.prepareHeadBranch(repository)).branch;
  }

  async probeCommit(repository: string): Promise<string> {
    return INSTALLED.has(repository) ? this.readBranchHead(repository, CONFORMANCE_BASE_BRANCH) : UNSEEN_COMMIT;
  }
}

// Code access goes through Git's smart HTTP with the credential's
// authorization; change request and status writes call the API.
async function attemptAction(
  repository: DisposableRepository,
  credential: RunCredential,
  target: string,
  permission: string,
): Promise<Result<void>> {
  const { client } = repository;
  switch (permission) {
    case 'read-code':
      return statusOutcome(await client.gitAdvertisement(target, 'git-upload-pack', credential.authorization));
    case 'write-code':
      return statusOutcome(await client.gitAdvertisement(target, 'git-receive-pack', credential.authorization));
    case 'write-change-requests': {
      const head = await repository.probeBranch(target);
      const body = { head, base: CONFORMANCE_BASE_BRANCH, title: 'Conformance probe' };
      return outcome(await client.requestWithToken(credential.secret, 'POST', `/repos/${target}/pulls`, body));
    }
    case 'write-statuses': {
      const path = `/repos/${target}/statuses/${await repository.probeCommit(target)}`;
      return outcome(await client.requestWithToken(credential.secret, 'POST', path, { state: 'pending', context: PROBE_CONTEXT }));
    }
    default:
      return err(failure('invalid', 'unknown permission'));
  }
}

function outcome(reply: ApiReply): Result<void> {
  return statusOutcome(reply.status);
}

export function statusOutcome(status: number): Result<void> {
  if (status >= 200 && status < 300) return ok(undefined);
  if ([401, 403, 404].includes(status)) return err(failure('forbidden', 'refused'));
  if (status === 405) return err(failure('precondition-failed', 'not mergeable'));
  return err(failure('internal', `status ${status}`));
}

function textAt(reply: ApiReply, ...path: string[]): string {
  let value: unknown = reply.data;
  for (const key of path) value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
  if (typeof value !== 'string') throw new Error(`a GitHub reply lacks ${path.join('.')}`);
  return value;
}

// A pull_request delivery as GitHub sends it: compact JSON, signed.
function signedDelivery(event: SignedChangeRequestEvent, secret: string): WebhookDelivery {
  const payload = {
    action: 'opened',
    number: Number(event.changeRequest),
    pull_request: { number: Number(event.changeRequest) },
    repository: { full_name: event.repository },
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const headers = { [SIGNATURE_HEADER]: signature, 'x-github-delivery': randomUUID(), 'x-github-event': 'pull_request' };
  return { headers, rawBody: new Uint8Array(rawBody) };
}
