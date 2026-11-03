import type { Instant } from '@taskelith/kernel';
import { expectCode, expectRead, expectSuccess, type ConformanceCase, type ProjectId, type WorkflowRunId } from '@taskelith/sdlc';
import type { CardCatalog, CardRecord } from './card-catalog.js';

const ALPHA = 'alpha' as ProjectId;
const BETA = 'beta' as ProjectId;

function card(runId: string, projectId: ProjectId, createdAt: string, title = `Card ${runId}`): CardRecord {
  return { runId: runId as WorkflowRunId, projectId, title, workType: 'feature', createdAt: createdAt as Instant };
}

const FIRST = card('run-b', ALPHA, '2026-11-03T08:00:00.000Z');
const TIED = card('run-c', ALPHA, '2026-11-03T08:00:00.000Z');
const LATER = card('run-a', ALPHA, '2026-11-03T09:00:00.000Z');
const OTHER = card('run-d', BETA, '2026-11-03T07:00:00.000Z');

export const CARD_CATALOG_CONFORMANCE: readonly ConformanceCase<CardCatalog>[] = Object.freeze([
  {
    name: 'a card is registered once and read back by its run',
    async check(catalog) {
      const problems: string[] = [];
      expectRead(problems, 'unknown', await catalog.get(FIRST.runId), undefined);
      expectSuccess(problems, 'register', await catalog.register(FIRST));
      expectRead(problems, 'read', await catalog.get(FIRST.runId), FIRST);
      expectCode(problems, 'again', await catalog.register({ ...FIRST, title: 'Other' }), 'conflict');
      expectRead(problems, 'unchanged', await catalog.get(FIRST.runId), FIRST);
      return problems;
    },
  },
  {
    name: 'a project lists its own cards, oldest first and then by run identifier',
    async check(catalog) {
      const problems: string[] = [];
      for (const each of [LATER, TIED, OTHER, FIRST]) expectSuccess(problems, `register ${each.runId}`, await catalog.register(each));
      expectRead(problems, 'alpha', await catalog.listByProject(ALPHA), [FIRST, TIED, LATER]);
      expectRead(problems, 'beta', await catalog.listByProject(BETA), [OTHER]);
      expectRead(problems, 'none', await catalog.listByProject('gamma' as ProjectId), []);
      return problems;
    },
  },
  {
    name: 'a title past 200 characters, with a control character, or an unknown work type is refused',
    async check(catalog) {
      const problems: string[] = [];
      expectCode(problems, 'long', await catalog.register(card('run-x', ALPHA, FIRST.createdAt, 'x'.repeat(201))), 'invalid');
      expectCode(problems, 'control', await catalog.register(card('run-y', ALPHA, FIRST.createdAt, 'a\nb')), 'invalid');
      expectCode(problems, 'empty', await catalog.register(card('run-z', ALPHA, FIRST.createdAt, '')), 'invalid');
      const kind = { ...card('run-w', ALPHA, FIRST.createdAt), workType: 'chore' } as unknown as CardRecord;
      expectCode(problems, 'work type', await catalog.register(kind), 'invalid');
      expectSuccess(problems, 'longest', await catalog.register(card('run-v', ALPHA, FIRST.createdAt, 'é'.repeat(200))));
      expectRead(problems, 'only the valid one', await catalog.listByProject(ALPHA), [card('run-v', ALPHA, FIRST.createdAt, 'é'.repeat(200))]);
      return problems;
    },
  },
]);
