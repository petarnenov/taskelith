import type { AssignmentRefusalReason, AttemptId, JournalSnapshot, ResourceRequest } from '@taskelith/execution';

type CapacityRefusalReason = Exclude<AssignmentRefusalReason, 'worker-admission-pressure'>;
import type { WorkerCapacity } from '@taskelith/fleet';
import { MAX_ATTEMPT_CPU_MILLICORES, MAX_ATTEMPT_MEMORY_MEBIBYTES } from '@taskelith/scheduling';

// The worker-side limits of capacity reservation section 8 for a new offer;
// undefined admits it.
export function refusalOf(requested: ResourceRequest, journal: JournalSnapshot, capacity: WorkerCapacity): CapacityRefusalReason | undefined {
  if (requested.cpuMillicores > MAX_ATTEMPT_CPU_MILLICORES || requested.memoryMebibytes > MAX_ATTEMPT_MEMORY_MEBIBYTES) {
    return 'resource-ceiling-exceeded';
  }
  const enforceable: readonly string[] = capacity.controls;
  if (!requested.hardControls.every((control) => enforceable.includes(control))) return 'control-not-enforceable';
  const counted = countedAttempts(journal);
  if (counted.length >= capacity.slots) return 'worker-slots-exhausted';
  const cpu = sum(counted, 'cpuMillicores') + requested.cpuMillicores;
  const memory = sum(counted, 'memoryMebibytes') + requested.memoryMebibytes;
  if (cpu > capacity.cpuMillicores || memory > capacity.memoryMebibytes) return 'worker-capacity-exhausted';
  return undefined;
}

// Once per attempt: every assignment that has not ended, and every one with
// an execution that is not terminal, uncertain ones included.
function countedAttempts(journal: JournalSnapshot): ResourceRequest[] {
  const running = new Set(journal.executions
    .filter((execution) => execution.state !== 'exited' && execution.state !== 'not-started')
    .map((execution) => execution.assignmentId));
  const counted = new Map<AttemptId, ResourceRequest>();
  for (const intent of journal.intents) {
    if (!intent.ended || running.has(intent.assignmentId)) counted.set(intent.attemptId, intent.requested);
  }
  return [...counted.values()];
}

function sum(requests: readonly ResourceRequest[], resource: 'cpuMillicores' | 'memoryMebibytes'): number {
  return requests.reduce((total, request) => total + request[resource], 0);
}
