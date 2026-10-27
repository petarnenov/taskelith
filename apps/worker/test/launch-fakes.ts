import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type AdmissionPressureCause,
  launchRejection,
  parseLaunchParameters,
  parseRecoveryEpoch,
  type ExecutionExit,
  type ExecutionId,
  type ExecutionProcess,
  type JournalBinding,
  type JournaledCommand,
  type LaunchAuthorityClient,
  type LaunchAuthorizationRequest,
  type LaunchGrant,
  type LaunchIntent,
  type LaunchOutcome,
  type LaunchRequest,
} from '@taskelith/execution';
import { err, failure, ok, parseInstant, type Result } from '@taskelith/kernel';
import { parseGeneration, parseOwnershipGeneration } from '@taskelith/sdlc';
import { id, value } from '@taskelith/testing';
import type { AdmissionCheck, DaemonOverheadSource, ExecutionSupervision, LaunchPlan, RecoveryRound, SupervisedFacts, SupervisedRecovery } from '@taskelith/worker';
import { enrollWorkerRoot, type WorkerEnrollment, type WorkerRoot } from '@taskelith/worker-journal';
import type { DeadlineClock, DeadlineReading, LaunchRecord } from '@taskelith/worker-supervisor';

export const T0 = value(parseInstant('2026-10-25T09:00:00.000Z'));
export const BOOT = 'boot-1';
export const PROCESS: ExecutionProcess = { platform: 'darwin', bootId: BOOT, pid: 4242, startTime: 7, processGroupId: 4242 };
export const CLEAN_EXIT: ExecutionExit = { status: { kind: 'code', code: 0 }, startProven: true, termination: 'process-group-empty' };

const BINDING: JournalBinding = {
  installationId: id('InstallationId', 'installation1'), workerId: id('WorkerId', 'worker-1'), journalId: id('JournalId', 'journal-1'),
  recoveryEpoch: value(parseRecoveryEpoch(1)),
};
const ENROLLMENT: WorkerEnrollment = { ...BINDING, credentialGeneration: 1, credentials: { controlPlane: 'tkwk_test', broker: 'creds' } };

// A real journal in a temporary data root.
export function temporaryJournal(): { readonly root: WorkerRoot; readonly remove: () => void } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-launch-')));
  const probe = () => ok({ platform: 'darwin' as const, filesystem: 'apfs', local: true });
  const root = value(enrollWorkerRoot({ dataRoot: join(base, 'data'), clock: { now: () => T0 }, probe }, ENROLLMENT));
  return { root, remove: () => {
    root.close();
    rmSync(base, { recursive: true, force: true });
  } };
}

export function intentOf(number = 1): LaunchIntent {
  return {
    assignmentId: id('AssignmentId', `assignment-${number}`), attemptId: id('AttemptId', `attempt-${number}`),
    ownershipGeneration: value(parseOwnershipGeneration(2)), admissionId: id('AdmissionId', `admission-${number}`),
    admissionGeneration: value(parseGeneration(1)), recoveryEpoch: BINDING.recoveryEpoch,
    requested: { cpuMillicores: 1000, memoryMebibytes: 1024, hardControls: [] },
  };
}

export function offer(number = 1): JournaledCommand {
  return {
    commandId: id('CommandId', `offer-${number}`), digest: `digest-offer-${number}`, correlationId: id('CorrelationId', 'correlation-1'),
    outcome: 'accepted', kind: 'assignment', intent: intentOf(number),
  };
}

export function cancellation(number: number, target: { attemptId?: string; executionId?: string }): JournaledCommand {
  const kind = target.executionId === undefined ? 'attempt' : 'execution';
  return {
    commandId: id('CommandId', `cancel-${number}`), digest: `digest-cancel-${number}`, correlationId: id('CorrelationId', 'correlation-1'),
    outcome: 'accepted', kind: 'cancellation',
    target: kind === 'attempt'
      ? { kind, attemptId: id('AttemptId', target.attemptId ?? '') }
      : { kind, executionId: id('ExecutionId', target.executionId ?? '') },
  };
}

