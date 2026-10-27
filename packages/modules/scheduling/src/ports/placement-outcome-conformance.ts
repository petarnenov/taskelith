import type { AttemptId } from '@taskelith/execution';
import { parseIdentifier, parseInstant, type Result } from '@taskelith/kernel';
import { expectSame, expectSuccess, type ConformanceCase, type TaskId } from '@taskelith/sdlc';
import type { PlacementOutcomeRecord } from '../domain/placement-outcome-record.js';
import type { PlacementOutcomeRecords } from './placement-outcome-records.js';

// The shared suite of the placement outcome records; each case starts from
// an adapter without records.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const taskId = (text: string) => must(parseIdentifier('TaskId', text)) as TaskId;
const at = (text: string) => must(parseInstant(text));
const ATTEMPT = must(parseIdentifier('AttemptId', 'attempt-1')) as AttemptId;
const TASK = taskId('task-a');
// Uppercase sorts before lowercase by code unit, as the "C" collation does.
const UPPER_TASK = taskId('task-B');
const OTHER_TASK = taskId('task-c');

const WAITING: PlacementOutcomeRecord = Object.freeze({
  taskId: TASK, disposition: 'waiting', reason: 'project-quota-exhausted', source: 'scheduler',
  recordedAt: at('2026-10-25T09:00:00.000Z'),
});
const REJECTED: PlacementOutcomeRecord = Object.freeze({
  taskId: TASK, attemptId: ATTEMPT, disposition: 'rejected', reason: 'retry-budget-exhausted', source: 'scheduler',
  recordedAt: at('2026-10-25T09:00:07.250Z'),
});
const NO_CANDIDATE: PlacementOutcomeRecord = Object.freeze({
  taskId: UPPER_TASK, disposition: 'waiting', reason: 'no-candidate', source: 'scheduler',
  recordedAt: at('2026-10-25T09:00:01.000Z'),
});

export const PLACEMENT_OUTCOME_RECORDS_CONFORMANCE: readonly ConformanceCase<PlacementOutcomeRecords>[] = Object.freeze([
  {
    name: 'a task has no record before its first',
    async check(records: PlacementOutcomeRecords) {
      const problems: string[] = [];
      expectSame(problems, 'get', await records.get(TASK), undefined);
      expectSame(problems, 'list', await records.list([TASK]), []);
      return problems;
    },
  },
  {
    name: 'a record reads back as written, with or without its attempt',
    async check(records: PlacementOutcomeRecords) {
      const problems: string[] = [];
      expectSuccess(problems, 'waiting', await records.record(WAITING));
      expectSame(problems, 'waiting read', await records.get(TASK), WAITING);
      const rejected = { ...REJECTED, taskId: OTHER_TASK };
      expectSuccess(problems, 'rejected', await records.record(rejected));
      expectSame(problems, 'rejected read', await records.get(OTHER_TASK), rejected);
      return problems;
    },
  },
  {
    name: 'a later record replaces the task\'s earlier one',
    async check(records: PlacementOutcomeRecords) {
      const problems: string[] = [];
      expectSuccess(problems, 'earlier', await records.record(WAITING));
      expectSuccess(problems, 'later', await records.record(REJECTED));
      expectSame(problems, 'get', await records.get(TASK), REJECTED);
      expectSame(problems, 'list', await records.list([TASK]), [REJECTED]);
      expectSuccess(problems, 'without an attempt', await records.record(WAITING));
      expectSame(problems, 'attempt dropped', await records.get(TASK), WAITING);
      return problems;
    },
  },
  {
    name: 'removing a record leaves the other tasks\' records',
    async check(records: PlacementOutcomeRecords) {
      const problems: string[] = [];
      expectSuccess(problems, 'first', await records.record(WAITING));
      expectSuccess(problems, 'second', await records.record(NO_CANDIDATE));
      expectSuccess(problems, 'remove', await records.remove(TASK));
      expectSame(problems, 'removed', await records.get(TASK), undefined);
      expectSame(problems, 'kept', await records.get(UPPER_TASK), NO_CANDIDATE);
      expectSuccess(problems, 'remove again', await records.remove(TASK));
      return problems;
    },
  },
  {
    name: 'the records of given tasks are those that have one, in task id order',
    async check(records: PlacementOutcomeRecords) {
      const problems: string[] = [];
      const rejected = { ...REJECTED, taskId: OTHER_TASK };
      for (const record of [WAITING, rejected, NO_CANDIDATE]) expectSuccess(problems, record.taskId, await records.record(record));
      const unknown = taskId('task-0');
      expectSame(problems, 'list', await records.list([OTHER_TASK, unknown, TASK, UPPER_TASK]), [NO_CANDIDATE, WAITING, rejected]);
      expectSame(problems, 'some', await records.list([OTHER_TASK, unknown]), [rejected]);
      expectSame(problems, 'none asked', await records.list([]), []);
      return problems;
    },
  },
]);
