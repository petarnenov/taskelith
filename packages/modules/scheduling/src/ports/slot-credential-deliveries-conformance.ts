import type { AttemptId, ExecutionId, WorkerId } from '@taskelith/execution';
import { parseIdentifier, parseInstant, type Result } from '@taskelith/kernel';
import { expectSame, type ConformanceCase, type TaskId } from '@taskelith/sdlc';
import { parseSlotCredentialVersion } from '../domain/account-slot.js';
import type { ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotDeliveryRecord } from '../domain/slot-credential-delivery.js';
import type { SlotCredentialDeliveries } from './slot-credential-deliveries.js';

// Shared suite for the delivery record port (account pool contract 7, 13).

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const id = <Kind extends string>(kind: Kind, text: string) => must(parseIdentifier(kind, text));
const task = (text: string) => id('TaskId', text) as TaskId;
const execution = (text: string) => id('ExecutionId', text) as ExecutionId;
const slot = (text: string) => id('ProviderCredentialId', text) as ProviderCredentialId;
const TASK = task('task-1');
const EXECUTION = execution('execution-1');

function record(slotText: string, overrides: Partial<SlotDeliveryRecord> = {}): SlotDeliveryRecord {
  return Object.freeze({
    taskId: TASK,
    executionId: EXECUTION,
    slotId: slot(slotText),
    attemptId: id('AttemptId', 'attempt-1') as AttemptId,
    workerId: id('WorkerId', 'worker-1') as WorkerId,
    credentialVersion: must(parseSlotCredentialVersion(1)),
    firstDeliveredAt: must(parseInstant('2026-10-29T09:00:00.000Z')),
    lastDeliveredAt: must(parseInstant('2026-10-29T09:00:00.000Z')),
    deliveries: 1,
    ...overrides,
  });
}

const slotsOf = (records: readonly SlotDeliveryRecord[]) => records.map((stored) => stored.slotId);

export const SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE: readonly ConformanceCase<SlotCredentialDeliveries>[] = Object.freeze([
  {
    name: 'finds a record only by its task, execution, and slot',
    async check(deliveries: SlotCredentialDeliveries) {
      const problems: string[] = [];
      const first = record('slot-a');
      expectSame(problems, 'none yet', await deliveries.find(TASK, EXECUTION, first.slotId), undefined);
      await deliveries.record(first);
      expectSame(problems, 'found', await deliveries.find(TASK, EXECUTION, first.slotId), first);
      expectSame(problems, 'other task', await deliveries.find(task('task-2'), EXECUTION, first.slotId), undefined);
      expectSame(problems, 'other execution', await deliveries.find(TASK, execution('execution-2'), first.slotId), undefined);
      expectSame(problems, 'other slot', await deliveries.find(TASK, EXECUTION, slot('slot-b')), undefined);
      return problems;
    },
  },
  {
    name: 'a record of the same task, execution, and slot replaces the earlier one',
    async check(deliveries: SlotCredentialDeliveries) {
      const problems: string[] = [];
      await deliveries.record(record('slot-a'));
      const replaced = record('slot-a', {
        attemptId: id('AttemptId', 'attempt-2') as AttemptId,
        workerId: id('WorkerId', 'worker-2') as WorkerId,
        credentialVersion: must(parseSlotCredentialVersion(2)),
        lastDeliveredAt: must(parseInstant('2026-10-29T10:00:00.000Z')),
        deliveries: 2,
      });
      await deliveries.record(replaced);
      expectSame(problems, 'replaced', await deliveries.find(TASK, EXECUTION, replaced.slotId), replaced);
      expectSame(problems, 'one record', await deliveries.listByExecution(TASK, EXECUTION), [replaced]);
      return problems;
    },
  },
  {
    name: 'lists the records of one task and execution by code point of slot id',
    async check(deliveries: SlotCredentialDeliveries) {
      const problems: string[] = [];
      // `slot-Z` comes before `slot-a` in code point order only.
      for (const text of ['slot-b', 'slot-Z', 'slot-a']) await deliveries.record(record(text));
      await deliveries.record(record('slot-c', { executionId: execution('execution-2') }));
      await deliveries.record(record('slot-d', { taskId: task('task-2') }));
      const listed = await deliveries.listByExecution(TASK, EXECUTION);
      expectSame(problems, 'ordered', slotsOf(listed), slotsOf([record('slot-Z'), record('slot-a'), record('slot-b')]));
      expectSame(problems, 'other execution', slotsOf(await deliveries.listByExecution(TASK, execution('execution-2'))), [slot('slot-c')]);
      expectSame(problems, 'other task', slotsOf(await deliveries.listByExecution(task('task-2'), EXECUTION)), [slot('slot-d')]);
      expectSame(problems, 'unknown task', await deliveries.listByExecution(task('task-3'), EXECUTION), []);
      return problems;
    },
  },
]);