// The suspend-inclusive clock; `sleep` advances it by the delay slept.
export class FakeClock implements DeadlineClock {
  milliseconds = 1_000;
  bootId = BOOT;
  readable = true;

  read(): Result<DeadlineReading> {
    if (!this.readable) return err(failure('unavailable', 'the deadline clock cannot be read'));
    return ok({ bootId: this.bootId, milliseconds: this.milliseconds });
  }
}

export type Answer = Result<LaunchOutcome> | ((request: LaunchAuthorizationRequest) => Result<LaunchOutcome>);

// Answers each request from a script; the last answer repeats.
export class FakeAuthority implements LaunchAuthorityClient {
  readonly requests: LaunchAuthorizationRequest[] = [];
  answers: Answer[] = [];
  onRequest: () => void = () => undefined;

  async authorize(request: LaunchAuthorizationRequest): Promise<Result<LaunchOutcome>> {
    this.requests.push(request);
    this.onRequest();
    const answer = (this.answers.length > 1 ? this.answers.shift() : this.answers[0]) ?? unavailable();
    return typeof answer === 'function' ? answer(request) : answer;
  }
}

export function unavailable(): Result<LaunchOutcome> {
  return err(failure('unavailable', 'the control plane did not answer'));
}

export function granted(ttlMilliseconds = 30_000): (request: LaunchAuthorizationRequest) => Result<LaunchOutcome> {
  return (request) => ok({ kind: 'granted', grant: grantFor(request, ttlMilliseconds) });
}

// Grants as the ownership rule allows: another execution only once the
// owning one is reported sealed (launch authorization section 4).
export function grantedToOwner(initialOwner?: string): (request: LaunchAuthorizationRequest) => Result<LaunchOutcome> {
  let owner = initialOwner;
  return (request) => {
    const sealed = request.reportsNotStartedFor?.some(({ executionId }) => executionId === owner) === true;
    if (owner !== undefined && owner !== request.executionId && !sealed) {
      return ok({ kind: 'rejected', rejection: launchRejection('execution-conflict', `execution ${owner} owns the attempt`) });
    }
    owner = request.executionId;
    return ok({ kind: 'granted', grant: grantFor(request) });
  };
}

export function grantFor(request: LaunchAuthorizationRequest, ttlMilliseconds = 30_000): LaunchGrant {
  return {
    ...request, workerId: BINDING.workerId, launchAuthId: id('LaunchAuthId', `grant-${request.operationId}`), reliedOnGates: [], artifacts: [],
    policyRevision: id('PolicyRevision', 'policy-1'), issuedAt: T0, state: 'granted',
    parameters: value(parseLaunchParameters({ ttlMilliseconds, skewMilliseconds: 5_000 })),
  };
}

// A read as a test scripts it; no cancellation is unapplied unless named.
export type ScriptedFacts = Omit<SupervisedFacts, 'cancellationNotApplied'> & { readonly cancellationNotApplied?: boolean };

// One execution's record in memory; `facts` is what each read returns
// next, and the last one repeats.
export class FakeSupervision implements ExecutionSupervision {
  readonly calls: string[] = [];
  plan: LaunchPlan | undefined;
  launch: LaunchRecord | undefined;
  facts: ScriptedFacts[] = [{ problems: [] }];
  startResult: Result<void> = ok(undefined);
  prepareResult: Result<void> = ok(undefined);
  sealResult: Result<void> = ok(undefined);
  recoverResult: Result<void> = ok(undefined);
  // When false, a scripted spawn is read back without a launch record.
  claimSpawns = true;
  recovery: SupervisedRecovery = { fact: 'not-started' };
  // Recoveries to return first, before `recovery` repeats.
  recoveries: SupervisedRecovery[] = [];
  readonly rounds: RecoveryRound[] = [];
  removeResult: Result<void> = ok(undefined);
  cancelled: string | undefined;

