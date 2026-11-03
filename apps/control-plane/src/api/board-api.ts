import { projectRequirement } from '@taskelith/access';
import type { HttpSchemas } from '@taskelith/contracts';
import {
  NEEDS_YOU_KINDS,
  type BoardReadModel,
  type TaskDetail,
  type NeedsYouCounts,
  type NeedsYouFilter,
  type NeedsYouInbox,
  type NeedsYouKind,
  type NeedsYouList,
  type NeedsYouScope,
} from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { ProjectId, WorkflowRunId } from '@taskelith/sdlc';
import type { ApiRequest } from './api-server.js';
import { inboxItemBody } from './event-stream-wire.js';
import type { InboxAnswerOperations } from './inbox-answer-api.js';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

const INSTALLATION: NeedsYouScope = Object.freeze({ kind: 'installation' });

// What the views and the answers of wire contracts section 8 reach.
export interface BoardOperations extends InboxAnswerOperations {
  readonly views: NeedsYouInbox & { forCaller(callerMayAct: boolean): BoardReadModel };
  readonly projects: { readProject(projectId: string): Promise<Result<unknown>> };
}

// The six reads of section 8. The server checked the read role first, so
// an unknown project answers 404 only to an installation-owner.
export class BoardApi {
  readonly #operations: BoardOperations;

  constructor(operations: BoardOperations) {
    this.#operations = operations;
  }

  async readBoard(request: ApiRequest): Promise<Result<Wire<'Board'>>> {
    const projectId = await this.#project(request);
    if (!projectId.ok) return projectId;
    const mayAct = await this.#callerMayAct(request, projectId.value);
    if (!mayAct.ok) return mayAct;
    const board = await this.#operations.views.forCaller(mayAct.value).board(projectId.value);
    return board.ok ? ok({ ...board.value, cards: [...board.value.cards] }) : board;
  }

  async readTaskDetail(request: ApiRequest): Promise<Result<Wire<'TaskDetail'>>> {
    const projectId = await this.#project(request);
    if (!projectId.ok) return projectId;
    const runId = parseIdentifier('RunId', request.parameters[1] ?? '');
    if (!runId.ok) return runId;
    const detail = await this.#operations.views.forCaller(false).taskDetail(projectId.value, runId.value as WorkflowRunId);
    return detail.ok ? ok(taskDetailBody(detail.value)) : detail;
  }

  async readInbox(request: ApiRequest): Promise<Result<Wire<'InboxView'>>> {
    const projectId = await this.#project(request);
    if (!projectId.ok) return projectId;
    const filter = filterOf(request, true);
    if (!filter.ok) return filter;
    return listBody(await this.#operations.views.open(projectOf(projectId.value), filter.value));
  }

  async readInboxCounts(request: ApiRequest): Promise<Result<Wire<'InboxCounts'>>> {
    const projectId = await this.#project(request);
    if (!projectId.ok) return projectId;
    return countsBody(await this.#operations.views.counts(projectOf(projectId.value)));
  }

  async readInstallationInbox(request: ApiRequest): Promise<Result<Wire<'InboxView'>>> {
    const filter = filterOf(request, false);
    if (!filter.ok) return filter;
    return listBody(await this.#operations.views.open(INSTALLATION, filter.value));
  }

  async readInstallationInboxCounts(): Promise<Result<Wire<'InboxCounts'>>> {
    return countsBody(await this.#operations.views.counts(INSTALLATION));
  }

  async #project({ parameters }: ApiRequest): Promise<Result<ProjectId>> {
    const projectId = parameters[0] ?? '';
    const project = await this.#operations.projects.readProject(projectId);
    return project.ok ? ok(projectId as ProjectId) : project;
  }

  // Whether Access lets the caller operate the project; an owner without a
  // project role reads it but may not act (wire contracts section 3).
  async #callerMayAct(request: ApiRequest, projectId: ProjectId): Promise<Result<boolean>> {
    if (request.principalId === undefined) return err(failure('internal', 'a board read reached its handler without a principal'));
    const allowed = await this.#operations.authorization.authorize(request.principalId, projectRequirement(projectId, 'project-operator'));
    if (allowed.ok) return ok(true);
    return allowed.error.code === 'forbidden' ? ok(false) : allowed;
  }
}

function projectOf(projectId: ProjectId): NeedsYouScope {
  return Object.freeze({ kind: 'project', projectId });
}

function filterOf({ query }: ApiRequest, byCard: boolean): Result<NeedsYouFilter> {
  const kind = query.get('kind');
  if (kind !== null && !(NEEDS_YOU_KINDS as readonly string[]).includes(kind)) return err(failure('invalid', `${kind} is not an inbox item kind`));
  const runText = byCard ? query.get('runId') : null;
  const runId = runText === null ? ok(undefined) : parseIdentifier('RunId', runText);
  if (!runId.ok) return runId;
  return ok(Object.freeze({
    ...(kind === null ? {} : { kind: kind as NeedsYouKind }), ...(runId.value === undefined ? {} : { runId: runId.value as WorkflowRunId }),
  }));
}

// The wire's arrays are mutable; its fields are the port's.
function taskDetailBody(detail: TaskDetail): Wire<'TaskDetail'> {
  return {
    ...detail,
    stages: detail.stages.map((stage) => ({ ...stage, gates: [...stage.gates] })),
    traceability: detail.traceability.map((link) => ({ ...link, workItemIds: [...link.workItemIds], attemptIds: [...link.attemptIds] })),
    tasks: [...detail.tasks],
  };
}

function listBody(list: Result<NeedsYouList>): Result<Wire<'InboxView'>> {
  if (!list.ok) return list;
  const { asOf, position, items } = list.value;
  return ok({ asOf, position, items: items.map(inboxItemBody) });
}

function countsBody(counts: Result<NeedsYouCounts>): Result<Wire<'InboxCounts'>> {
  if (!counts.ok) return counts;
  const { asOf, position, total, byCard } = counts.value;
  return ok({ asOf, position, total, byCard: byCard.map(({ runId, count }) => ({ runId, count })) });
}
