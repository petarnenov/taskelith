import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { AssignmentExecutions } from '@taskelith/execution';
import {
  expectCode,
  expectOneWinner,
  expectRaceWinnerStored,
  expectRead,
  expectSame,
  expectSuccess,
  nextGeneration,
  parseOwnershipGeneration,
  type ConformanceCase,
  type JsonObject,
} from '@taskelith/sdlc';
import { acceptAssignment, createAssignment, endAssignment, type Assignment } from '../domain/assignment.js';
import { parseResourceRequest, type RunId } from '../domain/capacity-reservation.js';
import {
  recordDelegation,
  redecideDelegation,
  type DelegationId,
  type DelegationInput,
  type DelegationRecord,
} from '../domain/delegation-request.js';
import type { AssignmentRepository } from './assignment-repository.js';
import type { DelegationRequests } from './delegation-requests.js';

// A shared suite that the in-memory and the database adapters of the
// assignment port both pass; each case expects a port with nothing stored.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const AT: Instant = must(parseInstant('2026-10-25T09:00:00.000Z'));
const LATER: Instant = must(parseInstant('2026-10-25T09:00:10.000Z'));
const NO_EXECUTION: AssignmentExecutions = { granted: false, nonTerminal: false };

function offered(id: string, attempt: string, offerCommand?: string): Assignment {
  const taskId = must(parseIdentifier('TaskId', 'task-1'));
  return createAssignment({
    id: must(parseIdentifier('AssignmentId', id)),
    attemptId: must(parseIdentifier('AttemptId', attempt)),
    workerId: must(parseIdentifier('WorkerId', 'worker-1')),
    ownershipGeneration: must(parseOwnershipGeneration(2)),
    ...(offerCommand === undefined ? {} : { offerCommandId: must(parseIdentifier('EventId', offerCommand)) }),
    reservation: {
      id: must(parseIdentifier('ReservationId', `reservation-${id}`)),
      scope: {
        projectId: must(parseIdentifier('ProjectId', 'project-1')),
        runId: must(parseIdentifier('RunId', 'run-1')),
        taskId,
        rootTaskId: taskId,
      },
      requested: must(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: ['memory-limit'] })),
      providerCredentials: [],
    },
  }, AT);
}

function ended(assignment: Assignment): Assignment {
  return must(endAssignment(assignment, assignment.generation, 'cancelled', NO_EXECUTION, LATER));
}

function advanced(assignment: Assignment): Assignment {
  return { ...assignment, generation: nextGeneration(assignment.generation) };
}

export const ASSIGNMENT_REPOSITORY_CONFORMANCE: readonly ConformanceCase<AssignmentRepository>[] = Object.freeze([
  {
    name: 'an assignment with its reservation reads back as stored, once',
    async check(repository: AssignmentRepository) {
      const problems: string[] = [];
      const stored = offered('assignment-1', 'attempt-1');
      expectSuccess(problems, 'add', await repository.add(stored));
      expectCode(problems, 'second add', await repository.add(stored), 'conflict');
      expectRead(problems, 'get', await repository.get(stored.id), stored);
      expectCode(problems, 'get unknown', await repository.get(offered('assignment-x', 'attempt-x').id), 'not-found');
      return problems;
    },
  },
  {
    name: 'replace compares the assignment generation',
    async check(repository: AssignmentRepository) {
      const problems: string[] = [];
      const first = offered('assignment-1', 'attempt-1');
      expectSuccess(problems, 'add', await repository.add(first));
      const acceptance = must(acceptAssignment(first, first.generation, first.workerId, LATER));
      expectSuccess(problems, 'replace', await repository.replace(acceptance, first.generation));
      expectCode(problems, 'stale replace', await repository.replace(advanced(first), first.generation), 'conflict');
      expectCode(problems, 'unchanged generation', await repository.replace(acceptance, acceptance.generation), 'invalid');
      expectRead(problems, 'after rejected writes', await repository.get(first.id), acceptance);
      expectCode(problems, 'replace unknown', await repository.replace(advanced(offered('assignment-x', 'attempt-x')), first.generation), 'not-found');
      const candidates = [AT, LATER].map((changedAt) => ({ ...advanced(acceptance), changedAt }));
      await expectRaceWinnerStored(problems, 'concurrent replace', candidates,
        (candidate) => repository.replace(candidate, acceptance.generation), () => repository.get(first.id));
      return problems;
    },
  },
  {
    name: 'an attempt holds at most one reservation until it is released',
    async check(repository: AssignmentRepository) {
      const problems: string[] = [];
      const first = offered('assignment-1', 'attempt-1');
      expectSuccess(problems, 'first holder', await repository.add(first));
      expectCode(problems, 'second holder', await repository.add(offered('assignment-2', 'attempt-1')), 'conflict');
      expectSuccess(problems, 'other attempt', await repository.add(offered('assignment-3', 'attempt-2')));
      expectSuccess(problems, 'release', await repository.replace(ended(first), first.generation));
      const second = offered('assignment-2', 'attempt-1');
      expectSuccess(problems, 'after release', await repository.add(second));
      const reheld = { ...advanced(ended(first)), reservation: first.reservation };
      expectCode(problems, 'replace holding again', await repository.replace(reheld, ended(first).generation), 'conflict');
      expectCode(problems, 'stale and holding again', await repository.replace(reheld, first.generation), 'conflict');
      expectCode(problems, 'unchanged and holding again', await repository.replace({ ...reheld, generation: ended(first).generation }, ended(first).generation), 'invalid');
      expectCode(problems, 'unknown and holding', await repository.replace(advanced(offered('assignment-y', 'attempt-1')), first.generation), 'not-found');
      expectRead(problems, 'released kept', await repository.get(first.id), ended(first));
      const racers = [offered('assignment-4', 'attempt-3'), offered('assignment-5', 'attempt-3')];
      const winner = expectOneWinner(problems, 'concurrent holders', await Promise.all(racers.map((assignment) => repository.add(assignment))));
      if (winner !== undefined) {
        expectRead(problems, 'winning holder', await repository.get(racers[winner]!.id), racers[winner]);
        expectCode(problems, 'losing holder', await repository.get(racers[1 - winner]!.id), 'not-found');
      }
      return problems;
    },
  },
  {
    name: 'the assignments of an attempt are listed, held or not, in any order',
    async check(repository: AssignmentRepository) {
      const problems: string[] = [];
      const first = offered('assignment-2', 'attempt-1');
      const second = offered('assignment-1', 'attempt-1');
      expectSuccess(problems, 'add first', await repository.add(first));
      expectSuccess(problems, 'release first', await repository.replace(ended(first), first.generation));
      expectSuccess(problems, 'add second', await repository.add(second));
      expectSuccess(problems, 'add other attempt', await repository.add(offered('assignment-3', 'attempt-2')));
      const listed = [...await repository.listByAttempt(first.attemptId)].sort((left, right) => (left.id < right.id ? -1 : 1));
      expectSame(problems, 'listed', listed, [second, ended(first)]);
      expectSame(problems, 'unknown attempt', await repository.listByAttempt(must(parseIdentifier('AttemptId', 'attempt-x'))), []);
      return problems;
    },
  },
  {
    name: 'an assignment is found by the command that offered it, also once ended',
    async check(repository: AssignmentRepository) {
      const problems: string[] = [];
      const first = offered('assignment-1', 'attempt-1', 'offer-1');
      expectSuccess(problems, 'add', await repository.add(first));
      expectSuccess(problems, 'add without an offer', await repository.add(offered('assignment-2', 'attempt-2')));
      const command = (text: string) => must(parseIdentifier('EventId', text));
      expectRead(problems, 'offered', await repository.byOfferCommand(command('offer-1')), first);
      expectSuccess(problems, 'end', await repository.replace(ended(first), first.generation));
      expectRead(problems, 'ended', await repository.byOfferCommand(command('offer-1')), ended(first));
      expectCode(problems, 'unknown command', await repository.byOfferCommand(command('offer-x')), 'not-found');
      return problems;
    },
  },
]);

