import { createHmac, timingSafeEqual } from 'node:crypto';
import { err, failure, ok, type FailureCode, type Result } from '@taskelith/kernel';
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
  readonly mergesDespiteRefusal?: boolean;
  readonly ignoredContext?: string;
  readonly failingStatesPass?: boolean;
  readonly bypassFailsWith?: FailureCode;
  readonly refreshKeepsExpiry?: boolean;
  readonly refreshUnscopes?: boolean;
  readonly unusableCredentials?: boolean;
  readonly refreshKeepsSecret?: boolean;
  readonly refreshKeepsOldSecret?: boolean;
  readonly sharedSecret?: boolean;
  readonly canonicalJsonOnly?: boolean;
  readonly enforcesOnlyFor?: string;
  readonly alwaysSquashes?: boolean;
  readonly fabricatedMergeCommit?: boolean;
  readonly readsOutsideProject?: boolean;
  readonly endedCanRead?: boolean;
  readonly refusesPermission?: string;
  readonly grantsOnPaper?: string;
  readonly onlyPendingBlocksFor?: string;
  readonly refreshWidens?: boolean;
}

// The service's own configuration, which a conforming plugin respects.
export interface ScmSetup {
  readonly mergeMethods?: readonly string[];
  readonly existingRequiredStatuses?: readonly string[];
  // A permission the service adds to every grant, having no narrower one.
  readonly alsoGrants?: string;
}

export const PROJECT = 'acme/project';
export const FOREIGN = 'acme/other';
const BASE = 'main';
const SIGNATURE = 'x-signature';
const DELIVERY = 'x-delivery';
const WEBHOOK_SECRET = 'webhook-secret';
const LIFETIME_MS = 60 * 60 * 1000;
const DEFAULT_MERGE_METHODS = Object.freeze(['merge-commit', 'squash']);

interface Protection {
  readonly requiredStatuses: readonly string[];
  readonly bindsProvider: boolean;
}

interface StoredCredential {
  readonly credential: RunCredential;
  ended: boolean;
  unscoped: boolean;
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
  private readonly mergedBy = new Map<string, string>();

  private readonly defects: ScmDefects;
  private readonly mergeMethods: readonly string[];
  private readonly existingRequiredStatuses: readonly string[];
  private readonly alsoGrants: readonly string[];

  constructor(defects: ScmDefects = {}, setup: ScmSetup = {}) {
    this.defects = defects;
    this.mergeMethods = setup.mergeMethods ?? DEFAULT_MERGE_METHODS;
    this.existingRequiredStatuses = setup.existingRequiredStatuses ?? [];
    this.alsoGrants = setup.alsoGrants === undefined ? [] : [setup.alsoGrants];
  }

