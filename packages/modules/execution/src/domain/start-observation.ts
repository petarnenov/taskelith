import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { owningExecution } from './attempt.js';
import { withStart, type StartFact, type StartKind } from './execution.js';
import type { ExecutionId, InstallationState, LaunchAuthId, RecoveryEpoch, WorkerId } from './identifiers.js';
import type { LaunchGrant } from './launch-grant.js';
import { locateExecution, withAttempt, withExecution, type Task } from './task.js';

// A worker's report that a spawn happened, from its supervisor's handle.
export interface StartObservation {
  readonly workerId: WorkerId;
  readonly launchAuthId: LaunchAuthId;
  readonly executionId: ExecutionId;
  readonly recoveryEpoch: RecoveryEpoch;
}

// How the launch authorization contract, section 7, decides a start; its
// arrival time never decides it, since a worker may report after an outage.
export const START_DECISIONS = Object.freeze([
  'foreign',
  'duplicate',
  'quarantine-evidence',
  'historical',
  'started',
  'unauthorized-start',
] as const);

export type StartDecision = (typeof START_DECISIONS)[number];

export interface StartContext {
  readonly installation: InstallationState;
  // The grant the observation names, if the authority knows it.
  readonly grant?: LaunchGrant;
  // The task that holds the named execution, if the authority knows one.
  readonly task?: Task;
}

export interface StartRecord {
  readonly decision: StartDecision;
  readonly task: Task;
}

// Checks run in the contract's order. `foreign` writes nothing to another
// worker's execution; only `unauthorized-start` writes a cancellation.
export function decideStartObservation(observation: StartObservation, context: StartContext): StartDecision {
  const { grant, installation } = context;
  const located = context.task === undefined ? undefined : locateExecution(context.task, observation.executionId);
  const execution = located?.execution;
  if (grant !== undefined && grant.workerId !== observation.workerId) return 'foreign';
  if (execution !== undefined && execution.workerId !== observation.workerId) return 'foreign';
  if (execution?.start !== undefined) return 'duplicate';
  if (installation.quarantined || observation.recoveryEpoch !== installation.recoveryEpoch) return 'quarantine-evidence';
  if (execution?.state === 'exited') return 'historical';
  const owning = located === undefined ? undefined : owningExecution(located.attempt);
  if (execution !== undefined && owning?.id === execution.id && grant?.executionId === execution.id) return 'started';
  return 'unauthorized-start';
}

// Decides the start and records it on the execution the task holds; any
// other decision leaves the task unchanged.
export function recordStartObservation(
  task: Task,
  observation: StartObservation,
  context: Omit<StartContext, 'task'>,
  at: Instant,
): Result<StartRecord> {
  const located = locateExecution(task, observation.executionId);
  if (located === undefined) {
    return err(failure('not-found', `task ${task.id} has no execution ${observation.executionId}`, { execution: observation.executionId }));
  }
  const decision = decideStartObservation(observation, { ...context, task });
  const kind = recordedKind(decision);
  if (kind === undefined) return ok(Object.freeze({ decision, task }));
  const start: StartFact = { kind, launchAuthId: observation.launchAuthId, recordedAt: at };
  const attempt = withExecution(located.attempt, withStart(located.execution, start));
  return ok(Object.freeze({ decision, task: withAttempt(task, attempt, at) }));
}

function recordedKind(decision: StartDecision): StartKind | undefined {
  if (decision === 'started') return 'current';
  if (decision === 'historical') return 'historical';
  if (decision === 'unauthorized-start') return 'unauthorized';
  return undefined;
}
