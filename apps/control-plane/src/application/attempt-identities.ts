import { createHash } from 'node:crypto';
import type { AttemptId, Task } from '@taskelith/execution';
import type { Identifier } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';

// The identity of the task's next attempt, which placement opens first and
// an observation opens as an automatic retry.
export function nextAttemptIdOf(task: Task): AttemptId {
  return derivedId('t', task.id, task.attempts.length + 1, task.ownershipGeneration);
}

// A one-letter prefix and the SHA-256 of the task, the attempt number, and
// the ownership generation, so that a rerun transaction reuses them.
export function derivedId<Kind extends string>(prefix: string, taskId: TaskId, attemptNumber: number, generation: number): Identifier<Kind> {
  return `${prefix}${createHash('sha256').update(JSON.stringify([taskId, attemptNumber, generation])).digest('hex')}` as Identifier<Kind>;
}