  provider(): SourceControlProvider {
    return {
      capabilities: { mergeMethods: this.mergeMethods, reviewEvidence: ['required-status'] },
      issueRunCredential: async (request) => this.issue(request.runId, request.repositories, request.permissions),
      refreshRunCredential: async ({ credentialId }) => this.refresh(credentialId),
      revokeRunCredential: async ({ credentialId }) => this.revoke(credentialId),
      ensureMergeProtection: async ({ repository, branch, requiredStatuses }) => {
        const required = [...new Set([...this.existingRequiredStatuses, ...requiredStatuses])];
        const protection = { requiredStatuses: required, bindsProvider: !this.defects.bypassableProtection };
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
      readBranchHead: async (branch) => this.branches.get(branchKey(PROJECT, branch))!,
      signatureHeader: SIGNATURE,
      attemptAction: async (credential, repository, permission) => this.act(credential.secret, repository, permission),
      attemptBypassMerge: async (changeRequest) => this.bypassMerge(changeRequest),
      observeMergeMethod: async (mergeCommit) => this.mergedBy.get(mergeCommit) ?? 'none',
      signDelivery: async (event) => this.sign(JSON.stringify(event), WEBHOOK_SECRET),
      signWithForeignSecret: async (event) => this.sign(JSON.stringify(event), 'foreign-secret'),
    };
  }

  private issue(runId: string, repositories: readonly string[], permissions: readonly string[]): Result<RunCredential> {
    if (!permissions.every((permission) => (SCM_PERMISSIONS as readonly string[]).includes(permission))) {
      return err(failure('invalid', 'unknown permission'));
    }
    const refused = this.defects.refusesPermission;
    if (refused !== undefined && permissions.includes(refused)) return err(failure('unavailable', 'permission refused'));
    const id = this.next();
    const secret = this.defects.sharedSecret ? 'shared-secret' : `secret-${id}`;
    const granted = [...new Set([...permissions, ...this.alsoGrants])];
    const credential = { credentialId: `cred-${id}`, runId, secret, repositories: [...repositories], permissions: granted, expiresAt: expiry() };
    this.credentials.set(credential.secret, { credential, ended: false, unscoped: false });
    return ok(credential);
  }

  private refresh(credentialId: string): Result<RunCredential> {
    const stored = this.findCredential(credentialId);
    if (!stored) return err(failure('not-found', 'unknown credential'));
    const previous = stored.credential;
    const secret = this.defects.refreshKeepsSecret ? previous.secret : `secret-${this.next()}`;
    const expiresAt = this.defects.refreshKeepsExpiry ? previous.expiresAt : extendedExpiry(previous.expiresAt);
    const permissions = this.defects.refreshWidens ? [...SCM_PERMISSIONS] : previous.permissions;
    const credential = { ...previous, secret, expiresAt, permissions };
    if (!this.defects.refreshKeepsOldSecret) stored.ended = true;
    this.credentials.set(secret, { credential, ended: false, unscoped: Boolean(this.defects.refreshUnscopes) });
    return ok(credential);
  }

  private revoke(credentialId: string): Result<void> {
    const stored = this.findCredential(credentialId);
    if (!stored) return err(failure('not-found', 'unknown credential'));
    stored.ended = true;
    return ok(undefined);
  }

  private findCredential(credentialId: string): StoredCredential | undefined {
    return [...this.credentials.values()].find((stored) => !stored.ended && stored.credential.credentialId === credentialId);
  }

  // Only a code write leaves a trace that later cases see.
  private act(secret: string, repository: string, permission: string): Result<void> {
    const writesCode = permission === 'write-code';
    const access = this.access(secret, repository, writesCode && this.defects.readOnlyCanWrite ? 'read-code' : permission);
    if (access.ok && writesCode) this.push(repository, BASE);
    return access;
  }

  private access(secret: string, repository: string, permission: string): Result<void> {
    const stored = this.credentials.get(secret);
    if (!stored || this.defects.unusableCredentials) return forbidden();
    const reads = permission === 'read-code';
    if (stored.ended && !(reads && this.defects.endedCanRead)) return forbidden();
    if (Date.parse(stored.credential.expiresAt) <= Date.now()) return forbidden();
    const { permissions, repositories } = stored.credential;
    if (!permissions.includes(permission) || this.defects.grantsOnPaper === permission) return forbidden();
    const unscoped = stored.unscoped || this.defects.unscopedCredentials || (reads && this.defects.readsOutsideProject);
    return repositories.includes(repository) || unscoped ? ok(undefined) : forbidden();
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
    if (!this.mergeMethods.includes(method)) return err(failure('unavailable', 'undeclared method'));
    const current = this.read(id);
    if (!current.ok) return current;
    if (current.value.state !== 'open') return err(failure('conflict', 'not open'));
    const guarded = this.defects.enforcesOnlyFor === undefined || this.defects.enforcesOnlyFor === method;
    const performed = this.defects.alwaysSquashes ? 'squash' : method;
    if (guarded && current.value.headCommit !== expectedHead && !this.defects.ignoresExpectedHead) return refused('stale head');
    if (guarded && !this.passesProtection(current.value, method) && !this.defects.ignoresRequiredStatuses) {
      if (this.defects.mergesDespiteRefusal) this.complete(current.value, performed);
      return refused('required status');
    }
    const mergeCommit = this.complete(current.value, performed);
    return ok({ changeRequest: id, mergeCommit: this.defects.fabricatedMergeCommit ? 'nonexistent' : mergeCommit, method });
  }

  // The most privileged native merge: only a binding protection stops it.
  private bypassMerge(changeRequest: ChangeRequestData): Result<void> {
    if (this.defects.bypassFailsWith) return err(failure(this.defects.bypassFailsWith, 'probe broken'));
    const current = this.read(changeRequest.id);
    if (!current.ok || current.value.state !== 'open') return refused('not open');
    const binding = this.protections.get(branchKey(current.value.repository, current.value.baseBranch))?.bindsProvider ?? false;
    if (binding && !this.passesProtection(current.value)) return refused('required status');
    this.complete(current.value, 'merge-commit');
    return ok(undefined);
  }

  // `method` is unset for the native bypass merge.
  private passesProtection(changeRequest: ChangeRequestData, method?: string): boolean {
    const protection = this.protections.get(branchKey(changeRequest.repository, changeRequest.baseBranch));
    const enforced = (protection?.requiredStatuses ?? []).filter((context) => context !== this.defects.ignoredContext);
    const { repository, headCommit } = changeRequest;
    return enforced.every((context) => this.passes(this.statuses.get(statusKey(repository, headCommit, context)), method));
  }

  private passes(state: string | undefined, method?: string): boolean {
    if (method !== undefined && this.defects.onlyPendingBlocksFor === method) return state !== 'pending';
    return state === 'success' || (Boolean(this.defects.failingStatesPass) && (state === 'failure' || state === 'error'));
  }

  // The service records which method made each merge commit, as a real
  // service shows it in the commit topology.
  private complete(changeRequest: ChangeRequestData, method: string): string {
    this.changeRequests.get(changeRequest.id)!.state = 'merged';
    const mergeCommit = this.push(changeRequest.repository, changeRequest.baseBranch);
    this.mergedBy.set(mergeCommit, method);
    return mergeCommit;
  }

  private sign(body: string, secret: string): WebhookDelivery {
    const rawBody = new TextEncoder().encode(body);
    return { headers: { [SIGNATURE]: signatureOf(rawBody, secret), [DELIVERY]: `delivery-${this.next()}` }, rawBody };
  }

  private verify(delivery: WebhookDelivery): Result<{ deliveryId: string; kind: string; repository: string; changeRequest: string }> {
    const signature = delivery.headers[SIGNATURE];
    const deliveryId = delivery.headers[DELIVERY];
    if (signature === undefined || deliveryId === undefined) return forbidden();
    if (!this.signatureAccepted(signature, delivery.rawBody)) return forbidden();
    try {
      const event = JSON.parse(new TextDecoder().decode(delivery.rawBody)) as { kind: string; repository: string; changeRequest: string };
      return ok({ deliveryId, kind: event.kind, repository: event.repository, changeRequest: event.changeRequest });
    } catch {
      return err(failure('invalid', 'body is not JSON'));
    }
  }

  private signatureAccepted(signature: string, rawBody: Uint8Array): boolean {
    if (this.defects.ignoresSignature) return true;
    if (this.defects.canonicalJsonOnly) return isCanonicalJson(rawBody);
    return isSameText(signature, signatureOf(rawBody, WEBHOOK_SECRET));
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

// Strictly later than the previous expiry, even within one millisecond.
function extendedExpiry(previous: string): string {
  return new Date(Math.max(Date.now() + LIFETIME_MS, Date.parse(previous) + 1)).toISOString();
}

function signatureOf(rawBody: Uint8Array, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

function isCanonicalJson(rawBody: Uint8Array): boolean {
  const text = new TextDecoder().decode(rawBody);
  try {
    return JSON.stringify(JSON.parse(text)) === text;
  } catch {
    return false;
  }
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
