import { parseInstant, type Result } from '@taskelith/kernel';
import {
  ConformanceCase,
  anyValue,
  failsWith,
  fixtureStep,
  succeeds,
  type SourceControlConformanceFinding,
} from './conformance-case.js';
import {
  readCapabilities,
  readChangeRequest,
  readCommitStatus,
  readMergeProtection,
  readMergeResult,
  readRunCredential,
  readWebhookEvent,
} from './source-control-readers.js';
import {
  MERGE_METHODS,
  REVIEW_EVIDENCE_KINDS,
  SCM_PERMISSIONS,
  type ChangeRequestData,
  type MergeProtectionData,
  type RunCredential,
  type RunCredentialRequest,
  type SourceControlCapabilities,
  type SourceControlProvider,
  type WebhookDelivery,
  type WebhookEvent,
} from './source-control.js';
import { describe } from './untrusted-shapes.js';

// An SCM-neutral suite, without a test runner, that a plugin's tests run on
// their own fixture against a real or emulated service.

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
  attemptWrite(credential: RunCredential, repository: string): Promise<Result<void>>;
  attemptBypassMerge(changeRequest: ChangeRequestData): Promise<Result<void>>;
  signDelivery(event: SignedChangeRequestEvent): Promise<WebhookDelivery>;
}

export interface SourceControlConformanceReport {
  readonly cases: number;
  readonly findings: readonly SourceControlConformanceFinding[];
}

type CaseBody = (run: ConformanceCase, fixture: SourceControlConformanceFixture) => Promise<void>;

const REVIEW_CONTEXT = 'taskelith/review';
const VERIFICATION_CONTEXT = 'taskelith/verification';
const READ_ONLY = Object.freeze(['read-code']);
const READ_WRITE = Object.freeze(['read-code', 'write-code']);

// Credential cases come first; change request cases then build on the
// merge protection that the protection case establishes.
const CASES: readonly (readonly [string, CaseBody])[] = Object.freeze([
  ['capabilities', checkCapabilities],
  ['read-only credential', checkReadOnlyCredential],
  ['write credential', checkWriteCredential],
  ['refreshed credential', checkRefreshedCredential],
  ['revoked credential', checkRevokedCredential],
  ['merge protection', checkMergeProtection],
  ['change request', checkChangeRequest],
  ['pending required status', checkPendingRequiredStatus],
  ['stale head', checkStaleHead],
  ['merge', checkMerge],
  ['undeclared merge method', checkUndeclaredMergeMethod],
  ['webhook delivery', checkWebhookDelivery],
]);

export async function runSourceControlConformance(
  fixture: SourceControlConformanceFixture,
): Promise<SourceControlConformanceReport> {
  const findings: SourceControlConformanceFinding[] = [];
  for (const [name, body] of CASES) {
    findings.push(...(await new ConformanceCase(name).run((run) => body(run, fixture))));
  }
  return Object.freeze({ cases: CASES.length, findings: Object.freeze(findings) });
}

async function checkCapabilities(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const { mergeMethods, reviewEvidence } = declaredCapabilities(run, fixture.provider);
  run.expect(
    mergeMethods.length > 0 && isSubset(mergeMethods, MERGE_METHODS),
    `capabilities.mergeMethods ${describe(mergeMethods)} must be a non-empty subset of ${MERGE_METHODS.join(', ')}`,
  );
  run.expect(mergeMethods.includes(fixture.mergeMethod), `capabilities.mergeMethods must include ${fixture.mergeMethod}`);
  run.expect(
    isSubset(reviewEvidence, REVIEW_EVIDENCE_KINDS),
    `capabilities.reviewEvidence ${describe(reviewEvidence)} must be a subset of ${REVIEW_EVIDENCE_KINDS.join(', ')}`,
  );
  run.expect(reviewEvidence.includes('required-status'), 'capabilities.reviewEvidence must include required-status');
}

async function checkReadOnlyCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-read-only', READ_ONLY);
  run.expect(!credential.permissions.includes('write-code'), 'a read-only credential must not grant write-code');
  await expectWriteRefused(run, fixture, credential, fixture.projectRepository);
}

async function checkWriteCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-write', READ_WRITE);
  await expectWriteAllowed(run, fixture, credential);
  await expectWriteRefused(run, fixture, credential, fixture.foreignRepository);
}

