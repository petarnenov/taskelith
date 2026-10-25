import type { AssignmentId, ExecutionId } from './identifiers.js';
import type {
  AuthorizationOutcome,
  CancellationTarget,
  CommandId,
  JournaledCancellation,
  JournaledExecution,
  JournalSnapshot,
  LaunchIntent,
} from './journal-records.js';

// What a worker does on start for each record, from the last commit it finds
// (worker journal contract, section 5, "Recovery on start").
export type RecoveryAction =
  | { readonly kind: 'forward-cancellation'; readonly commandId: CommandId; readonly target: CancellationTarget }
  | { readonly kind: 'recover-execution-record'; readonly executionId: ExecutionId }
  | { readonly kind: 'seal-execution'; readonly executionId: ExecutionId }
  | { readonly kind: 'retry-authorization'; readonly executionId: ExecutionId }
  | { readonly kind: 'continue-launch'; readonly assignmentId: AssignmentId };

export function planJournalRecovery(snapshot: JournalSnapshot): readonly RecoveryAction[] {
  const cancellations = snapshot.cancellations
    .filter((cancellation) => !cancellation.evidenceRecorded)
    .map(({ commandId, target }): RecoveryAction => ({ kind: 'forward-cancellation', commandId, target }));
  const launches = snapshot.intents.flatMap((intent) => recoverIntent(intent, snapshot));
  return Object.freeze([...cancellations, ...launches].map((action) => Object.freeze(action)));
}

function recoverIntent(intent: LaunchIntent, snapshot: JournalSnapshot): RecoveryAction[] {
  const executions = snapshot.executions.filter((execution) => execution.assignmentId === intent.assignmentId);
  const cancelled = isCancelled(intent, executions, snapshot.cancellations);
  const actions = executions.flatMap((execution) => recoverExecution(execution, cancelled));
  if (!cancelled && executions.every((execution) => endsWithoutProcess(execution))) {
    actions.push({ kind: 'continue-launch', assignmentId: intent.assignmentId });
  }
  return actions;
}

function recoverExecution(execution: JournaledExecution, cancelled: boolean): RecoveryAction[] {
  const { executionId } = execution;
  if (execution.state === 'exited' || execution.state === 'not-started') return [];
  if (execution.recordWritten) return [{ kind: 'recover-execution-record', executionId }];
  const outcome = lastOutcome(execution);
  if (outcome === 'pending' || outcome === 'granted') return [{ kind: 'seal-execution', executionId }];
  if (outcome === 'rejected-retryable' && !cancelled) return [{ kind: 'retry-authorization', executionId }];
  return [];
}

// True when the execution ends as `not-started`, now or once sealed, so the
// launch intent needs a new execution (contract section 5).
function endsWithoutProcess(execution: JournaledExecution): boolean {
  if (execution.state === 'not-started') return true;
  if (execution.state === 'exited' || execution.recordWritten) return false;
  const outcome = lastOutcome(execution);
  return outcome === 'pending' || outcome === 'granted';
}

function lastOutcome(execution: JournaledExecution): AuthorizationOutcome | undefined {
  return execution.authorizations.at(-1)?.outcome;
}

function isCancelled(
  intent: LaunchIntent,
  executions: readonly JournaledExecution[],
  cancellations: readonly JournaledCancellation[],
): boolean {
  return cancellations.some(({ target }) => target.kind === 'attempt'
    ? target.attemptId === intent.attemptId
    : executions.some((execution) => execution.executionId === target.executionId));
}
