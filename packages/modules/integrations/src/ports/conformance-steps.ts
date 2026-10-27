import { fixtureStep, failsWith, succeeds, type ConformanceCase } from './conformance-case.js';
import type { SourceControlConformanceFixture } from './source-control-fixture.js';
import { readCapabilities, readChangeRequest, readCommitStatus, readMergeProtection } from './source-control-readers.js';
import type { ChangeRequestData, MergeProtectionData, SourceControlCapabilities, SourceControlProvider } from './source-control.js';
import { describeThrown } from './untrusted-shapes.js';

// Steps that several cases share; each checks what the plugin returns.

export const REVIEW_CONTEXT = 'taskelith/review';
export const VERIFICATION_CONTEXT = 'taskelith/verification';
export const SUITE_CONTEXTS = Object.freeze([REVIEW_CONTEXT, VERIFICATION_CONTEXT]);

// A change request on the protected base branch, with every context that
// the protection requires, the suite's own and any that already existed.
export interface GuardedChangeRequest {
  readonly changeRequest: ChangeRequestData;
  readonly requiredStatuses: readonly string[];
}

export interface MergeRefusal {
  readonly label: string;
  readonly expectedHead: string;
  readonly method: string;
  readonly code: 'precondition-failed' | 'unavailable';
}

// Reading the property itself may run a plugin getter.
export function declaredCapabilities(run: ConformanceCase, provider: SourceControlProvider): SourceControlCapabilities {
  let raw: unknown;
  try {
    raw = provider.capabilities;
  } catch (error) {
    run.abort('threw', `capabilities could not be read: ${describeThrown(error)}`);
  }
  const capabilities = readCapabilities(raw);
  if (!capabilities.ok) run.abort('shape', capabilities.error.join('; '));
  return capabilities.value;
}

export function ensureProtection(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<MergeProtectionData> {
  return succeeds(
    run,
    'ensureMergeProtection',
    () => fixture.provider.ensureMergeProtection({
      repository: fixture.projectRepository,
      branch: fixture.baseBranch,
      requiredStatuses: [...SUITE_CONTEXTS],
    }),
    readMergeProtection,
  );
}

export async function openProtectedChangeRequest(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
): Promise<GuardedChangeRequest> {
  const protection = await ensureProtection(run, fixture);
  const changeRequest = await openChangeRequest(run, fixture);
  return { changeRequest, requiredStatuses: [...new Set([...protection.requiredStatuses, ...SUITE_CONTEXTS])] };
}

export async function openChangeRequest(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<ChangeRequestData> {
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
  checkIdentity(run, 'openChangeRequest', opened, { ...opened, repository: fixture.projectRepository, baseBranch: fixture.baseBranch, headBranch: head.branch });
  run.expect(opened.state === 'open', `openChangeRequest returned state ${opened.state}, not open`);
  run.expect(opened.headCommit === head.commit, `openChangeRequest returned head ${opened.headCommit}, not ${head.commit}`);
  return opened;
}

// Reads the change request back and checks that it is the same one.
export async function readBack(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  expected: ChangeRequestData,
): Promise<ChangeRequestData> {
  const read = await succeeds(
    run,
    'readChangeRequest',
    () => fixture.provider.readChangeRequest({ repository: fixture.projectRepository, changeRequest: expected.id }),
    readChangeRequest,
  );
  checkIdentity(run, 'readChangeRequest', read, expected);
  return read;
}

function checkIdentity(run: ConformanceCase, operation: string, actual: ChangeRequestData, expected: ChangeRequestData): void {
  const fields = ['id', 'repository', 'baseBranch', 'headBranch'] as const;
  for (const field of fields.filter((name) => actual[name] !== expected[name])) {
    run.report('outcome', `${operation} returned ${field} ${actual[field]}, not ${expected[field]}`);
  }
}

export async function setStatuses(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  commit: string,
  contexts: readonly string[],
  state: string,
): Promise<void> {
  for (const context of contexts) await setStatus(run, fixture, commit, context, state);
}

export async function setStatus(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  commit: string,
  context: string,
  state: string,
): Promise<void> {
  const request = { repository: fixture.projectRepository, commit, context, state };
  const status = await succeeds(
    run,
    'setCommitStatus',
    () => fixture.provider.setCommitStatus({ ...request, description: `Conformance ${context} ${state}` }),
    readCommitStatus,
  );
  const fields = ['repository', 'commit', 'context', 'state'] as const;
  for (const field of fields.filter((name) => status[name] !== request[name])) {
    run.report('outcome', `setCommitStatus returned ${field} ${status[field]}, not ${request[field]}`);
  }
}

export function mergeCall(
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

export function readBaseHead(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<string> {
  return fixtureStep(run, 'readBranchHead', () => fixture.readBranchHead(fixture.baseBranch));
}

// A refused merge must leave no trace: a plugin may report a refusal and
// still have merged.
export async function expectMergeRefused(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  changeRequest: ChangeRequestData,
  refusal: MergeRefusal,
): Promise<void> {
  const baseHead = await readBaseHead(run, fixture);
  await failsWith(run, refusal.label, mergeCall(fixture, changeRequest, refusal.expectedHead, refusal.method), refusal.code);
  await expectUnmerged(run, fixture, changeRequest, baseHead, refusal.label);
}

// A merged change request ends the case, as later steps would only repeat
// the finding.
export async function expectUnmerged(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  changeRequest: ChangeRequestData,
  baseHead: string,
  label: string,
): Promise<void> {
  const read = await readBack(run, fixture, changeRequest);
  const currentBase = await readBaseHead(run, fixture);
  run.expect(currentBase === baseHead, `after ${label} ${fixture.baseBranch} moved from ${baseHead} to ${currentBase}`);
  if (read.state !== 'open') run.abort('outcome', `after ${label} the change request is ${read.state}, not open`);
}

export function isSubset(values: readonly string[], allowed: readonly string[]): boolean {
  return values.every((value) => allowed.includes(value));
}

export function isSameSet(left: readonly string[], right: readonly string[]): boolean {
  return isSubset(left, right) && isSubset(right, left);
}