async function checkRefreshedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const original = await issueCredential(run, fixture, 'conformance-refresh', READ_WRITE);
  const refreshed = await succeeds(
    run,
    'refreshRunCredential',
    () => fixture.provider.refreshRunCredential({ credentialId: original.credentialId }),
    readRunCredential,
  );
  checkGrant(run, 'refreshRunCredential', grantOf(original), refreshed);
  run.expect(isSameSet(refreshed.permissions, original.permissions), 'refreshRunCredential changed the permissions');
  run.expect(
    Date.parse(refreshed.expiresAt) >= Date.parse(original.expiresAt),
    `refreshRunCredential moved expiresAt back from ${original.expiresAt} to ${refreshed.expiresAt}`,
  );
  await expectWriteAllowed(run, fixture, refreshed);
}

async function checkRevokedCredential(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const credential = await issueCredential(run, fixture, 'conformance-revoke', READ_WRITE);
  await succeeds(
    run,
    'revokeRunCredential',
    () => fixture.provider.revokeRunCredential({ credentialId: credential.credentialId }),
    anyValue,
  );
  await expectWriteRefused(run, fixture, credential, fixture.projectRepository);
}

async function checkMergeProtection(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const protection = await ensureProtection(run, fixture);
  run.expect(protection.bindsProvider, 'ensureMergeProtection must bind the provider identity');
  run.expect(
    isSubset([REVIEW_CONTEXT, VERIFICATION_CONTEXT], protection.requiredStatuses),
    `ensureMergeProtection listed ${describe(protection.requiredStatuses)}, not the required statuses`,
  );
  run.expect(
    protection.repository === fixture.projectRepository && protection.branch === fixture.baseBranch,
    `ensureMergeProtection protected ${protection.repository} ${protection.branch}, not the base branch`,
  );
}

async function checkChangeRequest(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const opened = await openChangeRequest(run, fixture);
  const read = await readBack(run, fixture, opened.id);
  run.expect(read.id === opened.id, `readChangeRequest returned id ${read.id}, not ${opened.id}`);
  run.expect(read.state === 'open', `readChangeRequest returned state ${read.state}, not open`);
  run.expect(read.headCommit === opened.headCommit, `readChangeRequest returned head ${read.headCommit}`);
}

async function checkPendingRequiredStatus(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const opened = await openProtectedChangeRequest(run, fixture);
  await setStatus(run, fixture, opened.headCommit, VERIFICATION_CONTEXT, 'success');
  await setStatus(run, fixture, opened.headCommit, REVIEW_CONTEXT, 'pending');
  await failsWith(
    run,
    'mergeChangeRequest with a pending required status',
    mergeCall(fixture, opened, opened.headCommit, fixture.mergeMethod),
    'precondition-failed',
  );
  const bypass = await fixtureStep(run, 'attemptBypassMerge', () => fixture.attemptBypassMerge(opened));
  if (bypass.ok) run.report('bypass', 'the provider identity merged past a pending required status');
}

async function checkStaleHead(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const opened = await openProtectedChangeRequest(run, fixture);
  await setPassingStatuses(run, fixture, opened.headCommit);
  const newHead = await fixtureStep(run, 'advanceHead', () => fixture.advanceHead(opened.headBranch));
  await setPassingStatuses(run, fixture, newHead);
  await failsWith(
    run,
    'mergeChangeRequest with a stale expected head',
    mergeCall(fixture, opened, opened.headCommit, fixture.mergeMethod),
    'precondition-failed',
  );
}

async function checkMerge(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const opened = await openProtectedChangeRequest(run, fixture);
  await setPassingStatuses(run, fixture, opened.headCommit);
  const merged = await succeeds(
    run,
    'mergeChangeRequest',
    mergeCall(fixture, opened, opened.headCommit, fixture.mergeMethod),
    readMergeResult,
  );
  run.expect(merged.method === fixture.mergeMethod, `mergeChangeRequest returned method ${merged.method}`);
  run.expect(merged.changeRequest === opened.id, `mergeChangeRequest returned ${merged.changeRequest}`);
  const read = await readBack(run, fixture, opened.id);
  run.expect(read.state === 'merged', `readChangeRequest after the merge returned state ${read.state}`);
}

async function checkUndeclaredMergeMethod(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const { mergeMethods } = declaredCapabilities(run, fixture.provider);
  const undeclared = MERGE_METHODS.find((method) => !mergeMethods.includes(method));
  if (undeclared === undefined) return;
  const opened = await openProtectedChangeRequest(run, fixture);
  await setPassingStatuses(run, fixture, opened.headCommit);
  await failsWith(
    run,
    `mergeChangeRequest with the undeclared method ${undeclared}`,
    mergeCall(fixture, opened, opened.headCommit, undeclared),
    'unavailable',
  );
}

