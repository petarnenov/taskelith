import type { ExecutionExit, ExecutionId, ExecutionProcess } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { DeadlineClock, DeadlineReading, LaunchRecord, RecordProblem } from '@taskelith/worker-supervisor';

// The suspend-inclusive clock the launch deadline uses, as the supervisor
// adapter reads it on each platform.
export type { DeadlineClock, DeadlineReading };

// What a launch hands its supervisor: the grant it claims and the deadline
// on the deadline clock, in the boot the reading was taken in.
export interface LaunchPlan {
  readonly attemptId: string;
  readonly ownershipGeneration: number;
  readonly launchAuthId: string;
  readonly deadline: { readonly bootId: string; readonly milliseconds: number };
}

// What the supervisor wrote, as the worker reports it (CP10 and CP12).
export interface SupervisedFacts {
  readonly launch?: LaunchRecord;
  readonly process?: ExecutionProcess;
  readonly exit?: ExecutionExit;
  // Processes that outlived the child, as the supervisor first saw them.
  readonly survivors?: readonly ExecutionProcess[];
  // An adopting supervisor could not apply a requested cancellation.
  readonly cancellationNotApplied: boolean;
  readonly problems: readonly RecordProblem[];
}

// What recovery found: `observe` once a live or adopting supervisor runs;
// `retry` while a dead process may still hold the lock.
export type SupervisedRecovery =
  | { readonly fact: 'not-started' }
  | { readonly fact: 'exited'; readonly exit: ExecutionExit }
  | { readonly fact: 'observe' }
  | { readonly fact: 'retry' }
  | { readonly fact: 'uncertain'; readonly reason: string };

// A recovery after `retry` decides a lock still held by no live process.
export type RecoveryRound = 'first' | 'after-retry';

// One execution's record and supervisor (supervisor identity contract,
// section 4), as the launch orchestrator drives them.
export interface ExecutionSupervision {
  // CP2: refused once a supervisor started or a launch record exists.
  prepare(plan: LaunchPlan): Promise<Result<void>>;
  // CP4: a detached supervisor in launch mode.
  start(): Promise<Result<void>>;
  // Creates the directory if needed; the winning launch record comes back.
  seal(): Promise<Result<LaunchRecord>>;
  cancel(reason: string): Promise<Result<void>>;
  read(): Promise<Result<SupervisedFacts>>;
  recover(round: RecoveryRound): Promise<Result<SupervisedRecovery>>;
  // Only after the terminal fact is confirmed; a missing record is removed.
  remove(): Promise<Result<void>>;
}

export type SupervisionFactory = (executionId: ExecutionId) => ExecutionSupervision;

// The execution records on disk, by their directory names.
export type RecordListing = () => Promise<Result<readonly string[]>>;

// A launch record that is a claim proves a supervisor may have spawned.
export function sealWon(launch: LaunchRecord): Result<void> {
  return launch.kind === 'seal' ? ok(undefined) : err(failure('conflict', 'a supervisor claimed the launch record'));
}
