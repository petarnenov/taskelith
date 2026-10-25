import {
  launchRejection,
  launchRetryDelay,
  parseLaunchParameters,
  planJournalRecovery,
  workerLaunchDeadline,
  type CancellationTarget,
  type CommandId,
  type ExecutionExit,
  type ExecutionId,
  type JournaledExecution,
  type JournaledIntent,
  type JournalSnapshot,
  type LaunchAuthorityClient,
  type LaunchGrant,
  type LaunchParameters,
  type LaunchRejection,
  type LaunchRequest,
  type OperationId,
  type WorkerJournal,
} from '@taskelith/execution';
import { parseIdentifier, type Result } from '@taskelith/kernel';
import {
  sealWon,
  type DeadlineClock,
  type DeadlineReading,
  type ExecutionSupervision,
  type SupervisionFactory,
} from './execution-supervision.js';

// The provisional `ttl` and `skew` (operational targets), which bound the
// retries of an operation before any grant names its own.
const DEFAULT_PARAMETERS = required(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 }));

export const LAUNCH_POLL_MILLISECONDS = 1_000;

export interface LaunchOrchestratorOptions {
  readonly journal: WorkerJournal;
  readonly authority: LaunchAuthorityClient;
  readonly supervision: SupervisionFactory;
  readonly clock: DeadlineClock;
  // Resolves after the delay, or early once the signal aborts.
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  // A jitter draw in [0, 1).
  readonly draw: () => number;
  readonly newId: () => string;
  readonly pollMilliseconds?: number;
  // Told of a launch or pass that threw; the worker keeps running.
  readonly onFailure?: (error: unknown) => void;
}

// Launches each accepted, launchable intent under a current grant, and
// forwards journaled cancellations (design D1 to D5).
export class LaunchOrchestrator {
  readonly #options: LaunchOrchestratorOptions;
  readonly #launches = new Map<string, Launch>();
  readonly #running = new Map<string, Promise<void>>();
  readonly #forwarded = new Set<string>();
  #wake: () => void = () => undefined;

  constructor(options: LaunchOrchestratorOptions) {
    this.#options = options;
  }

  // Asks for a pass at once, for example after intake journaled a command.
  readonly notify = (): void => this.#wake();