async function checkWebhookDelivery(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const opened = await openChangeRequest(run, fixture);
  const event = { kind: 'change-request', repository: fixture.projectRepository, changeRequest: opened.id } as const;
  const delivery = await fixtureStep(run, 'signDelivery', () => fixture.signDelivery(event));
  if (delivery.rawBody.length === 0) run.abort('fixture', 'signDelivery returned an empty body');
  const verified = await verifyDelivery(run, fixture, delivery);
  checkEvent(run, verified, event);
  const repeated = await verifyDelivery(run, fixture, delivery);
  run.expect(repeated.deliveryId === verified.deliveryId, 'a repeated delivery must keep its deliveryId');
  await expectDeliveryRefused(run, fixture, 'a tampered body', withBody(delivery, flippedByte(delivery.rawBody)));
  const reformatted = reserializedJson(delivery.rawBody);
  if (reformatted) await expectDeliveryRefused(run, fixture, 'a re-serialized body', withBody(delivery, reformatted));
  await expectDeliveryRefused(run, fixture, 'no signature headers', { headers: {}, rawBody: delivery.rawBody });
}

// Reading the property itself may run a plugin getter.
function declaredCapabilities(run: ConformanceCase, provider: SourceControlProvider): SourceControlCapabilities {
  let raw: unknown;
  try {
    raw = provider.capabilities;
  } catch (error) {
    run.abort('threw', `capabilities could not be read: ${describe(error)}`);
  }
  const capabilities = readCapabilities(raw);
  if (!capabilities.ok) run.abort('shape', capabilities.error.join('; '));
  return capabilities.value;
}

async function issueCredential(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  runId: string,
  permissions: readonly string[],
): Promise<RunCredential> {
  const request = { runId, repositories: [fixture.projectRepository], permissions };
  const credential = await succeeds(
    run,
    'issueRunCredential',
    () => fixture.provider.issueRunCredential({ runId, repositories: [...request.repositories], permissions: [...permissions] }),
    readRunCredential,
  );
  checkGrant(run, 'issueRunCredential', request, credential);
  return credential;
}

function grantOf(credential: RunCredential): RunCredentialRequest {
  return { runId: credential.runId, repositories: credential.repositories, permissions: credential.permissions };
}

// A grant must cover the request in port terms, for the requested
// repositories only, and expire in the future.
function checkGrant(run: ConformanceCase, operation: string, request: RunCredentialRequest, credential: RunCredential): void {
  run.expect(credential.runId === request.runId, `${operation} returned run ${credential.runId}, not ${request.runId}`);
  run.expect(
    isSameSet(credential.repositories, request.repositories),
    `${operation} granted ${describe(credential.repositories)}, not exactly ${describe(request.repositories)}`,
  );
  run.expect(
    isSubset(request.permissions, credential.permissions) && isSubset(credential.permissions, SCM_PERMISSIONS),
    `${operation} granted ${describe(credential.permissions)} for ${describe(request.permissions)}`,
  );
  run.expect(
    parseInstant(credential.expiresAt).ok && Date.parse(credential.expiresAt) > Date.now(),
    `${operation} returned expiresAt ${credential.expiresAt}, not a canonical future instant`,
  );
}

async function expectWriteAllowed(run: ConformanceCase, fixture: SourceControlConformanceFixture, credential: RunCredential): Promise<void> {
  const write = await fixtureStep(run, 'attemptWrite', () => fixture.attemptWrite(credential, fixture.projectRepository));
  run.expect(write.ok, `credential ${credential.credentialId} could not write to ${fixture.projectRepository}`);
}

async function expectWriteRefused(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  credential: RunCredential,
  repository: string,
): Promise<void> {
  const write = await fixtureStep(run, 'attemptWrite', () => fixture.attemptWrite(credential, repository));
  run.expect(
    !write.ok && write.error.code === 'forbidden',
    `credential ${credential.credentialId} writing to ${repository} must fail with forbidden`,
  );
}

