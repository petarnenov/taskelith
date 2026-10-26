import type { CommandId, ExecutionExit, ExecutionId, LaunchAuthId, WorkerJournal } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type { ExecutionSupervision, RecoveryRound, SupervisedFacts } from './execution-supervision-port.js';

export const WATCH_POLL_MILLISECONDS = 1_000;

// Every this many polls of a claimed record, the supervisor's liveness is
// checked, so a dead one is adopted or decided (design D3).
export const LIVENESS_POLLS = 10;

export interface WatchOptions {
  readonly journal: WorkerJournal;
  // Resolves after the delay, or early once the signal aborts.
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly pollMilliseconds?: number;
  readonly logger?: Logger;
  // Told of a journal or record failure; the worker keeps running.
  readonly onFailure?: (error: unknown) => void;
}

// One execution with a journaled record, as a watch follows it.
export interface WatchTarget {
  readonly executionId: ExecutionId;
  readonly supervision: ExecutionSupervision;
  // The journal's grant for it; a claim under another is no start of ours.
  readonly launchAuthId: LaunchAuthId | undefined;
  // Ends the watch; the next start reconciles what is left.
  readonly stopping: AbortSignal;
  // Wakes a poll early, as a new cancellation does.
  readonly wake: AbortSignal;
  // The cancellation to forward to the supervisor, if any.
  readonly cancelReason: () => string | undefined;
  // The cancellations a not-applied report answers.
  readonly cancellations: () => readonly CommandId[];
}

// How a watch ended: sealed without a spawn, or anything else.
export type Watched = 'not-started' | 'ended';

// What one watch has committed of an execution's record.
interface Committed {
  started: boolean;
  survivors: boolean;
  notApplied: boolean;
}

// Follows execution records to their terminal facts and commits each fact
// the supervisor wrote (W5s, W5e, W6, and the evidence beside them).
export class ExecutionWatch {
  readonly #options: WatchOptions;
  readonly #logger: Logger;

  constructor(options: WatchOptions) {
    this.#options = options;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  // Start reconciliation of a record a previous process journaled (W4):
  // the recovery table decides, and nothing is spawned (journal section 5).
  async reconcile(target: WatchTarget): Promise<Watched> {
    for (let round: RecoveryRound = 'first'; !target.stopping.aborted; round = 'after-retry') {
      const recovered = await target.supervision.recover(round);
      if (!this.#reported(recovered)) return 'ended';
      const { fact } = recovered.value;
      this.#logger.info('worker.execution.recovered', { executionId: target.executionId, fact, round });
      if (fact === 'uncertain') return this.#uncertain(target.executionId, recovered.value.reason);
      if (fact === 'not-started') return this.#notStarted(target.executionId);
      // An exit is read back with the spawn it ends, so W5s precedes W5e.
      if (fact !== 'retry') return this.observe(target);
      await this.#options.sleep(this.#poll, target.stopping);
    }
    return 'ended';
  }

  // Reads the record at the poll interval until a terminal fact (CP10 and
  // CP12); a claimed record's supervisor is checked for liveness.
  async observe(target: WatchTarget): Promise<Watched> {
    let forwarded = false;
    let round: RecoveryRound = 'first';
    const committed: Committed = { started: false, survivors: false, notApplied: false };
    for (let polls = 1; !target.stopping.aborted; polls += 1) {
      const reason = target.cancelReason();
      if (reason !== undefined && !forwarded) forwarded = cancelFiled(await target.supervision.cancel(reason));
      const facts = await target.supervision.read();
      if (!this.#reported(facts)) return 'ended';
      const decided = this.#commitFacts(target, facts.value, committed);
      if (decided !== undefined) return decided;
      if (facts.value.launch?.kind === 'claim' && polls % LIVENESS_POLLS === 0) {
        const checked = await this.#checkLiveness(target, round);
        if (checked !== 'observe' && checked !== 'retry') return checked;
        round = checked === 'retry' ? 'after-retry' : 'first';
      }
      // Once cancelled, the wake signal stays aborted and cannot wake it.
      await this.#options.sleep(this.#poll, reason === undefined ? target.wake : target.stopping);
    }
    return 'ended';
  }

  // The facts of one read, in the order the supervisor wrote them; each
  // is committed once per watch.
  #commitFacts(target: WatchTarget, facts: SupervisedFacts, committed: Committed): Watched | undefined {
    const { executionId } = target;
    const { journal } = this.#options;
    if (facts.problems.length > 0) {
      return this.#uncertain(executionId, facts.problems.map(({ file, detail }) => `${file} ${detail}`).join('; '));
    }
    if (facts.launch?.kind === 'seal') return this.#notStarted(executionId);
    if (!committed.started && facts.process !== undefined) {
      // The claim names the spawn's grant; another one is no start of ours.
      const claimed = facts.launch?.kind === 'claim' ? facts.launch.launchAuthId : undefined;
      if (target.launchAuthId === undefined || claimed !== target.launchAuthId) {
        return this.#uncertain(executionId, 'the record was claimed under another grant');
      }
      if (!this.#reported(journal.recordStart(executionId, target.launchAuthId, facts.process))) return 'ended';
      committed.started = true;
    }
    if (!committed.survivors && facts.survivors !== undefined) {
      committed.survivors = this.#reported(journal.recordTerminationUnproven(executionId, facts.survivors));
    }
    if (!committed.notApplied && facts.cancellationNotApplied) {
      const commands = target.cancellations();
      committed.notApplied = commands.every((commandId) => this.#reported(journal.recordCancellationNotApplied(commandId, executionId)));
    }
    return facts.exit === undefined ? undefined : this.#exited(executionId, facts.exit);
  }

  // A live or newly adopting supervisor keeps the watch going; anything
  // else was decided by the recovery table and is read back next poll.
  async #checkLiveness(target: WatchTarget, round: RecoveryRound): Promise<Watched | 'observe' | 'retry'> {
    const recovered = await target.supervision.recover(round);
    if (!this.#reported(recovered)) return 'ended';
    const { fact } = recovered.value;
    if (fact === 'observe' || fact === 'retry') return fact;
    this.#logger.warn('worker.supervisor.lost', { executionId: target.executionId, fact });
    return fact === 'uncertain' ? this.#uncertain(target.executionId, recovered.value.reason) : 'observe';
  }

  #notStarted(executionId: ExecutionId): Watched {
    return this.#reported(this.#options.journal.recordNotStarted(executionId)) ? 'not-started' : 'ended';
  }

  #exited(executionId: ExecutionId, exit: ExecutionExit): Watched {
    this.#reported(this.#options.journal.recordExit(executionId, exit));
    return 'ended';
  }

  #uncertain(executionId: ExecutionId, reason: string): Watched {
    this.#logger.warn('worker.execution.uncertain', { executionId, reason });
    this.#reported(this.#options.journal.recordUncertain(executionId));
    return 'ended';
  }

  get #poll(): number {
    return this.#options.pollMilliseconds ?? WATCH_POLL_MILLISECONDS;
  }

  #reported<T>(result: Result<T>): result is Extract<Result<T>, { ok: true }> {
    if (!result.ok) this.#options.onFailure?.(result.error);
    return result.ok;
  }
}

// A `cancel` file that already exists was forwarded before.
export function cancelFiled(result: Result<void>): boolean {
  return result.ok || result.error.code === 'conflict';
}
