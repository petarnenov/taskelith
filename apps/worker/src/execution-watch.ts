import {
  isSpaceRefusal,
  type CommandId,
  type ExecutionExit,
  type ExecutionId,
  type LaunchAuthId,
  type WorkerJournal,
} from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import type {
  DeadlineClock,
  DeadlineReading,
  ExecutionSupervision,
  RecoveryRound,
  SupervisedFacts,
} from './execution-supervision-port.js';
import { backOffForSpace, type SpaceRetry } from './space-retry.js';

export const WATCH_POLL_MILLISECONDS = 1_000;

// Every this many polls of a claimed record, the supervisor's liveness is
// checked, so a dead one is adopted or decided (design D3).
export const LIVENESS_POLLS = 10;

export interface WatchOptions {
  readonly journal: WorkerJournal;
  readonly clock: DeadlineClock;
  // Resolves after the delay, or early once the signal aborts.
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  // A jitter draw in [0, 1), for the backoff after a refusal for space.
  readonly draw: () => number;
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
  // A fresh launch's spawn deadline; past it, a record without a launch
  // record is checked for liveness, as no supervisor can claim it then.
  readonly spawnDeadline?: DeadlineReading;
  // Ends the watch; the next start reconciles what is left.
  readonly stopping: AbortSignal;
  // Wakes a poll early, as a new cancellation does.
  readonly wake: AbortSignal;
  // The cancellation to forward to the supervisor, if any.
  readonly cancelReason: () => string | undefined;
  // The cancellations a not-applied report answers.
  readonly cancellations: () => Result<readonly CommandId[]>;
}

// How a watch ended: sealed without a spawn, or anything else.
export type Watched = 'not-started' | 'ended';

// A commit refused for lack of space rolled back; the fact stays in the
// record and is derived again after the backoff (journal contract sec. 7).
const SPACE_REFUSED = 'space-refused';

type Step = Watched | typeof SPACE_REFUSED;

// What one watch has committed of an execution's record.
interface Committed {
  started: boolean;
  survivors: boolean;
  readonly notApplied: Set<CommandId>;
}

// Follows execution records to their terminal facts and commits each fact
// the supervisor wrote (W5s, W5e, W6, and the evidence beside them).
export class ExecutionWatch {
  readonly #options: WatchOptions;
  readonly #logger: Logger;
  readonly #space: SpaceRetry;

  constructor(options: WatchOptions) {
    this.#options = options;
    this.#logger = options.logger ?? SILENT_LOGGER;
    this.#space = { sleep: options.sleep, draw: options.draw, logger: this.#logger };
  }

