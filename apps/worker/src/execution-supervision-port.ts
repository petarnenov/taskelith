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
  readonly problems: readonly RecordProblem[];
}

// What recovery after a failed supervisor start found.
export type SupervisedRecovery =
  | { readonly fact: 'not-started' }
  | { readonly fact: 'exited'; readonly exit: ExecutionExit }
  | { readonly fact: 'observe' }
  | { readonly fact: 'uncertain' };

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
  recover(): Promise<Result<SupervisedRecovery>>;
}

export type SupervisionFactory = (executionId: ExecutionId) => ExecutionSupervision;

// A launch record that is a claim proves a supervisor may have spawned.
export function sealWon(launch: LaunchRecord): Result<void> {
  return launch.kind === 'seal' ? ok(undefined) : err(failure('conflict', 'a supervisor claimed the launch record'));
}
