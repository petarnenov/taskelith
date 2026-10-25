import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import type { AssignmentExecutions } from '@taskelith/execution';
import {
  expectCode,
  expectSame,
  expectSuccess,
  nextGeneration,
  parseOwnershipGeneration,
  type ConformanceCase,
} from '@taskelith/sdlc';
import { acceptAssignment, createAssignment, endAssignment, type Assignment } from '../domain/assignment.js';
import { parseResourceRequest } from '../domain/capacity-reservation.js';
import type { AssignmentRepository } from './assignment-repository.js';

// A shared suite that the in-memory and the database adapters of the
// assignment port both pass; each case expects a port with nothing stored.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const AT: Instant = must(parseInstant('2026-10-25T09:00:00.000Z'));
const LATER: Instant = must(parseInstant('2026-10-25T09:00:10.000Z'));
const NO_EXECUTION: AssignmentExecutions = { granted: false, nonTerminal: false };

function offered(id: string, attempt: string): Assignment {
  const taskId = must(parseIdentifier('TaskId', 'task-1'));
  return createAssignment({
    id: must(parseIdentifier('AssignmentId', id)),
    attemptId: must(parseIdentifier('AttemptId', attempt)),
    workerId: must(parseIdentifier('WorkerId', 'worker-1')),
    ownershipGeneration: must(parseOwnershipGeneration(2)),
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

export const ASSIGNMENT_REPOSITORY_CONFORMANCE: readonly ConformanceCase<AssignmentRepository>[] = Object.freeze([
  {
    name: 'an assignment with its reservation reads back as stored, once',
    async check(repository: AssignmentRepository) {
      const problems: string[] = [];
      const stored = offered('assignment-1', 'attempt-1');
      expectSuccess(problems, 'add', await repository.add(stored));
      expectCode(problems, 'second add', await repository.add(stored), 'conflict');
      const read = await repository.get(stored.id);
      if (read.ok) expectSame(problems, 'get', read.value, stored);
      else problems.push(`get: ${read.error.message}`);
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
      expectCode(problems, 'stale replace', await repository.replace(first, first.generation), 'conflict');
      const read = await repository.get(first.id);
      if (read.ok) expectSame(problems, 'after conflict', read.value, acceptance);
      expectCode(problems, 'replace unknown', await repository.replace(offered('assignment-x', 'attempt-x'), first.generation), 'not-found');
      const next = { ...acceptance, generation: nextGeneration(acceptance.generation) };
      const results = await Promise.all([1, 2].map(() => repository.replace(next, acceptance.generation)));
      if (results.filter((result) => result.ok).length !== 1) problems.push('concurrent replace: expected one success');
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
      expectSuccess(problems, 'after release', await repository.add(offered('assignment-2', 'attempt-1')));
      const racers = [offered('assignment-4', 'attempt-3'), offered('assignment-5', 'attempt-3')];
      const results = await Promise.all(racers.map((assignment) => repository.add(assignment)));
      if (results.filter((result) => result.ok).length !== 1) problems.push('concurrent holders: expected one success');
      return problems;
    },
  },
]);
