import { fixtureStep, failsWith, succeeds, type ConformanceCase } from './conformance-case.js';
import {
  SUITE_CONTEXTS,
  declaredCapabilities,
  ensureProtection,
  expectMergeRefused,
  expectUnmerged,
  isSubset,
  mergeCall,
  openChangeRequest,
  openProtectedChangeRequest,
  readBack,
  readBaseHead,
  setStatus,
  setStatuses,
  type GuardedChangeRequest,
} from './conformance-steps.js';
import type { SourceControlConformanceFixture } from './source-control-fixture.js';
import { readMergeResult } from './source-control-readers.js';
import { MERGE_METHODS, REVIEW_EVIDENCE_KINDS, type ChangeRequestData } from './source-control.js';
import { describe } from './untrusted-shapes.js';

// Cases for capabilities, merge protection, and merges.

const BLOCKING_STATES = Object.freeze(['missing', 'pending', 'failure', 'error'] as const);
const BYPASS_REFUSALS: readonly string[] = Object.freeze(['forbidden', 'precondition-failed']);

type BlockingState = (typeof BLOCKING_STATES)[number];

interface Blocker {
  readonly context: string;
  readonly state: BlockingState;
  readonly method: string;
}

export async function checkCapabilities(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
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

export async function checkMergeProtection(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const protection = await ensureProtection(run, fixture);
  run.expect(protection.bindsProvider, 'ensureMergeProtection must bind the provider identity');
  run.expect(
    isSubset(SUITE_CONTEXTS, protection.requiredStatuses),
    `ensureMergeProtection listed ${describe(protection.requiredStatuses)}, not the required statuses`,
  );
  run.expect(
    protection.repository === fixture.projectRepository && protection.branch === fixture.baseBranch,
    `ensureMergeProtection protected ${protection.repository} ${protection.branch}, not the base branch`,
  );
}

export async function checkChangeRequest(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const opened = await openChangeRequest(run, fixture);
  const read = await readBack(run, fixture, opened);
  run.expect(read.state === 'open', `readChangeRequest returned state ${read.state}, not open`);
  run.expect(read.headCommit === opened.headCommit, `readChangeRequest returned head ${read.headCommit}`);
}

// Each required context, the suite's own and any other, blocks on its own
// in every blocking state while every other one passes.
export async function checkRequiredStatuses(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const guarded = await openProtectedChangeRequest(run, fixture);
  const blockers = guarded.requiredStatuses.flatMap((context) =>
    BLOCKING_STATES.map((state) => ({ context, state, method: fixture.mergeMethod })));
  await expectAllBlocked(run, fixture, guarded, blockers);
}

// Every declared method honours the protection: a pending status and a
// stale head block it, so a plugin cannot guard only some methods.
export async function checkMethodProtection(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  for (const method of declaredMergeMethods(run, fixture)) {
    const guarded = await openProtectedChangeRequest(run, fixture);
    const blockers = guarded.requiredStatuses.map((context) => ({ context, state: 'pending' as const, method }));
    const head = await expectAllBlocked(run, fixture, guarded, blockers);
    await expectStaleHeadRefused(run, fixture, guarded, head, method);
  }
}

// Each blocker gets a new head, as a status cannot be removed; returns the
// last head.
async function expectAllBlocked(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  guarded: GuardedChangeRequest,
  blockers: readonly Blocker[],
): Promise<string> {
  let head = guarded.changeRequest.headCommit;
  for (const [index, blocker] of blockers.entries()) {
    if (index > 0) head = await advanceHead(run, fixture, guarded.changeRequest);
    await expectBlocked(run, fixture, guarded, head, blocker);
  }
  return head;
}

async function expectBlocked(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  guarded: GuardedChangeRequest,
  head: string,
  blocker: Blocker,
): Promise<void> {
  const others = guarded.requiredStatuses.filter((context) => context !== blocker.context);
  await setStatuses(run, fixture, head, others, 'success');
  if (blocker.state !== 'missing') await setStatus(run, fixture, head, blocker.context, blocker.state);
  const label = `mergeChangeRequest with ${blocker.method} and ${blocker.context} ${blocker.state}`;
  const changeRequest = { ...guarded.changeRequest, headCommit: head };
  const baseHead = await readBaseHead(run, fixture);
  await failsWith(run, label, mergeCall(fixture, changeRequest, head, blocker.method), 'precondition-failed');
  await expectBypassRefused(run, fixture, changeRequest, `${blocker.context} ${blocker.state}`);
  await expectUnmerged(run, fixture, changeRequest, baseHead, label);
}

async function expectStaleHeadRefused(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  guarded: GuardedChangeRequest,
  staleHead: string,
  method: string,
): Promise<void> {
  await setStatuses(run, fixture, staleHead, guarded.requiredStatuses, 'success');
  const newHead = await advanceHead(run, fixture, guarded.changeRequest);
  await setStatuses(run, fixture, newHead, guarded.requiredStatuses, 'success');
  await expectMergeRefused(run, fixture, guarded.changeRequest, {
    label: `mergeChangeRequest with ${method} and a stale expected head`,
    expectedHead: staleHead,
    method,
    code: 'precondition-failed',
  });
}

function advanceHead(run: ConformanceCase, fixture: SourceControlConformanceFixture, changeRequest: ChangeRequestData): Promise<string> {
  return fixtureStep(run, 'advanceHead', () => fixture.advanceHead(changeRequest.headBranch));
}

async function expectBypassRefused(
  run: ConformanceCase,
  fixture: SourceControlConformanceFixture,
  changeRequest: ChangeRequestData,
  blocker: string,
): Promise<void> {
  const bypass = await fixtureStep(run, 'attemptBypassMerge', () => fixture.attemptBypassMerge(changeRequest));
  if (bypass.ok) run.report('bypass', `the provider identity merged past ${blocker}`);
  else if (!BYPASS_REFUSALS.includes(bypass.error.code)) {
    run.report('fixture', `attemptBypassMerge past ${blocker} failed with ${bypass.error.code}, not a protection refusal`);
  }
}

// The same native merge succeeds once every status passes, which shows
// that its refusals above come from the protection.
export async function checkNativeMergeControl(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const { changeRequest } = await openPassingChangeRequest(run, fixture);
  const bypass = await fixtureStep(run, 'attemptBypassMerge', () => fixture.attemptBypassMerge(changeRequest));
  if (!bypass.ok) run.abort('fixture', `attemptBypassMerge of a passing change request failed with ${bypass.error.code}`);
  const read = await readBack(run, fixture, changeRequest);
  run.expect(read.state === 'merged', `after attemptBypassMerge the change request is ${read.state}, not merged`);
}

export async function checkMergeMethods(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  for (const method of declaredMergeMethods(run, fixture)) await expectMerged(run, fixture, method);
}

function declaredMergeMethods(run: ConformanceCase, fixture: SourceControlConformanceFixture): readonly string[] {
  const { mergeMethods } = declaredCapabilities(run, fixture.provider);
  return MERGE_METHODS.filter((known) => mergeMethods.includes(known));
}

async function expectMerged(run: ConformanceCase, fixture: SourceControlConformanceFixture, method: string): Promise<void> {
  const { changeRequest } = await openPassingChangeRequest(run, fixture);
  const baseHead = await readBaseHead(run, fixture);
  const merged = await succeeds(
    run,
    `mergeChangeRequest with ${method}`,
    mergeCall(fixture, changeRequest, changeRequest.headCommit, method),
    readMergeResult,
  );
  run.expect(merged.method === method, `mergeChangeRequest with ${method} returned method ${merged.method}`);
  run.expect(merged.changeRequest === changeRequest.id, `mergeChangeRequest returned ${merged.changeRequest}, not ${changeRequest.id}`);
  const read = await readBack(run, fixture, changeRequest);
  run.expect(read.state === 'merged', `after mergeChangeRequest with ${method} the change request is ${read.state}`);
  await expectMergeCommit(run, fixture, { mergeCommit: merged.mergeCommit, previousBase: baseHead, method });
}

interface ObservedMerge {
  readonly mergeCommit: string;
  readonly previousBase: string;
  readonly method: string;
}

// The merge commit is the new base head, and the service shows natively
// that the requested method made it.
async function expectMergeCommit(run: ConformanceCase, fixture: SourceControlConformanceFixture, merge: ObservedMerge): Promise<void> {
  const baseHead = await readBaseHead(run, fixture);
  run.expect(baseHead !== merge.previousBase, `mergeChangeRequest with ${merge.method} left ${fixture.baseBranch} unchanged`);
  run.expect(
    merge.mergeCommit === baseHead,
    `mergeChangeRequest with ${merge.method} returned mergeCommit ${merge.mergeCommit}, not the base head ${baseHead}`,
  );
  const observed = await fixtureStep(run, 'observeMergeMethod', () => fixture.observeMergeMethod(merge.mergeCommit));
  run.expect(observed === merge.method, `mergeChangeRequest with ${merge.method} merged by ${observed}`);
}

export async function checkUndeclaredMergeMethods(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<void> {
  const { mergeMethods } = declaredCapabilities(run, fixture.provider);
  const undeclared = MERGE_METHODS.filter((method) => !mergeMethods.includes(method));
  if (undeclared.length === 0) return;
  const { changeRequest } = await openPassingChangeRequest(run, fixture);
  for (const method of undeclared) {
    await expectMergeRefused(run, fixture, changeRequest, {
      label: `mergeChangeRequest with the undeclared method ${method}`,
      expectedHead: changeRequest.headCommit,
      method,
      code: 'unavailable',
    });
  }
}

async function openPassingChangeRequest(run: ConformanceCase, fixture: SourceControlConformanceFixture): Promise<GuardedChangeRequest> {
  const guarded = await openProtectedChangeRequest(run, fixture);
  await setStatuses(run, fixture, guarded.changeRequest.headCommit, guarded.requiredStatuses, 'success');
  return guarded;
}