  // Passes at the poll interval and on every notification, until aborted;
  // then waits for every launch to stop.
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const woken = new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
      await this.pass(signal).catch((error: unknown) => this.#failed(error));
      await Promise.race([woken, this.#options.sleep(this.#options.pollMilliseconds ?? LAUNCH_POLL_MILLISECONDS, signal)]);
    }
    await this.settled();
  }

  // One pass over the journal: new launches and cancellations to forward.
  async pass(signal: AbortSignal): Promise<void> {
    const snapshot = this.#options.journal.snapshot();
    if (!reported(this.#options, snapshot)) return;
    for (const action of planJournalRecovery(snapshot.value)) {
      if (action.kind === 'continue-launch') this.#launch(action.assignmentId, snapshot.value, signal);
      if (action.kind === 'forward-cancellation') await this.#forward(action.commandId, action.target, snapshot.value);
    }
  }

  // Settles once no launch is running.
  async settled(): Promise<void> {
    while (this.#running.size > 0) await Promise.all(this.#running.values());
  }

  // An execution left before its terminal fact, by a stop or an earlier
  // process, waits for start reconciliation (20d), never a new launch.
  #launch(assignmentId: string, snapshot: JournalSnapshot, signal: AbortSignal): void {
    const intent = snapshot.intents.find((candidate) => candidate.assignmentId === assignmentId);
    const unsettled = snapshot.executions.some((execution) => execution.assignmentId === assignmentId && execution.state !== 'not-started');
    if (intent === undefined || unsettled || this.#launches.has(assignmentId)) return;
    // Registered before it runs, so a cancellation always finds it.
    const launch = new Launch(this.#options, intent, signal);
    this.#launches.set(assignmentId, launch);
    const done = launch.run().catch((error: unknown) => this.#failed(error)).finally(() => {
      this.#launches.delete(assignmentId);
      this.#running.delete(assignmentId);
      this.#wake();
    });
    this.#running.set(assignmentId, done);
  }

  // Any target cancels its whole intent, as the recovery plan reads it: the
  // launch stops, and evidence waits until it ended (design D5).
  async #forward(commandId: CommandId, target: CancellationTarget, snapshot: JournalSnapshot): Promise<void> {
    const reason = `cancellation ${commandId}`;
    const assignments = targetedAssignments(target, snapshot);
    const launches = [...assignments].flatMap((assignmentId) => this.#launches.get(assignmentId) ?? []);
    for (const launch of launches) launch.cancel(reason);
    const executions = snapshot.executions.filter(({ assignmentId }) => assignments.has(assignmentId));
    for (const execution of executions) {
      const key = `${commandId}/${execution.executionId}`;
      if (!needsCancelFile(execution, this.#launches.has(execution.assignmentId)) || this.#forwarded.has(key)) continue;
      if (cancelFiled(await this.#options.supervision(execution.executionId).cancel(reason))) this.#forwarded.add(key);
    }
    if (launches.length === 0 && executions.every(isSettled)) {
      reported(this.#options, this.#options.journal.recordCancellationEvidence(commandId));
    }
  }

  #failed(error: unknown): void {
    this.#options.onFailure?.(error);
  }
}

// The intents a cancellation names: the attempt's, or the execution's.
function targetedAssignments(target: CancellationTarget, snapshot: JournalSnapshot): ReadonlySet<string> {
  const named = target.kind === 'attempt'
    ? snapshot.intents.filter(({ attemptId }) => attemptId === target.attemptId)
    : snapshot.executions.filter(({ executionId }) => executionId === target.executionId);
  return new Set(named.map(({ assignmentId }) => assignmentId));
}

function isTerminal(execution: JournaledExecution): boolean {
  return execution.state === 'exited' || execution.state === 'not-started';
}

// Nothing more happens to it: terminal, or never granted and finally
// rejected. A pending W2 is not settled; 20d reconciles it.
function isSettled(execution: JournaledExecution): boolean {
  return isTerminal(execution) || (execution.state === undefined && execution.authorizations.at(-1)?.outcome === 'rejected-final');
}

// A `cancel` file that already exists was forwarded before.
function cancelFiled(result: Result<void>): boolean {
  return result.ok || result.error.code === 'conflict';
}

// A commit whose failure changes no decision is still reported.
function reported<T>(options: LaunchOrchestratorOptions, result: Result<T>): result is Extract<Result<T>, { ok: true }> {
  if (!result.ok) options.onFailure?.(result.error);
  return result.ok;
}

// A live launch cancels its own execution; any other open one with a
// written record gets the `cancel` file.
function needsCancelFile(execution: JournaledExecution, launchLive: boolean): boolean {
  return !launchLive && !isTerminal(execution) && execution.recordWritten;
}

// How one authorization attempt of an execution ended.
type Authorized =
  | { readonly kind: 'grant'; readonly grant: LaunchGrant; readonly reading: DeadlineReading }
  | { readonly kind: 'abandon' }
  | { readonly kind: 'retry-operation' }
  | { readonly kind: 'end' };

// How one execution ended: launch another, or stop launching the intent.
type Executed = 'relaunch' | 'end';

// One intent's launches, until one runs to its end, a rejection is final,
// the intent is cancelled, or the worker stops.
class Launch {
  readonly #options: LaunchOrchestratorOptions;
  readonly #intent: JournaledIntent;
  readonly #stopping: AbortSignal;
  readonly #cancelling = new AbortController();
  readonly #signal: AbortSignal;
  #cancelReason: string | undefined;
  #retries = 0;

  constructor(options: LaunchOrchestratorOptions, intent: JournaledIntent, stopping: AbortSignal) {
    this.#options = options;
    this.#intent = intent;
    this.#stopping = stopping;
    this.#signal = AbortSignal.any([stopping, this.#cancelling.signal]);
  }

  cancel(reason: string): void {
    this.#cancelReason ??= reason;
    this.#cancelling.abort();
  }

  get #cancelled(): boolean {
    return this.#cancelReason !== undefined;
  }

  async run(): Promise<void> {
    while (!this.#signal.aborted) {
      const executionId = this.#newId('ExecutionId');
      if (executionId === undefined) return;
      if ((await this.#execute(executionId)) === 'end') return;
      await this.#backOff();
    }
  }

  async #execute(executionId: ExecutionId): Promise<Executed> {
    for (;;) {
      const authorized = await this.#authorize(executionId);
      switch (authorized.kind) {
        case 'end':
          return 'end';
        case 'abandon':
          return this.#abandon(executionId);
        case 'retry-operation':
          await this.#backOff();
          if (this.#signal.aborted) return this.#cancelled ? this.#abandon(executionId) : 'end';
          continue;
        case 'grant':
          return this.#supervise(executionId, authorized.grant, authorized.reading);
      }
    }
  }

  // W2, then the requests of one operation until a decision (design D2).
  async #authorize(executionId: ExecutionId): Promise<Authorized> {
    const operationId = this.#newId('OperationId');
    const reading = this.#options.clock.read();
    if (operationId === undefined || !reading.ok) return { kind: 'end' };
    const request = this.#request(executionId, operationId);
    if (!this.#options.journal.beginAuthorization(request).ok) return { kind: 'end' };
    const { workerId: _worker, ...sent } = request;
    for (;;) {
      if (this.#stopping.aborted) return { kind: 'end' };
      if (this.#cancelled) return { kind: 'abandon' };
      const answer = await this.#options.authority.authorize(sent);
      if (this.#stopping.aborted) return { kind: 'end' };
      if (!answer.ok) {
        if (!this.#beforeDeadline(reading.value, DEFAULT_PARAMETERS)) return { kind: 'abandon' };
        await this.#backOff();
        if (!this.#beforeDeadline(reading.value, DEFAULT_PARAMETERS)) return { kind: 'abandon' };
        continue;
      }
      const outcome = answer.value;
      switch (outcome.kind) {
        case 'granted':
          return this.#granted(outcome.grant, reading.value);
        case 'expired':
          return { kind: 'abandon' };
        case 'revoked':
          return this.#rejected(operationId, launchRejection(outcome.reason, `the grant was revoked: ${outcome.reason}`));
        case 'rejected':
          return this.#rejected(operationId, outcome.rejection);
      }
    }
  }

  // W3; a grant past the deadline, or of a cancelled launch, is never used.
  #granted(grant: LaunchGrant, reading: DeadlineReading): Authorized {
    if (!this.#options.journal.recordGrant(grant).ok) return { kind: 'end' };
    if (this.#cancelled || !this.#beforeDeadline(reading, grant.parameters)) return { kind: 'abandon' };
    return { kind: 'grant', grant, reading };
  }

  // W3 for a rejection; only a retryable one is tried again (section 6).
  #rejected(operationId: OperationId, rejection: LaunchRejection): Authorized {
    if (!this.#options.journal.recordLaunchRejection(operationId, rejection).ok) return { kind: 'end' };
    if (!rejection.retryable) return { kind: 'end' };
    return this.#cancelled ? { kind: 'abandon' } : { kind: 'retry-operation' };
  }

  // The deadline holds only in the boot of the reading, on a readable clock.
  #beforeDeadline(reading: DeadlineReading, parameters: LaunchParameters): boolean {
    const now = this.#options.clock.read();
    return now.ok && now.value.bootId === reading.bootId
      && now.value.milliseconds < workerLaunchDeadline(reading.milliseconds, parameters);
  }

  // Before W4 nothing can spawn: seal, report `not-started` once the seal is
  // read back (W6), and launch a new execution unless cancelled (design D3).
  async #abandon(executionId: ExecutionId): Promise<Executed> {
    const sealed = await this.#options.supervision(executionId).seal();
    if (!sealed.ok) return 'end';
    if (!sealWon(sealed.value).ok) return this.#claimedBeforeW4(executionId);
    return this.#notStarted(executionId);
  }

  // No supervisor of this launch can claim before W4, so a claim is a record
  // nobody journaled: journal it, where a grant allows, and report uncertain.
  #claimedBeforeW4(executionId: ExecutionId): Executed {
    reported(this.#options, this.#options.journal.recordExecutionRecordWritten(executionId));
    return this.#recordUncertain(executionId);
  }

  #notStarted(executionId: ExecutionId): Executed {
    if (!this.#options.journal.recordNotStarted(executionId).ok) return 'end';
    return this.#cancelled || this.#stopping.aborted ? 'end' : 'relaunch';
  }

  // CP2 to CP4, then the facts the supervisor writes (design D4).
  async #supervise(executionId: ExecutionId, grant: LaunchGrant, reading: DeadlineReading): Promise<Executed> {
    const supervision = this.#options.supervision(executionId);
    const deadline = { bootId: reading.bootId, milliseconds: workerLaunchDeadline(reading.milliseconds, grant.parameters) };
    const { attemptId, ownershipGeneration } = this.#intent;
    const prepared = await supervision.prepare({ attemptId, ownershipGeneration, launchAuthId: grant.launchAuthId, deadline });
    if (!prepared.ok) return this.#abandon(executionId);
    if (!this.#options.journal.recordExecutionRecordWritten(executionId).ok) return 'end';
    if (this.#cancelled) return this.#sealWritten(executionId, supervision);
    const started = await supervision.start();
    if (!started.ok) return this.#recover(executionId, supervision, grant);
    return this.#observe(executionId, supervision, grant);
  }

  // A record without a supervisor: a won seal proves nothing can spawn.
  async #sealWritten(executionId: ExecutionId, supervision: ExecutionSupervision): Promise<Executed> {
    const sealed = await supervision.seal();
    if (!sealed.ok) return 'end';
    if (!sealWon(sealed.value).ok) return this.#recordUncertain(executionId);
    return this.#notStarted(executionId);
  }

  async #recover(executionId: ExecutionId, supervision: ExecutionSupervision, grant: LaunchGrant): Promise<Executed> {
    const recovered = await supervision.recover();
    if (!recovered.ok) return 'end';
    switch (recovered.value.fact) {
      case 'not-started':
        return this.#notStarted(executionId);
      case 'exited':
        return this.#recordExit(executionId, recovered.value.exit);
      case 'observe':
        return this.#observe(executionId, supervision, grant);
      case 'uncertain':
        return this.#recordUncertain(executionId);
    }
  }

  // Reads the record at the poll interval until a terminal fact; a cancel
  // wakes it to forward at once. A stop leaves it to the next start.
  async #observe(executionId: ExecutionId, supervision: ExecutionSupervision, grant: LaunchGrant): Promise<Executed> {
    let started = false;
    let forwarded = false;
    while (!this.#stopping.aborted) {
      if (this.#cancelled && !forwarded) forwarded = cancelFiled(await supervision.cancel(this.#cancelReason ?? ''));
      const facts = await supervision.read();
      if (!facts.ok) return 'end';
      if (facts.value.problems.length > 0) return this.#recordUncertain(executionId);
      if (facts.value.launch?.kind === 'seal') return this.#notStarted(executionId);
      if (!started && facts.value.process !== undefined) {
        if (!this.#options.journal.recordStart(executionId, grant.launchAuthId, facts.value.process).ok) return 'end';
        started = true;
      }
      if (facts.value.exit !== undefined) return this.#recordExit(executionId, facts.value.exit);
      const wakeOn = forwarded ? this.#stopping : this.#signal;
      await this.#options.sleep(this.#options.pollMilliseconds ?? LAUNCH_POLL_MILLISECONDS, wakeOn);
    }
    return 'end';
  }

  #recordExit(executionId: ExecutionId, exit: ExecutionExit): Executed {
    reported(this.#options, this.#options.journal.recordExit(executionId, exit));
    return 'end';
  }

  #recordUncertain(executionId: ExecutionId): Executed {
    reported(this.#options, this.#options.journal.recordUncertain(executionId));
    return 'end';
  }

  #request(executionId: ExecutionId, operationId: OperationId): LaunchRequest {
    const { workerId } = this.#options.journal.binding;
    const { recoveryEpoch, assignmentId, attemptId, ownershipGeneration, admissionId, admissionGeneration } = this.#intent;
    return {
      operationId, workerId, recoveryEpoch, assignmentId, attemptId, ownershipGeneration, executionId, admissionId, admissionGeneration,
      reportsNotStarted: false,
    };
  }

  // The retry counter grows across operations and executions of the launch.
  async #backOff(): Promise<void> {
    this.#retries += 1;
    await this.#options.sleep(launchRetryDelay(this.#retries, this.#options.draw()), this.#signal);
  }

  #newId<Kind extends 'ExecutionId' | 'OperationId'>(kind: Kind) {
    const parsed = parseIdentifier(kind, this.#options.newId());
    return parsed.ok ? parsed.value : undefined;
  }
}

function required<T>(result: Result<T>): T {
  if (!result.ok) throw new TypeError(result.error.message);
  return result.value;
}
