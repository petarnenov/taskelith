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
  type RecoveryAction,
  type WorkerJournal,
} from '@taskelith/execution';
import { ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { AdmissionCheck } from './admission-pressure.js';
import {
  sealWon,
  type DeadlineClock,
  type DeadlineReading,
  type ExecutionSupervision,
  type RecordListing,
  type SupervisionFactory,
} from './execution-supervision-port.js';
import { cancelFiled, ExecutionWatch, type Watched, type WatchTarget } from './execution-watch.js';

// The provisional `ttl` and `skew` (operational targets), which bound the
// retries of an operation before any grant names its own.
const DEFAULT_PARAMETERS = required(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 }));

export const LAUNCH_POLL_MILLISECONDS = 1_000;

export interface LaunchOrchestratorOptions {
  readonly journal: WorkerJournal;
  readonly authority: LaunchAuthorityClient;
  readonly supervision: SupervisionFactory;
  readonly clock: DeadlineClock;
  // Under admission pressure no launch authorization is requested.
  readonly pressure: AdmissionCheck;
  // Resolves after the delay, or early once the signal aborts.
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  // A jitter draw in [0, 1).
  readonly draw: () => number;
  readonly newId: () => string;
  readonly pollMilliseconds?: number;
  // The records on disk, for the leftovers a start reports.
  readonly records?: RecordListing;
  readonly logger?: Logger;
  // Told of a launch or pass that threw; the worker keeps running.
  readonly onFailure?: (error: unknown) => void;
}

// Launches each accepted, launchable intent under a current grant, forwards
// journaled cancellations, and reconciles what an earlier process left.
export class LaunchOrchestrator {
  readonly #options: LaunchOrchestratorOptions;
  readonly #logger: Logger;
  readonly #watch: ExecutionWatch;
  readonly #launches = new Map<string, Launch>();
  readonly #running = new Map<string, Promise<void>>();
  readonly #forwarded = new Set<string>();
  // Executions an earlier process left open, until each is reconciled once.
  #inherited: Set<ExecutionId> | undefined;
  #wake: () => void = () => undefined;