function ensureProtection(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<MergeProtectionData> {
  return succeeds(
    run,
    'ensureMergeProtection',
    () => fixture.provider.ensureMergeProtection({
      repository: fixture.projectRepository,
      branch: fixture.baseBranch,
      requiredStatuses: [REVIEW_CONTEXT, VERIFICATION_CONTEXT],
    }),
    readMergeProtection,
  );
}

async function openProtectedChangeRequest(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<ChangeRequestData> {
  await ensureProtection(run, fixture);
  return openChangeRequest(run, fixture);
}

async function openChangeRequest(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<ChangeRequestData> {
  const head = await fixtureStep(run, 'prepareHeadBranch', () => fixture.prepareHeadBranch());
  const opened = await succeeds(
    run,
    'openChangeRequest',
    () => fixture.provider.openChangeRequest({
      repository: fixture.projectRepository,
      baseBranch: fixture.baseBranch,
      headBranch: head.branch,
      title: 'Conformance change request',
      description: 'Opened by the source control conformance suite.',
    }),
    readChangeRequest,
  );
  run.expect(
    opened.repository === fixture.projectRepository && opened.baseBranch === fixture.baseBranch && opened.headBranch === head.branch,
    `openChangeRequest returned ${opened.repository} ${opened.baseBranch} <- ${opened.headBranch}`,
  );
  run.expect(opened.state === 'open', `openChangeRequest returned state ${opened.state}, not open`);
  run.expect(opened.headCommit === head.commit, `openChangeRequest returned head ${opened.headCommit}, not ${head.commit}`);
  return opened;
}

function readBack(run: ConformanceCase, fixture: SourceControlConformanceFixture, changeRequest: string): Promise<ChangeRequestData> {
  return succeeds(
    run,
    'readChangeRequest',
    () => fixture.provider.readChangeRequest({ repository: fixture.projectRepository, changeRequest }),
    readChangeRequest,
  );
}

async function setPassingStatuses(run: ConformanceCase, fixture: SourceControlConformanceFixture, commit: string): Promise<void> {
  await setStatus(run, fixture, commit, VERIFICATION_CONTEXT, 'success');
  await setStatus(run, fixture, commit, REVIEW_CONTEXT, 'success');
}

async function setStatus(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  commit: string,
  context: string,
  state: string,
): Promise<void> {
  const status = await succeeds(
    run,
    'setCommitStatus',
    () => fixture.provider.setCommitStatus({
      repository: fixture.projectRepository,
      commit,
      context,
      state,
      description: `Conformance ${context} ${state}`,
    }),
    readCommitStatus,
  );
  run.expect(
    status.commit === commit && status.context === context && status.state === state,
    `setCommitStatus returned ${status.context} ${status.state} on ${status.commit}`,
  );
}

function mergeCall(
  fixture: SourceControlConformanceFixture,
  changeRequest: ChangeRequestData,
  expectedHead: string,
  method: string,
): () => Promise<unknown> {
  return () => fixture.provider.mergeChangeRequest({
    repository: fixture.projectRepository,
    changeRequest: changeRequest.id,
    expectedHead,
    method,
  });
}

// The plugin gets its own copy of each delivery, which it may change.
function verifyDelivery(run: ConformanceCase, fixture: SourceControlConformanceFixture, delivery: WebhookDelivery): Promise<WebhookEvent> {
  return succeeds(
    run,
    'verifyWebhookDelivery',
    () => fixture.provider.verifyWebhookDelivery(withBody(delivery, delivery.rawBody)),
    readWebhookEvent,
  );
}

function expectDeliveryRefused(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  variant: string,
  delivery: WebhookDelivery,
): Promise<void> {
  return failsWith(run, `verifyWebhookDelivery with ${variant}`, () => fixture.provider.verifyWebhookDelivery(delivery), 'forbidden');
}

function checkEvent(run: ConformanceCase, event: WebhookEvent, signed: SignedChangeRequestEvent): void {
  run.expect(
    event.kind === signed.kind && event.repository === signed.repository && event.changeRequest === signed.changeRequest,
    `verifyWebhookDelivery returned ${event.kind} ${event.repository} ${String(event.changeRequest)}`,
  );
}

function withBody(delivery: WebhookDelivery, rawBody: Uint8Array): WebhookDelivery {
  return { headers: { ...delivery.headers }, rawBody: new Uint8Array(rawBody) };
}

function flippedByte(body: Uint8Array): Uint8Array {
  const copy = new Uint8Array(body);
  const middle = Math.floor(copy.length / 2);
  copy[middle] = copy[middle]! ^ 0x01;
  return copy;
}

// The same JSON with other whitespace, or undefined for a body that is not
// JSON; a verifier must refuse it, as the signature covers the raw bytes.
function reserializedJson(body: Uint8Array): Uint8Array | undefined {
  const parsed = parseJson(body);
  if (parsed === undefined) return undefined;
  return [JSON.stringify(parsed.value), JSON.stringify(parsed.value, null, 2)]
    .map((json) => new TextEncoder().encode(json))
    .find((candidate) => !isSameBytes(candidate, body));
}

function parseJson(body: Uint8Array): { readonly value: unknown } | undefined {
  try {
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) };
  } catch {
    return undefined;
  }
}

function isSameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function isSubset(values: readonly string[], allowed: readonly string[]): boolean {
  return values.every((value) => allowed.includes(value));
}

function isSameSet(left: readonly string[], right: readonly string[]): boolean {
  return isSubset(left, right) && isSubset(right, left);
}