  async prepare(plan: LaunchPlan): Promise<Result<void>> {
    this.calls.push('prepare');
    this.plan = plan;
    return this.prepareResult;
  }

  async start(): Promise<Result<void>> {
    this.calls.push('start');
    return this.startResult;
  }

  async seal(): Promise<Result<LaunchRecord>> {
    this.calls.push('seal');
    if (!this.sealResult.ok) return this.sealResult;
    this.launch ??= { kind: 'seal', by: 'worker', reason: 'recovery' };
    return ok(this.launch);
  }

  async cancel(reason: string): Promise<Result<void>> {
    this.calls.push('cancel');
    this.cancelled = reason;
    return ok(undefined);
  }

  // A spawn the script names is claimed under the planned grant, unless the
  // script names its own launch record or claims are off.
  async read(): Promise<Result<SupervisedFacts>> {
    this.calls.push('read');
    const scripted = (this.facts.length > 1 ? this.facts.shift() : this.facts[0]) ?? { problems: [] };
    const facts = { cancellationNotApplied: false, ...scripted };
    if (!this.claimSpawns || facts.launch !== undefined || facts.process === undefined || this.plan === undefined) return ok(facts);
    return ok({ ...facts, launch: { kind: 'claim', launchAuthId: this.plan.launchAuthId, supervisor: 1 } });
  }

  async recover(round: RecoveryRound): Promise<Result<SupervisedRecovery>> {
    this.calls.push('recover');
    this.rounds.push(round);
    if (!this.recoverResult.ok) return this.recoverResult;
    return ok(this.recoveries.shift() ?? this.recovery);
  }

  async remove(): Promise<Result<void>> {
    this.calls.push('remove');
    return this.removeResult;
  }
}

// Every execution's fake, created on first use.
export class FakeSupervisions {
  readonly byExecution = new Map<string, FakeSupervision>();
  // Scripts each new execution's fake when it is first used.
  onCreated: (supervision: FakeSupervision) => void = () => undefined;

  readonly factory = (executionId: ExecutionId): FakeSupervision => {
    let supervision = this.byExecution.get(executionId);
    if (supervision === undefined) {
      supervision = new FakeSupervision();
      this.onCreated(supervision);
      this.byExecution.set(executionId, supervision);
    }
    return supervision;
  };

  get all(): FakeSupervision[] {
    return [...this.byExecution.values()];
  }
}

// The W2 request of an intent's execution, as an earlier process sent it.
export function requestOf(executionId: string, operationId: string, number = 1): LaunchRequest {
  const intent = intentOf(number);
  return {
    operationId: id('OperationId', operationId), workerId: BINDING.workerId, recoveryEpoch: intent.recoveryEpoch,
    assignmentId: intent.assignmentId, attemptId: intent.attemptId, ownershipGeneration: intent.ownershipGeneration,
    executionId: id('ExecutionId', executionId), admissionId: intent.admissionId,
    admissionGeneration: intent.admissionGeneration, reportsNotStarted: false,
  };
}

// Admission pressure as a test sets it; each refresh is counted.
export class FakePressure implements AdmissionCheck {
  causes: Result<readonly AdmissionPressureCause[]> = ok([]);
  refreshes = 0;

  refresh(): Result<readonly AdmissionPressureCause[]> {
    this.refreshes += 1;
    return this.causes;
  }
}

// The daemon's overhead as a test sets it; its watch only waits for the
// stop.
export class FakeDaemon implements DaemonOverheadSource {
  resident: Result<number> = ok(64 * 2 ** 20);
  lag: Result<number> = ok(0);
  watches = 0;

  residentBytes(): Result<number> {
    return this.resident;
  }

  eventLoopLagMilliseconds(): Result<number> {
    return this.lag;
  }

  async watch(signal: AbortSignal): Promise<void> {
    this.watches += 1;
    if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
  }
}