  constructor(options: LaunchOrchestratorOptions) {
    this.#options = options;
    this.#logger = options.logger ?? SILENT_LOGGER;
    this.#watch = new ExecutionWatch({ ...options, logger: this.#logger, onFailure: (error) => this.#failed(error) });
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

  // One pass over the journal: the recovery plan's actions, then the
  // records whose terminal fact is confirmed.
  async pass(signal: AbortSignal): Promise<void> {
    const snapshot = this.#options.journal.snapshot();
    if (!reported(this.#options, snapshot)) return;
    const actions = planJournalRecovery(snapshot.value);
    if (this.#inherited === undefined) await this.#beginReconciliation(snapshot.value, actions);
    for (const action of actions) await this.#act(action, snapshot.value, signal);
    await this.#removeConfirmedRecords();
  }

  // Settles once no launch or reconciliation is running.
  async settled(): Promise<void> {
    while (this.#running.size > 0) await Promise.all(this.#running.values());
  }

  async #act(action: RecoveryAction, snapshot: JournalSnapshot, signal: AbortSignal): Promise<void> {
    switch (action.kind) {
      case 'continue-launch':
        this.#launch(action.assignmentId, snapshot, signal);
        return;
      case 'forward-cancellation':
        return this.#forward(action.commandId, action.target, snapshot);
      case 'retry-authorization':
        return this.#resume(action.executionId, snapshot, signal);
      case 'seal-execution':
      case 'recover-execution-record':
        return this.#reconcile(action.executionId, snapshot, signal);
    }
  }

  // The first pass logs the plan and the records no journal row names; the
  // open executions it finds are the inherited ones.
  async #beginReconciliation(snapshot: JournalSnapshot, actions: readonly RecoveryAction[]): Promise<void> {
    this.#inherited = new Set(openExecutions(snapshot));
    const counts: Record<string, number> = {};
    for (const { kind } of actions) counts[kind] = (counts[kind] ?? 0) + 1;
    this.#logger.info('worker.reconciliation.planned', { inherited: this.#inherited.size, ...counts });
    const listed = await this.#options.records?.();
    if (listed === undefined || !reported(this.#options, listed)) return;
    const journaled = new Set<string>(snapshot.executions.map(({ executionId }) => executionId));
    for (const name of listed.value.filter((entry) => !journaled.has(entry))) {
      this.#logger.warn('worker.execution.leftover', { record: name });
    }
  }

  // An execution left before its terminal fact, by a stop or an earlier
  // process, is reconciled once and never launched again.
  #launch(assignmentId: string, snapshot: JournalSnapshot, signal: AbortSignal, resume?: ExecutionId): boolean {
    const intent = snapshot.intents.find((candidate) => candidate.assignmentId === assignmentId);
    const unsettled = snapshot.executions.some((execution) => execution.assignmentId === assignmentId
      && execution.executionId !== resume && execution.state !== 'not-started');
    if (intent === undefined || unsettled || this.#launches.has(assignmentId)) return false;
    // Registered before it runs, so a cancellation always finds it.
    const launch = new Launch({
      options: this.#options, watch: this.#watch, intent, stopping: signal,
      cancellations: (executionId) => this.#cancellationsOf(assignmentId, executionId),
      ...(resume === undefined ? {} : { resume }),
    });
    this.#launches.set(assignmentId, launch);
    this.#track(assignmentId, launch.run(), () => this.#launches.delete(assignmentId));
    return true;
  }

  // W3 with a retryable rejection or an expired operation: a new operation
  // for the same execution (journal section 5).
  #resume(executionId: ExecutionId, snapshot: JournalSnapshot, signal: AbortSignal): void {
    const execution = snapshot.executions.find((candidate) => candidate.executionId === executionId);
    if (execution === undefined || this.#inherited?.has(executionId) !== true) return;
    if (this.#launch(execution.assignmentId, snapshot, signal, executionId)) this.#claimInherited(executionId);
  }

  // A pending W2 or an unused grant is sealed; a journaled record goes to
  // the recovery table. A live launch reconciles its own executions.
  #reconcile(executionId: ExecutionId, snapshot: JournalSnapshot, signal: AbortSignal): void {
    const execution = snapshot.executions.find((candidate) => candidate.executionId === executionId);
    if (execution === undefined || this.#launches.has(execution.assignmentId) || !this.#claimInherited(executionId)) return;
    const target = this.#target(execution, snapshot, signal);
    const watched = execution.recordWritten ? this.#watch.reconcile(target) : this.#sealUnwritten(target);
    this.#track(`execution/${executionId}`, watched, () => undefined);
  }

  #claimInherited(executionId: ExecutionId): boolean {
    return this.#inherited?.delete(executionId) === true;
  }

  // Before W4 no supervisor can claim; a lost seal is a record nobody
  // journaled, reported uncertain where a grant allows.
  async #sealUnwritten(target: WatchTarget): Promise<Watched> {
    const sealed = await target.supervision.seal();
    if (!reported(this.#options, sealed)) return 'ended';
    const { journal } = this.#options;
    if (sealWon(sealed.value).ok) return reported(this.#options, journal.recordNotStarted(target.executionId)) ? 'not-started' : 'ended';
    this.#logger.warn('worker.execution.uncertain', { executionId: target.executionId, reason: 'claimed before W4' });
    if (reported(this.#options, journal.recordExecutionRecordWritten(target.executionId))) {
      reported(this.#options, journal.recordUncertain(target.executionId));
    }
    return 'ended';
  }

  #target(execution: JournaledExecution, snapshot: JournalSnapshot, signal: AbortSignal): WatchTarget {
    const { executionId } = execution;
    const launchAuthId = [...execution.authorizations].reverse().find(({ outcome }) => outcome === 'granted')?.launchAuthId;
    return {
      executionId, supervision: this.#options.supervision(executionId), launchAuthId, stopping: signal, wake: signal,
      cancelReason: () => undefined,
      cancellations: () => this.#cancellationsOf(execution.assignmentId, executionId),
    };
  }

  // The journaled cancellations that name an execution or its attempt.
  #cancellationsOf(assignmentId: string, executionId: ExecutionId): Result<readonly CommandId[]> {
    const snapshot = this.#options.journal.snapshot();
    if (!snapshot.ok) return snapshot;
    const intent = snapshot.value.intents.find((candidate) => candidate.assignmentId === assignmentId);
    return ok(snapshot.value.cancellations.filter(({ target }) => target.kind === 'execution'
      ? target.executionId === executionId
      : target.attemptId === intent?.attemptId).map(({ commandId }) => commandId));
  }

  // Item 4: only after the terminal fact is confirmed; a supervisor still
  // holding its lock leaves the record for a later pass.
  async #removeConfirmedRecords(): Promise<void> {
    const removable = this.#options.journal.removableRecords();
    if (!reported(this.#options, removable)) return;
    for (const executionId of removable.value) {
      const removed = await this.#options.supervision(executionId).remove();
      if (!removed.ok) {
        this.#logger.debug('worker.execution.record-kept', { executionId, reason: removed.error.message });
        continue;
      }
      if (reported(this.#options, this.#options.journal.recordRecordRemoved(executionId))) {
        this.#logger.debug('worker.execution.record-removed', { executionId });
      }
    }
  }

  #track(key: string, work: Promise<unknown>, cleanup: () => void): void {
    const done = work.catch((error: unknown) => this.#failed(error)).then(() => undefined).finally(() => {
      cleanup();
      this.#running.delete(key);
      this.#wake();
    });
    this.#running.set(key, done);
  }

  // Any target cancels its whole intent, as the recovery plan reads it: the
  // launch stops, and evidence waits until it ended.
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

// The executions not yet terminal: at a start, those an earlier process left.
export function openExecutions(snapshot: JournalSnapshot): ExecutionId[] {
  return snapshot.executions.filter((execution) => !isTerminal(execution)).map(({ executionId }) => executionId);
}

function isTerminal(execution: JournaledExecution): boolean {
  return execution.state === 'exited' || execution.state === 'not-started';
}

// With no live launch, nothing more happens to it: terminal, or never
// granted and closed. A pending W2 is not settled until it is sealed.
function isSettled(execution: JournaledExecution): boolean {
  const outcome = execution.authorizations.at(-1)?.outcome;
  const closed = outcome === 'rejected-final' || outcome === 'rejected-retryable' || outcome === 'expired';
  return isTerminal(execution) || (execution.state === undefined && closed);
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

// What one intent's launches work with; `resume` continues an execution
// whose last operation closed without a grant.
interface LaunchContext {
  readonly options: LaunchOrchestratorOptions;
  readonly watch: ExecutionWatch;
  readonly intent: JournaledIntent;
  readonly stopping: AbortSignal;
  readonly cancellations: (executionId: ExecutionId) => Result<readonly CommandId[]>;
  readonly resume?: ExecutionId;
}

// One intent's launches, until one runs to its end, a rejection is final,
// the intent is cancelled, or the worker stops.
class Launch {
  readonly #context: LaunchContext;
  readonly #options: LaunchOrchestratorOptions;
  readonly #intent: JournaledIntent;
  readonly #stopping: AbortSignal;
  readonly #cancelling = new AbortController();
  readonly #signal: AbortSignal;
  #cancelReason: string | undefined;
  #retries = 0;

  constructor(context: LaunchContext) {
    this.#context = context;
    this.#options = context.options;
    this.#intent = context.intent;
    this.#stopping = context.stopping;
    this.#signal = AbortSignal.any([context.stopping, this.#cancelling.signal]);
  }

  cancel(reason: string): void {
    this.#cancelReason ??= reason;
    this.#cancelling.abort();
  }

  get #cancelled(): boolean {
    return this.#cancelReason !== undefined;
  }

  async run(): Promise<void> {
    let resume = this.#context.resume;
    while (!this.#signal.aborted) {
      const executionId = resume ?? this.#newId('ExecutionId');
      if (executionId === undefined) return;
      if ((await this.#execute(executionId, resume !== undefined)) === 'end') return;
      resume = undefined;
      await this.#backOff();
    }
  }

  // An execution authorized again reports that it has not started, so a
  // grant the authority recorded for an earlier operation is renewed.
  async #execute(executionId: ExecutionId, authorizedBefore: boolean): Promise<Executed> {
    for (let reportsNotStarted = authorizedBefore; ; reportsNotStarted = true) {
      const authorized = await this.#authorize(executionId, reportsNotStarted);
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
  async #authorize(executionId: ExecutionId, reportsNotStarted: boolean): Promise<Authorized> {
    await this.#awaitAdmission();
    if (this.#stopping.aborted) return { kind: 'end' };
    const operationId = this.#newId('OperationId');
    const reading = this.#options.clock.read();
    if (operationId === undefined || !reading.ok) return { kind: 'end' };
    const request = this.#request(executionId, operationId, reportsNotStarted);
    if (!this.#options.journal.beginAuthorization(request).ok) return { kind: 'end' };
    const { workerId: _worker, ...sent } = request;
    for (;;) {
      if (this.#stopping.aborted) return { kind: 'end' };
      if (this.#cancelled) return { kind: 'abandon' };
      const answer = await this.#options.authority.authorize(sent);
      if (this.#stopping.aborted) return { kind: 'end' };
      if (!answer.ok) {
        if (!this.#beforeDeadline(reading.value, DEFAULT_PARAMETERS)) return this.#expired(operationId);
        await this.#backOff();
        await this.#awaitAdmission();
        if (!this.#beforeDeadline(reading.value, DEFAULT_PARAMETERS)) return this.#expired(operationId);
        continue;
      }
      const outcome = answer.value;
      switch (outcome.kind) {
        case 'granted':
          return this.#granted(outcome.grant, reading.value);
        case 'expired':
          return this.#expired(operationId);
        case 'revoked':
          return this.#rejected(operationId, launchRejection(outcome.reason, `the grant was revoked: ${outcome.reason}`));
        case 'rejected':
          return this.#rejected(operationId, outcome.rejection);
      }
    }
  }

  // Capacity reservation section 8: the launch waits, keeping its
  // reservation, until the pressure clears or the launch stops.
  async #awaitAdmission(): Promise<void> {
    while (!this.#signal.aborted && this.#pressured()) {
      await this.#options.sleep(this.#options.pollMilliseconds ?? LAUNCH_POLL_MILLISECONDS, this.#signal);
    }
  }

  // Pressure that cannot be refreshed counts as pressure.
  #pressured(): boolean {
    const causes = this.#options.pressure.refresh();
    return !reported(this.#options, causes) || causes.value.length > 0;
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

  // W3 `expired`: no grant of the operation can be used, and nothing was
  // written, so the same execution is authorized again (design D2).
  #expired(operationId: OperationId): Authorized {
    if (!this.#options.journal.recordAuthorizationExpired(operationId).ok) return { kind: 'end' };
    return this.#cancelled ? { kind: 'abandon' } : { kind: 'retry-operation' };
  }

  // The deadline holds only in the boot of the reading, on a readable clock.
  #beforeDeadline(reading: DeadlineReading, parameters: LaunchParameters): boolean {
    const now = this.#options.clock.read();
    return now.ok && now.value.bootId === reading.bootId
      && now.value.milliseconds < workerLaunchDeadline(reading.milliseconds, parameters);
  }

  // Before W4 nothing can spawn: seal, report `not-started` once the seal is
  // read back (W6), and launch a new execution unless cancelled.
  async #abandon(executionId: ExecutionId): Promise<Executed> {
    const sealed = await this.#options.supervision(executionId).seal();
    if (!reported(this.#options, sealed)) return 'end';
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
    return this.#afterNotStarted();
  }

  #afterNotStarted(): Executed {
    return this.#cancelled || this.#stopping.aborted ? 'end' : 'relaunch';
  }

  // CP2 to CP4, then the facts the supervisor writes (design D3); a failed
  // start goes to the recovery table.
  async #supervise(executionId: ExecutionId, grant: LaunchGrant, reading: DeadlineReading): Promise<Executed> {
    const supervision = this.#options.supervision(executionId);
    const deadline = { bootId: reading.bootId, milliseconds: workerLaunchDeadline(reading.milliseconds, grant.parameters) };
    const { attemptId, ownershipGeneration } = this.#intent;
    const prepared = await supervision.prepare({ attemptId, ownershipGeneration, launchAuthId: grant.launchAuthId, deadline });
    if (!prepared.ok) return this.#abandon(executionId);
    if (!this.#options.journal.recordExecutionRecordWritten(executionId).ok) return 'end';
    if (this.#cancelled) return this.#sealWritten(executionId, supervision);
    const target = this.#target(executionId, supervision, grant);
    const started = await supervision.start();
    const watched = started.ok ? await this.#context.watch.observe(target) : await this.#context.watch.reconcile(target);
    return watched === 'not-started' ? this.#afterNotStarted() : 'end';
  }

  // A cancel wakes the watch to forward it at once; a stop leaves the
  // execution to the next start.
  #target(executionId: ExecutionId, supervision: ExecutionSupervision, grant: LaunchGrant): WatchTarget {
    return {
      executionId, supervision, launchAuthId: grant.launchAuthId, stopping: this.#stopping, wake: this.#signal,
      cancelReason: () => this.#cancelReason,
      cancellations: () => this.#context.cancellations(executionId),
    };
  }

  // A record without a supervisor: a won seal proves nothing can spawn.
  async #sealWritten(executionId: ExecutionId, supervision: ExecutionSupervision): Promise<Executed> {
    const sealed = await supervision.seal();
    if (!reported(this.#options, sealed)) return 'end';
    if (!sealWon(sealed.value).ok) return this.#recordUncertain(executionId);
    return this.#notStarted(executionId);
  }

  #recordUncertain(executionId: ExecutionId): Executed {
    reported(this.#options, this.#options.journal.recordUncertain(executionId));
    return 'end';
  }

  #request(executionId: ExecutionId, operationId: OperationId, reportsNotStarted: boolean): LaunchRequest {
    const { workerId } = this.#options.journal.binding;
    const { recoveryEpoch, assignmentId, attemptId, ownershipGeneration, admissionId, admissionGeneration } = this.#intent;
    return {
      operationId, workerId, recoveryEpoch, assignmentId, attemptId, ownershipGeneration, executionId, admissionId, admissionGeneration,
      reportsNotStarted,
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