function delegationInput(text: string, child: JsonObject = { taskId: 'task-child', kind: 'planning', stageId: 'specs' }): DelegationInput {
  return {
    delegationId: must(parseIdentifier('DelegationId', text)) as DelegationId,
    workerId: must(parseIdentifier('WorkerId', 'worker-1')),
    values: {
      attemptId: must(parseIdentifier('AttemptId', 'attempt-1')),
      ownershipGeneration: must(parseOwnershipGeneration(2)),
      runId: must(parseIdentifier('RunId', 'run-1')) as RunId,
      child,
    },
    waitingSince: AT,
  };
}

function delegation(text: string): DelegationRecord {
  return recordDelegation(delegationInput(text), { state: 'awaiting-capacity' });
}

export const DELEGATION_REQUESTS_CONFORMANCE: readonly ConformanceCase<DelegationRequests>[] = Object.freeze([
  {
    name: 'a delegation reads back as stored, once, and replace compares its generation',
    async check(requests: DelegationRequests) {
      const problems: string[] = [];
      const waiting = delegation('delegation-1');
      expectSuccess(problems, 'add', await requests.add(waiting));
      expectCode(problems, 'second add', await requests.add(waiting), 'conflict');
      expectRead(problems, 'get', await requests.get(waiting.delegationId), waiting);
      expectCode(problems, 'get unknown', await requests.get(delegation('delegation-x').delegationId), 'not-found');
      const rejected = redecideDelegation(waiting, { state: 'rejected', reason: 'delegation-awaiting-capacity' });
      expectSuccess(problems, 'replace', await requests.replace(rejected, waiting.generation));
      expectCode(problems, 'stale replace', await requests.replace(redecideDelegation(waiting, { state: 'awaiting-capacity' }), waiting.generation), 'conflict');
      expectCode(problems, 'unchanged generation', await requests.replace(rejected, rejected.generation), 'invalid');
      expectCode(problems, 'replace unknown', await requests.replace(redecideDelegation(delegation('delegation-x'), { state: 'awaiting-capacity' }), waiting.generation), 'not-found');
      expectRead(problems, 'after rejected writes', await requests.get(waiting.delegationId), rejected);
      return problems;
    },
  },
  {
    name: 'a delegation does not change when the caller mutates its nested input after add',
    async check(requests: DelegationRequests) {
      const problems: string[] = [];
      const child = { taskId: 'task-child', kind: 'planning', stageId: 'specs', workItem: { id: 'w', nativeReference: 'r' } };
      const stored = recordDelegation(delegationInput('delegation-1', child), { state: 'awaiting-capacity' });
      expectSuccess(problems, 'add', await requests.add(stored));
      child.taskId = 'task-mutated';
      child.workItem.id = 'w-mutated';
      const read = await requests.get(stored.delegationId);
      const readChild = read.ok ? read.value.values.child : undefined;
      expectSame(problems, 'child', readChild, { taskId: 'task-child', kind: 'planning', stageId: 'specs', workItem: { id: 'w', nativeReference: 'r' } });
      return problems;
    },
  },
]);
