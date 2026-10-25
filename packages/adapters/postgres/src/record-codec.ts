import { parseLaunchParameters, type Task } from '@taskelith/execution';

// Records are stored as JSON text, which escapes every string, and read back
// as frozen plain data, the form the domain creates.
export function encodeRecord(record: object): string {
  return JSON.stringify(record);
}

export function decodeRecord<Record>(text: unknown): Record {
  return deepFreeze(JSON.parse(text as string)) as Record;
}

// Launch parameters are the one class in the records: a grant must carry a
// parsed instance, which JSON cannot hold.
export function decodeTask(text: unknown): Task {
  const task = JSON.parse(text as string) as { attempts: { executions: { grants: { parameters: { ttlMilliseconds: number; skewMilliseconds: number } }[] }[] }[] };
  for (const attempt of task.attempts) {
    for (const execution of attempt.executions) {
      for (const grant of execution.grants) {
        const parameters = parseLaunchParameters(grant.parameters);
        if (!parameters.ok) throw new Error(`stored launch grant is corrupt: ${parameters.error.message}`);
        (grant as { parameters: unknown }).parameters = parameters.value;
      }
    }
  }
  return deepFreeze(task) as Task;
}

function deepFreeze(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const field of Object.values(value)) deepFreeze(field);
  return Object.freeze(value);
}
