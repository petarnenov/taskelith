import { createHmac, timingSafeEqual } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  COMMIT_STATUS_STATES,
  SCM_PERMISSIONS,
  type ChangeRequestData,
  type RunCredential,
  type SourceControlConformanceFixture,
  type SourceControlProvider,
  type WebhookDelivery,
} from '@taskelith/integrations';

// A test-only source control service with its plugin and fixture. Each
// defect switches off one guarantee, so the suite can be shown to report it.
export interface ScmDefects {
  readonly bypassableProtection?: boolean;
  readonly readOnlyCanWrite?: boolean;
  readonly unscopedCredentials?: boolean;
  readonly ignoresSignature?: boolean;
  readonly ignoresRequiredStatuses?: boolean;
  readonly ignoresExpectedHead?: boolean;
}

export const PROJECT = 'acme/project';
export const FOREIGN = 'acme/other';
const BASE = 'main';
const SIGNATURE = 'x-signature';
const DELIVERY = 'x-delivery';
const LIFETIME_MS = 60 * 60 * 1000;
const MERGE_METHODS = Object.freeze(['merge-commit', 'squash']);

interface Protection {
  readonly requiredStatuses: readonly string[];
  readonly bindsProvider: boolean;
}

interface StoredCredential {
  readonly credential: RunCredential;
  revoked: boolean;
}

interface StoredChangeRequest {
  readonly id: string;
  readonly repository: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  state: 'open' | 'closed' | 'merged';
}

export class InMemoryScm {
  private sequence = 0;
  private readonly branches = new Map<string, string>([[branchKey(PROJECT, BASE), 'c0'], [branchKey(FOREIGN, BASE), 'c0']]);
  private readonly protections = new Map<string, Protection>();
  private readonly statuses = new Map<string, string>();
  private readonly credentials = new Map<string, StoredCredential>();
  private readonly changeRequests = new Map<string, StoredChangeRequest>();
  private readonly webhookSecret = 'webhook-secret';

  private readonly defects: ScmDefects;

  constructor(defects: ScmDefects = {}) {
    this.defects = defects;
  }

  provider(): SourceControlProvider {
    return {
      capabilities: { mergeMethods: MERGE_METHODS, reviewEvidence: ['required-status'] },
      issueRunCredential: async (request) => this.issue(request.runId, request.repositories, request.permissions),
      refreshRunCredential: async ({ credentialId }) => this.refresh(credentialId),
      revokeRunCredential: async ({ credentialId }) => this.revoke(credentialId),
      ensureMergeProtection: async ({ repository, branch, requiredStatuses }) => {
        const protection = { requiredStatuses: [...requiredStatuses], bindsProvider: !this.defects.bypassableProtection };
        this.protections.set(branchKey(repository, branch), protection);
        return ok({ repository, branch, ...protection });
      },
      openChangeRequest: async (request) => this.open(request.repository, request.baseBranch, request.headBranch),
      readChangeRequest: async ({ changeRequest }) => this.read(changeRequest),
      setCommitStatus: async ({ repository, commit, context, state }) => {
        if (!(COMMIT_STATUS_STATES as readonly string[]).includes(state)) return err(failure('invalid', 'unknown state'));
        this.statuses.set(statusKey(repository, commit, context), state);
        return ok({ repository, commit, context, state });
      },
      mergeChangeRequest: async (request) => this.merge(request.changeRequest, request.expectedHead, request.method),
      verifyWebhookDelivery: async (delivery) => this.verify(delivery),
    };
  }

  fixture(provider: SourceControlProvider = this.provider()): SourceControlConformanceFixture {
    return {
      provider,
      projectRepository: PROJECT,
      foreignRepository: FOREIGN,
      baseBranch: BASE,
      mergeMethod: 'squash',
      prepareHeadBranch: async () => {
        const branch = `topic-${this.next()}`;
        return { branch, commit: this.push(PROJECT, branch) };
      },
      advanceHead: async (branch) => this.push(PROJECT, branch),
      attemptWrite: async (credential, repository) => this.write(credential.secret, repository),
      attemptBypassMerge: async (changeRequest) => this.bypassMerge(changeRequest),
      signDelivery: async (event) => this.sign(JSON.stringify(event)),
    };
  }

  private issue(runId: string, repositories: readonly string[], permissions: readonly string[]): Result<RunCredential> {
    if (!permissions.every((permission) => (SCM_PERMISSIONS as readonly string[]).includes(permission))) {
      return err(failure('invalid', 'unknown permission'));
    }
    const id = this.next();
    const credential = { credentialId: `cred-${id}`, runId, secret: `secret-${id}`, repositories: [...repositories], permissions: [...permissions], expiresAt: expiry() };
    this.credentials.set(credential.secret, { credential, revoked: false });
    return ok(credential);
  }

  private refresh(credentialId: string): Result<RunCredential> {
    const stored = this.findCredential(credentialId);
    if (!stored || stored.revoked) return err(failure('not-found', 'unknown credential'));
    const credential = { ...stored.credential, expiresAt: expiry() };
    this.credentials.set(credential.secret, { credential, revoked: false });
    return ok(credential);
  }

