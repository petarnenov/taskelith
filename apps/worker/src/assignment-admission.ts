import type {
  AssignmentRefusalReason, AttemptId, AuthorizationOutcome, JournaledAuthorization, JournaledExecution, JournalSnapshot, ResourceRequest,
} from '@taskelith/execution';

type CapacityRefusalReason = Exclude<AssignmentRefusalReason, 'worker-admission-pressure'>;
import type { WorkerCapacity } from '@taskelith/fleet';
import { MAX_ATTEMPT_CPU_MILLICORES, MAX_ATTEMPT_MEMORY_MEBIBYTES } from '@taskelith/scheduling';

// The worker-side limits of capacity reservation section 8 for a new offer;
// `handedOff` attempts hold a slot each. Undefined admits it.
export function refusalOf(
  requested: ResourceRequest,
  journal: JournalSnapshot,
  capacity: WorkerCapacity,
  handedOff: ReadonlySet<AttemptId> = new Set(),
): CapacityRefusalReason | undefined {
  if (requested.cpuMillicores > MAX_ATTEMPT_CPU_MILLICORES || requested.memoryMebibytes > MAX_ATTEMPT_MEMORY_MEBIBYTES) {
    return 'resource-ceiling-exceeded';
  }
  const enforceable: readonly string[] = capacity.controls;
  if (!requested.hardControls.every((control) => enforceable.includes(control))) return 'control-not-enforceable';
  const counted = countedAttempts(journal);
  if (new Set([...counted.keys(), ...handedOff]).size >= capacity.slots) return 'worker-slots-exhausted';
  const cpu = sum(counted, 'cpuMillicores') + requested.cpuMillicores;
  const memory = sum(counted, 'memoryMebibytes') + requested.memoryMebibytes;
  if (cpu > capacity.cpuMillicores || memory > capacity.memoryMebibytes) return 'worker-capacity-exhausted';
  return undefined;
}

// Once per attempt: every assignment that has not ended, and every one with
// an execution that is not terminal, uncertain ones included.
function countedAttempts(journal: JournalSnapshot): ReadonlyMap<AttemptId, ResourceRequest> {
  const running = new Set(journal.executions.filter(holdsSlot).map((execution) => execution.assignmentId));
  const counted = new Map<AttemptId, ResourceRequest>();
  for (const intent of journal.intents) {
    if (!intent.ended || running.has(intent.assignmentId)) counted.set(intent.attemptId, intent.requested);
  }
  return counted;
}

// A slot is freed only on proof: a terminal state, or no grant and every
// operation closed without one; anything else, uncertainty included, holds.
function holdsSlot(execution: JournaledExecution): boolean {
  if (execution.state === 'exited' || execution.state === 'not-started') return false;
  if (execution.uncertain || execution.state !== undefined) return true;
  return !closedWithoutGrant(execution.authorizations);
}

const CLOSED_WITHOUT_GRANT: readonly AuthorizationOutcome[] = ['rejected-final', 'rejected-retryable', 'expired'];

function closedWithoutGrant(authorizations: readonly JournaledAuthorization[]): boolean {
  return authorizations.length > 0 && authorizations.every(({ outcome }) => CLOSED_WITHOUT_GRANT.includes(outcome));
}

// A handed-off attempt that the journal no longer counts holds its slot
// only: its processes are proven gone, so its CPU and memory are free.
function sum(counted: ReadonlyMap<AttemptId, ResourceRequest>, resource: 'cpuMillicores' | 'memoryMebibytes'): number {
  return [...counted.values()].reduce((total, request) => total + request[resource], 0);
}
