import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { EvidenceReference } from '@taskelith/sdlc';
import type { AssignmentId, ExecutionId, LaunchAuthId, WorkerId } from './identifiers.js';
import { revokeGrant, type LaunchGrant } from './launch-grant.js';
import type { RevocationReason } from './launch-rejection.js';

// The execution states of the launch authorization contract, section 4.
export const EXECUTION_STATES = Object.freeze(['authorized', 'started', 'exited', 'not-started'] as const);

export type ExecutionState = (typeof EXECUTION_STATES)[number];

// The only allowed transitions; a terminal state never changes again. An
// exit straight from `authorized` is a spawn failure or an unproven start.
export const EXECUTION_TRANSITIONS: Readonly<Record<ExecutionState, readonly ExecutionState[]>> = Object.freeze({
  authorized: Object.freeze(['started', 'exited', 'not-started'] as const),
  started: Object.freeze(['exited'] as const),
  exited: Object.freeze([] as const),
  'not-started': Object.freeze([] as const),
});

export type ExitStatus =
  | { readonly kind: 'code'; readonly code: number }
  | { readonly kind: 'signal'; readonly signal: string }
  | { readonly kind: 'unknown' };

export interface ExitStatusInput {
  readonly kind: string;
  readonly code?: number;
  readonly signal?: string;
}

const SIGNAL_NAME = /^SIG[A-Z0-9]{1,16}$/;

export function parseExitStatus(input: ExitStatusInput): Result<ExitStatus> {
  const { kind, code, signal } = input;
  if (kind === 'code' && code !== undefined && Number.isSafeInteger(code) && code >= 0 && code <= 255) {
    // `+ 0` turns -0 into 0, so a stored exit code round-trips through JSON.
    return ok(Object.freeze({ kind, code: code + 0 }));
  }
  if (kind === 'signal' && signal !== undefined && SIGNAL_NAME.test(signal)) return ok(Object.freeze({ kind, signal }));
  if (kind === 'unknown') return ok(Object.freeze({ kind }));
  return err(failure('invalid', 'ExitStatus must be a code of 0-255, a signal name such as SIGTERM, or unknown'));
}

// The process set is proven empty (supervisor identity contract, section 8);
// an operator reconciliation records its evidence instead of a worker report.
export interface ExitFact {
  readonly status: ExitStatus;
  readonly startProven: boolean;
  readonly spawnFailed: boolean;
  readonly recordedAt: Instant;
  readonly operatorEvidence?: EvidenceReference;
}

// `current` moved the execution to `started`; `historical` arrived after its
// exit and moved nothing.
export const START_KINDS = Object.freeze(['current', 'historical'] as const);

export type StartKind = (typeof START_KINDS)[number];

export interface StartFact {
  readonly kind: StartKind;
  readonly launchAuthId: LaunchAuthId;
  readonly recordedAt: Instant;
}

// A start reported without a grant of the execution: evidence apart from the
// accepted start, which cancels this execution only.
export interface UnauthorizedStart {
  readonly launchAuthId: LaunchAuthId;
  readonly recordedAt: Instant;
}

// Observations kept beside the state, which they leave unchanged, and which
// keep the execution's ownership and capacity until new evidence ends them.
export const EXECUTION_EVIDENCE_KINDS = Object.freeze([
  'uncertain', 'termination-unproven', 'local-history-lost', 'cancellation-not-applied',
] as const);

export type ExecutionEvidenceKind = (typeof EXECUTION_EVIDENCE_KINDS)[number];

export interface ExecutionEvidence {
  readonly kind: ExecutionEvidenceKind;
  readonly observedAt: Instant;
}

export interface Execution {
  readonly id: ExecutionId;
  readonly assignmentId: AssignmentId;
  readonly workerId: WorkerId;
  readonly state: ExecutionState;
  readonly grants: readonly LaunchGrant[];
  readonly start?: StartFact;
  readonly exit?: ExitFact;
  readonly evidence: readonly ExecutionEvidence[];
  readonly unauthorizedStarts: readonly UnauthorizedStart[];
}

export function isTerminalExecution(execution: Execution): boolean {
  return EXECUTION_TRANSITIONS[execution.state].length === 0;
}

// Whether it still runs is not known, so it keeps ownership and capacity
// until reconciled; a failed cancellation signal leaves its processes known.
export function isUnknownExecution(execution: Execution): boolean {
  return !isTerminalExecution(execution) && execution.evidence.some(({ kind }) => kind !== 'cancellation-not-applied');
}

export function authorizedExecution(grant: LaunchGrant): Execution {
  return Object.freeze({
    id: grant.executionId,
    assignmentId: grant.assignmentId,
    workerId: grant.workerId,
    state: 'authorized',
    grants: Object.freeze([grant]),
    evidence: Object.freeze([]),
    unauthorizedStarts: Object.freeze([]),
  });
}

export function withGrant(execution: Execution, grant: LaunchGrant): Execution {
  return Object.freeze({ ...execution, grants: Object.freeze([...execution.grants, grant]) });
}

export function withRevokedGrants(execution: Execution, reason: RevocationReason): Execution {
  return Object.freeze({ ...execution, grants: Object.freeze(execution.grants.map((grant) => revokeGrant(grant, reason))) });
}

export function withStart(execution: Execution, start: StartFact): Execution {
  const state = start.kind === 'current' ? 'started' : execution.state;
  return Object.freeze({ ...execution, state, start: Object.freeze(start) });
}

// A repeated report under the same grant identity is recorded once.
export function withUnauthorizedStart(execution: Execution, start: UnauthorizedStart): Execution {
  if (execution.unauthorizedStarts.some((known) => known.launchAuthId === start.launchAuthId)) return execution;
  return Object.freeze({ ...execution, unauthorizedStarts: Object.freeze([...execution.unauthorizedStarts, Object.freeze(start)]) });
}

export function withEvidence(execution: Execution, evidence: ExecutionEvidence): Execution {
  return Object.freeze({ ...execution, evidence: Object.freeze([...execution.evidence, Object.freeze(evidence)]) });
}

export function moveExecution(execution: Execution, to: 'exited' | 'not-started', exit?: ExitFact): Result<Execution> {
  if (!EXECUTION_TRANSITIONS[execution.state].includes(to)) {
    return err(failure('precondition-failed', `execution ${execution.id} cannot change from ${execution.state} to ${to}`, {
      execution: execution.id,
      from: execution.state,
      to,
    }));
  }
  const fact = exit === undefined ? {} : { exit: Object.freeze({ ...exit, status: Object.freeze({ ...exit.status }) }) };
  return ok(Object.freeze({ ...execution, state: to, ...fact }));
}