  private revoke(credentialId: string): Result<void> {
    const stored = this.findCredential(credentialId);
    if (!stored) return err(failure('not-found', 'unknown credential'));
    stored.revoked = true;
    return ok(undefined);
  }

  private findCredential(credentialId: string): StoredCredential | undefined {
    return [...this.credentials.values()].find((stored) => stored.credential.credentialId === credentialId);
  }

  private write(secret: string, repository: string): Result<void> {
    const stored = this.credentials.get(secret);
    if (!stored || stored.revoked || Date.parse(stored.credential.expiresAt) <= Date.now()) return forbidden();
    const { permissions, repositories } = stored.credential;
    if (!permissions.includes('write-code') && !this.defects.readOnlyCanWrite) return forbidden();
    if (!repositories.includes(repository) && !this.defects.unscopedCredentials) return forbidden();
    this.push(repository, BASE);
    return ok(undefined);
  }

  private open(repository: string, baseBranch: string, headBranch: string): Result<ChangeRequestData> {
    if (!this.branches.has(branchKey(repository, headBranch))) return err(failure('not-found', 'unknown branch'));
    const id = this.next();
    this.changeRequests.set(id, { id, repository, baseBranch, headBranch, state: 'open' });
    return this.read(id);
  }

  private read(id: string): Result<ChangeRequestData> {
    const stored = this.changeRequests.get(id);
    if (!stored) return err(failure('not-found', 'unknown change request'));
    const headCommit = this.branches.get(branchKey(stored.repository, stored.headBranch))!;
    return ok({ ...stored, headCommit, url: `memory://${stored.repository}/${id}` });
  }

  private merge(id: string, expectedHead: string, method: string): Result<{ changeRequest: string; mergeCommit: string; method: string }> {
    if (!MERGE_METHODS.includes(method)) return err(failure('unavailable', 'undeclared method'));
    const current = this.read(id);
    if (!current.ok) return current;
    if (current.value.state !== 'open') return err(failure('conflict', 'not open'));
    if (current.value.headCommit !== expectedHead && !this.defects.ignoresExpectedHead) return refused('stale head');
    if (!this.passesProtection(current.value) && !this.defects.ignoresRequiredStatuses) return refused('required status');
    return ok({ changeRequest: id, mergeCommit: this.complete(current.value), method });
  }

  // The most privileged native merge: only a binding protection stops it.
  private bypassMerge(changeRequest: ChangeRequestData): Result<void> {
    const current = this.read(changeRequest.id);
    if (!current.ok || current.value.state !== 'open') return refused('not open');
    const binding = this.protections.get(branchKey(current.value.repository, current.value.baseBranch))?.bindsProvider ?? false;
    if (binding && !this.passesProtection(current.value)) return refused('required status');
    this.complete(current.value);
    return ok(undefined);
  }

  private passesProtection(changeRequest: ChangeRequestData): boolean {
    const protection = this.protections.get(branchKey(changeRequest.repository, changeRequest.baseBranch));
    return (protection?.requiredStatuses ?? []).every(
      (context) => this.statuses.get(statusKey(changeRequest.repository, changeRequest.headCommit, context)) === 'success',
    );
  }

  private complete(changeRequest: ChangeRequestData): string {
    this.changeRequests.get(changeRequest.id)!.state = 'merged';
    return this.push(changeRequest.repository, changeRequest.baseBranch);
  }

  private sign(body: string): WebhookDelivery {
    const rawBody = new TextEncoder().encode(body);
    return { headers: { [SIGNATURE]: this.signatureOf(rawBody), [DELIVERY]: `delivery-${this.next()}` }, rawBody };
  }

  private verify(delivery: WebhookDelivery): Result<{ deliveryId: string; kind: string; repository: string; changeRequest: string }> {
    const signature = delivery.headers[SIGNATURE];
    const deliveryId = delivery.headers[DELIVERY];
    if (signature === undefined || deliveryId === undefined) return forbidden();
    if (!this.defects.ignoresSignature && !isSameText(signature, this.signatureOf(delivery.rawBody))) return forbidden();
    try {
      const event = JSON.parse(new TextDecoder().decode(delivery.rawBody)) as { kind: string; repository: string; changeRequest: string };
      return ok({ deliveryId, kind: event.kind, repository: event.repository, changeRequest: event.changeRequest });
    } catch {
      return err(failure('invalid', 'body is not JSON'));
    }
  }

  private signatureOf(rawBody: Uint8Array): string {
    return `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')}`;
  }

  private push(repository: string, branch: string): string {
    const commit = `c${this.next()}`;
    this.branches.set(branchKey(repository, branch), commit);
    return commit;
  }

  private next(): string {
    this.sequence += 1;
    return String(this.sequence);
  }
}

function branchKey(repository: string, branch: string): string {
  return `${repository}#${branch}`;
}

function statusKey(repository: string, commit: string, context: string): string {
  return `${repository}@${commit}:${context}`;
}

function expiry(): string {
  return new Date(Date.now() + LIFETIME_MS).toISOString();
}

function isSameText(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function forbidden(): Result<never> {
  return err(failure('forbidden', 'refused'));
}

function refused(reason: string): Result<never> {
  return err(failure('precondition-failed', reason));
}