  // Start reconciliation of a record a previous process journaled (W4):
  // the recovery table decides, and nothing is spawned (journal section 5).
  async reconcile(target: WatchTarget): Promise<Watched> {
    let round: RecoveryRound = 'first';
    for (let refusals = 1; !target.stopping.aborted;) {
      const recovered = await target.supervision.recover(round);
      if (!this.#reported(recovered)) return 'ended';
      const decision = recovered.value;
      this.#logger.info('worker.execution.recovered', { executionId: target.executionId, fact: decision.fact, round });
      if (decision.fact === 'retry') {
        round = 'after-retry';
        await this.#options.sleep(this.#poll, target.stopping);
        continue;
      }
      // An exit is read back with the spawn it ends, so W5s precedes W5e.
      if (decision.fact !== 'uncertain' && decision.fact !== 'not-started') return this.observe(target);
      const step = decision.fact === 'uncertain' ? this.#uncertain(target.executionId, decision.reason) : this.#notStarted(target.executionId);
      if (step !== SPACE_REFUSED) return step;
      await backOffForSpace(this.#space, target.executionId, refusals++, target.stopping);
    }
    return 'ended';
  }

  // Reads the record at the poll interval until a terminal fact (CP10 and
  // CP12); a supervisor that may be gone is checked for liveness.
  async observe(target: WatchTarget): Promise<Watched> {
    let forwarded = false;
    let round: RecoveryRound = 'first';
    const committed: Committed = { started: false, survivors: false, notApplied: new Set() };
    for (let polls = 1, refusals = 1; !target.stopping.aborted; polls += 1) {
      const reason = target.cancelReason();
      if (reason !== undefined && !forwarded) forwarded = cancelFiled(await target.supervision.cancel(reason));
      // Once cancelled, the wake signal stays aborted and cannot wake it.
      const pause = reason === undefined ? target.wake : target.stopping;
      const facts = await target.supervision.read();
      if (!this.#reported(facts)) return 'ended';
      let decided = this.#commitFacts(target, facts.value, committed);
      if (decided === undefined && this.#livenessDue(target, facts.value.launch, polls)) {
        const checked = await this.#checkLiveness(target, round);
        if (checked === 'observe' || checked === 'retry') round = checked === 'retry' ? 'after-retry' : 'first';
        else decided = checked;
      }
      if (decided === SPACE_REFUSED) {
        await backOffForSpace(this.#space, target.executionId, refusals++, pause);
        continue;
      }
      if (decided !== undefined) return decided;
      refusals = 1;
      await this.#options.sleep(this.#poll, pause);
    }
    return 'ended';
  }

  // The facts of one read, in the order the supervisor wrote them; each
  // is committed once per watch.
  #commitFacts(target: WatchTarget, facts: SupervisedFacts, committed: Committed): Step | undefined {
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
      const started = this.#committed(journal.recordStart(executionId, target.launchAuthId, facts.process));
      if (started !== true) return started;
      committed.started = true;
    }
    const evidence = this.#commitEvidence(target, facts, committed);
    if (evidence !== true) return evidence === SPACE_REFUSED ? evidence : undefined;
    return facts.exit === undefined ? undefined : this.#exited(executionId, facts.exit);
  }

  // The evidence beside the facts; the exit waits until all of it is
  // committed, so none is lost once the execution is terminal.
  #commitEvidence(target: WatchTarget, facts: SupervisedFacts, committed: Committed): boolean | typeof SPACE_REFUSED {
    const { executionId } = target;
    const { journal } = this.#options;
    if (!committed.survivors && facts.survivors !== undefined) {
      const survivors = this.#committed(journal.recordTerminationUnproven(executionId, facts.survivors));
      if (survivors !== true) return survivors === SPACE_REFUSED ? survivors : false;
      committed.survivors = true;
    }
    if (!facts.cancellationNotApplied) return true;
    const commands = target.cancellations();
    if (!this.#reported(commands)) return false;
    for (const commandId of commands.value.filter((command) => !committed.notApplied.has(command))) {
      const notApplied = this.#committed(journal.recordCancellationNotApplied(commandId, executionId));
      if (notApplied !== true) return notApplied === SPACE_REFUSED ? notApplied : false;
      committed.notApplied.add(commandId);
    }
    return true;
  }

  // A live or newly adopting supervisor keeps the watch going; anything
  // else was decided by the recovery table and is read back next poll.
  async #checkLiveness(target: WatchTarget, round: RecoveryRound): Promise<Step | 'observe' | 'retry'> {
    const recovered = await target.supervision.recover(round);
    if (!this.#reported(recovered)) return 'ended';
    const { fact } = recovered.value;
    if (fact === 'observe' || fact === 'retry') return fact;
    this.#logger.warn('worker.supervisor.lost', { executionId: target.executionId, fact });
    return fact === 'uncertain' ? this.#uncertain(target.executionId, recovered.value.reason) : 'observe';
  }

  // A claim is checked every LIVENESS_POLLS polls, a missing launch record
  // only past the spawn deadline; a seal is decided before any check.
  #livenessDue(target: WatchTarget, launch: SupervisedFacts['launch'], polls: number): boolean {
    if (polls % LIVENESS_POLLS !== 0) return false;
    return launch === undefined ? this.#pastDeadline(target.spawnDeadline) : launch.kind === 'claim';
  }

  // The launch orchestrator's rule turned around: a deadline not proven
  // ahead, in the same boot on a readable clock, has passed.
  #pastDeadline(deadline: DeadlineReading | undefined): boolean {
    if (deadline === undefined) return false;
    const now = this.#options.clock.read();
    return !(now.ok && now.value.bootId === deadline.bootId && now.value.milliseconds < deadline.milliseconds);
  }

  #notStarted(executionId: ExecutionId): Step {
    const recorded = this.#committed(this.#options.journal.recordNotStarted(executionId));
    return recorded === true ? 'not-started' : recorded;
  }

  #exited(executionId: ExecutionId, exit: ExecutionExit): Step {
    return this.#committed(this.#options.journal.recordExit(executionId, exit)) === SPACE_REFUSED ? SPACE_REFUSED : 'ended';
  }

  #uncertain(executionId: ExecutionId, reason: string): Step {
    this.#logger.warn('worker.execution.uncertain', { executionId, reason });
    return this.#committed(this.#options.journal.recordUncertain(executionId)) === SPACE_REFUSED ? SPACE_REFUSED : 'ended';
  }

  // A refusal for space is retried, not reported; any other failure is.
  #committed(result: Result<void>): true | 'ended' | typeof SPACE_REFUSED {
    if (result.ok) return true;
    if (isSpaceRefusal(result.error)) return SPACE_REFUSED;
    this.#options.onFailure?.(result.error);
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
