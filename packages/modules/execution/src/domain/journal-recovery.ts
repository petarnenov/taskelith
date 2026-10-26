import type { AssignmentId, ExecutionId } from './identifiers.js';
import type { SealedExecution } from './launch-authorization.js';
import type {
  AuthorizationOutcome,
  CancellationTarget,
  CommandId,
  JournaledCancellation,
  JournaledExecution,
  JournaledIntent,
  JournalSnapshot,
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

// The intent's last sealed execution, which a new execution reports, so the
// authority ends it first; its last granted operation, else its last one.
export function lastSealedExecution(snapshot: JournalSnapshot, assignmentId: AssignmentId): SealedExecution | undefined {
  const sealed = snapshot.executions.filter((execution) => execution.assignmentId === assignmentId && execution.state === 'not-started').at(-1);
  const latest = [...(sealed?.authorizations ?? [])].reverse();
  const operation = latest.find(({ outcome }) => outcome === 'granted') ?? latest[0];
  if (sealed === undefined || operation === undefined) return undefined;
  return Object.freeze({ executionId: sealed.executionId, operationId: operation.operationId });
}

// An ended assignment launches nothing more, like a cancelled one.
function recoverIntent(intent: JournaledIntent, snapshot: JournalSnapshot): RecoveryAction[] {
  const executions = snapshot.executions.filter((execution) => execution.assignmentId === intent.assignmentId);
  const cancelled = (execution?: JournaledExecution): boolean => isCancelled(intent, execution, snapshot.cancellations);
  const stopped = intent.ended || cancelled(executions.at(-1));
  const actions = executions.flatMap((execution) => recoverExecution(execution, stopped || cancelled(execution)));
  const rejectedFinally = executions.some((execution) => execution.authorizations.some(({ outcome }) => outcome === 'rejected-final'));
  if (!stopped && !rejectedFinally && executions.every((execution) => endsWithoutProcess(execution))) {
    actions.push({ kind: 'continue-launch', assignmentId: intent.assignmentId });
  }
  return actions;
}

function recoverExecution(execution: JournaledExecution, cancelled: boolean): RecoveryAction[] {
  const { executionId } = execution;
  if (execution.state === 'exited' || execution.state === 'not-started') return [];
  if (execution.recordWritten) return [{ kind: 'recover-execution-record', executionId }];
  if (endsWithoutProcess(execution)) return [{ kind: 'seal-execution', executionId }];
  if (mayRetry(execution) && !cancelled) return [{ kind: 'retry-authorization', executionId }];
  return [];
}

// True when the execution ends as `not-started`, now or once sealed: a
// journaled grant without W4, or W2 without an outcome (section 5).
function endsWithoutProcess(execution: JournaledExecution): boolean {
  if (execution.state === 'not-started') return true;
  if (execution.state === 'exited' || execution.recordWritten) return false;
  return execution.state === 'authorized' || lastOutcome(execution) === 'pending';
}

// A retryable rejection, or an operation that expired before any grant:
// a new `operationId` for the same execution (section 5).
function mayRetry(execution: JournaledExecution): boolean {
  const outcome = lastOutcome(execution);
  return execution.state === undefined && (outcome === 'rejected-retryable' || outcome === 'expired');
}

function lastOutcome(execution: JournaledExecution): AuthorizationOutcome | undefined {
  return execution.authorizations.at(-1)?.outcome;
}

// An execution target stops only the execution it names; it stops the intent
// when that is the intent's last execution, the one a relaunch would follow.
function isCancelled(
  intent: JournaledIntent,
  execution: JournaledExecution | undefined,
  cancellations: readonly JournaledCancellation[],
): boolean {
  return cancellations.some(({ target }) => target.kind === 'attempt'
    ? target.attemptId === intent.attemptId
    : target.executionId === execution?.executionId);
}
