import {
  activeAttempt,
  cardColumn,
  closeStage,
  columnOf,
  currentStage,
  isMergeReady,
  mostUrgentGate,
  stageGraph,
  stageSummary,
  type BoardCard,
  type CardRecord,
  type CardTask,
  type CardWait,
  type FleetObstacleReason,
  type MergeGateState,
  type NeedsYouItem,
  type NeedsYouScope,
  type NeedsYouSource,
  type PlacementObstacle,
  type StageGraph,
  type StageView,
  type Task,
  type TaskView,
} from '@taskelith/execution';
import type { MergeQueue, MergeRequest } from '@taskelith/integrations';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { isEligibleForPlacement, type WorkerPlacementRecord } from '@taskelith/scheduling';
import type { Gate, TaskAdmission, WorkflowRun, WorkflowRunBinding } from '@taskelith/sdlc';
import type { BoardReads } from './board-reads.js';
import { ACTIVITY_URGENCY, taskState, type TaskContext, type TaskState } from './card-tasks.js';

// The inbox sources, each bound to one snapshot's reads.
export type SnapshotSources = (reads: BoardReads) => readonly NeedsYouSource[];

export interface CardViewParts {
  readonly mergeQueue: Pick<MergeQueue, 'latestForRun'>;
  readonly sources: SnapshotSources;
}

export interface CardView {
  readonly card: BoardCard;
  readonly stages: readonly StageView[];
  readonly runBinding: WorkflowRunBinding;
  readonly tasks: readonly TaskView[];
}

interface CardTaskState {
  readonly link: CardTask;
  readonly task: Task;
  readonly admission: TaskAdmission;
  readonly state: TaskState;
}

const IN_QUEUE: readonly MergeGateState[] = ['ready', 'queued', 'merging', 'resolving-conflict'];
const FOR_A_PERSON: readonly MergeGateState[] = ['awaiting-manual-merge', 'escalated'];

// The cards of one snapshot (product ports sections 3.2 to 3.9); each read
// is made at most once per snapshot.
export class CardReader {
  readonly #reads: BoardReads;
  readonly #parts: CardViewParts;
  readonly #asOf: Instant;
  readonly #items = new Map<string, Promise<Result<readonly NeedsYouItem[]>>>();
  #workers: Promise<Result<readonly WorkerPlacementRecord[]>> | undefined;
  #fleet: Promise<Result<FleetObstacleReason | undefined>> | undefined;

  constructor(reads: BoardReads, parts: CardViewParts, asOf: Instant) {
    this.#reads = reads;
    this.#parts = parts;
    this.#asOf = asOf;
  }

  get asOf(): Instant {
    return this.#asOf;
  }

  // Every open item of the scope over every source, newest first.
  openItems(scope: NeedsYouScope): Promise<Result<readonly NeedsYouItem[]>> {
    const key = scope.kind === 'project' ? `project:${scope.projectId}` : 'installation';
    let items = this.#items.get(key);
    if (items === undefined) {
      items = allOpenItems(this.#parts.sources(this.#reads), scope);
      this.#items.set(key, items);
    }
    return items;
  }

  async workersOnline(): Promise<Result<number>> {
    const workers = await this.#onlineWorkers();
    return workers.ok ? ok(workers.value.length) : workers;
  }

  async card(record: CardRecord): Promise<Result<BoardCard>> {
    const view = await this.view(record);
    return view.ok ? ok(view.value.card) : view;
  }

  async view(record: CardRecord): Promise<Result<CardView>> {
    const run = inconsistentIfMissing(await this.#reads.runs.get(record.runId), `card ${record.runId} has no run`);
    if (!run.ok) return run;
    const gates = await this.#reads.gates.listByRun(record.runId);
    const request = await this.#mergeRequest(record);
    if (!request.ok) return request;
    const items = await this.openItems({ kind: 'project', projectId: record.projectId });
    if (!items.ok) return items;
    const own = items.value.filter((item) => item.subject.scope === 'card' && item.subject.runId === record.runId);
    const tasks = await this.#taskStates(record, own);
    if (!tasks.ok) return tasks;
    const autoMerge = await this.#reads.autoMergeEnabled(record.projectId);
    if (!autoMerge.ok) return autoMerge;
    const graph = stageGraph(run.value.progress);
    const integration = mergeGate(isMergeReady(graph, gates), autoMerge.value, request.value);
    const card = cardOf({ record, run: run.value, gates, graph, tasks: tasks.value, integration, needsYou: own.length });
    const merged = request.value?.state === 'merged';
    return ok(Object.freeze({
      card, stages: stageViews(graph, gates, merged), runBinding: run.value.binding, tasks: Object.freeze(tasks.value.map(taskView)),
    }));
  }

  async #mergeRequest(record: CardRecord): Promise<Result<MergeRequest | undefined>> {
    const latest = await this.#parts.mergeQueue.latestForRun(record.runId);
    if (latest.ok) return latest;
    return latest.error.code === 'not-found' ? ok(undefined) : latest;
  }

  async #taskStates(record: CardRecord, items: readonly NeedsYouItem[]): Promise<Result<readonly CardTaskState[]>> {
    const links = await this.#reads.cards.tasks(record.runId);
    if (!links.ok) return links;
    const states: CardTaskState[] = [];
    for (const link of links.value) {
      const task = inconsistentIfMissing(await this.#reads.tasks.get(link.taskId), `card task ${link.taskId} has no record`);
      if (!task.ok) return task;
      const admission = inconsistentIfMissing(
        await this.#reads.admissions.get(task.value.admissionId), `card task ${link.taskId} has no admission`,
      );
      if (!admission.ok) return admission;
      const hasOpenItem = items.some((item) => item.subject.scope === 'card' && item.subject.taskId === link.taskId);
      const state = await taskState(task.value, this.#taskContext(hasOpenItem));
      if (!state.ok) return state;
      states.push({ link, task: task.value, admission: admission.value, state: state.value });
    }
    return ok(states);
  }

  #taskContext(hasOpenItem: boolean): TaskContext {
    return {
      reads: this.#reads, asOf: this.#asOf, hasOpenItem,
      workers: async () => {
        const workers = await this.#allWorkers();
        return workers.ok ? ok(new Map(workers.value.map((worker) => [worker.workerId, worker] as const))) : workers;
      },
      fleetObstacle: () => {
        this.#fleet ??= this.#fleetObstacle();
        return this.#fleet;
      },
    };
  }

  #allWorkers(): Promise<Result<readonly WorkerPlacementRecord[]>> {
    this.#workers ??= this.#reads.fleet.workers();
    return this.#workers;
  }

  async #onlineWorkers(): Promise<Result<readonly WorkerPlacementRecord[]>> {
    const workers = await this.#allWorkers();
    return workers.ok ? ok(workers.value.filter((worker) => worker.enrolled && !worker.revoked && worker.reachable)) : workers;
  }

  // Section 3.8 rule 1: no worker online, eligible, or with a free slot.
  async #fleetObstacle(): Promise<Result<FleetObstacleReason | undefined>> {
    if (await this.#reads.fleet.quarantined()) return ok('quarantined');
    const online = await this.#onlineWorkers();
    if (!online.ok) return online;
    if (online.value.length === 0) return ok('no-candidate');
    const eligible = online.value.filter(isEligibleForPlacement);
    if (eligible.length === 0) return ok('worker-not-eligible');
    for (const worker of eligible) {
      if ((await this.#reads.fleet.occupancy(worker.workerId)).slots < worker.slots) return ok(undefined);
    }
    return ok('worker-capacity-exhausted');
  }
}

async function allOpenItems(sources: readonly NeedsYouSource[], scope: NeedsYouScope): Promise<Result<readonly NeedsYouItem[]>> {
  const items: NeedsYouItem[] = [];
  for (const source of sources) {
    let after: string | undefined;
    for (;;) {
      const page = await source.openItems(scope, after);
      if (!page.ok) return err(failure('unavailable', `inbox source ${source.id} cannot be read: ${page.error.message}`));
      items.push(...page.value.items);
      if (page.value.items.length === 0) break;
      after = page.value.items.at(-1)!.id;
    }
  }
  return ok(Object.freeze(items.sort(newestFirst)));
}

// A record that a registered card names but its store lacks is an
// inconsistency of the stored state, never a missing card.
function inconsistentIfMissing<T>(read: Result<T>, message: string): Result<T> {
  return read.ok || read.error.code !== 'not-found' ? read : err(failure('internal', message));
}

function newestFirst(left: NeedsYouItem, right: NeedsYouItem): number {
  const byTime = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (byTime !== 0) return byTime;
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

// Section 3.4: a request in flight or merged decides; otherwise readiness,
// the withdrawal reason, and the setting do.
export function mergeGate(ready: boolean, autoMerge: boolean, request: MergeRequest | undefined): MergeGateState {
  if (request !== undefined && request.state !== 'withdrawn') return request.state === 'merged' ? 'integrated' : request.state;
  if (!ready) return 'not-ready';
  const reason = request?.withdrawalReason;
  if (reason === 'cancelled' || reason === 'maintainer-withdrew') return 'withdrawn';
  if (!autoMerge || reason === 'manual-merge') return 'awaiting-manual-merge';
  return 'ready';
}

interface CardInputs {
  readonly record: CardRecord;
  readonly run: WorkflowRun;
  readonly gates: readonly Gate[];
  readonly graph: StageGraph;
  readonly tasks: readonly CardTaskState[];
  readonly integration: MergeGateState;
  readonly needsYou: number;
}

function cardOf({ record, run, gates, graph, tasks, integration, needsYou }: CardInputs): BoardCard {
  const current = currentStage(graph);
  const ofStage = tasksOfStage(tasks, current.id);
  const states = ofStage.map((each) => each.state);
  const session = ACTIVITY_URGENCY.map((state) => states.find((each) => each.session.state === state)?.session).find((found) => found !== undefined);
  const rejected = firstObstacle(states, 'rejected');
  const waiting = firstObstacle(states, 'waiting');
  const idle = ofStage.every((each) => activeAttempt(each.task) === undefined);
  const end = idle ? latestEnd(states) : undefined;
  const gate = mostUrgentGate(current.id, gates);
  const waitingFor = waitOf({ needsYou, integration, capacity: waiting !== undefined, idle, archived: integration === 'integrated', review: current.obligations.includes('review'), stageDone: graph.states.get(current.id) === 'completed' });
  const obstacle = rejected ?? (waitingFor === 'capacity' ? waiting : undefined);
  return Object.freeze({
    runId: record.runId, title: record.title, workType: record.workType,
    framework: Object.freeze({ pluginId: run.binding.pluginId, pluginVersion: run.binding.pluginVersion }),
    column: cardColumn(graph, integration === 'integrated'), stage: stageSummary(current, graph),
    ...(gate === undefined ? {} : { gate }), ...(waitingFor === undefined ? {} : { waitingFor }),
    ...(obstacle === undefined ? {} : { obstacle }), ...(end === undefined ? {} : { end }),
    session: session ?? Object.freeze({ state: 'none' as const }), integration, needsYou,
  });
}

// The root tasks admitted to the stage, with their delegated children.
function tasksOfStage(tasks: readonly CardTaskState[], stageId: string): readonly CardTaskState[] {
  const roots = new Set(tasks.filter((each) => each.link.depth === 0 && each.admission.stageId === stageId).map((each) => each.link.taskId));
  const parents = new Map(tasks.map((each) => [each.link.taskId, each.link.parentTaskId] as const));
  const rootOf = (taskId: string | undefined): string | undefined => {
    let current = taskId;
    while (current !== undefined && parents.get(current as never) !== undefined) current = parents.get(current as never);
    return current;
  };
  return tasks.filter((each) => roots.has(rootOf(each.link.taskId) as never));
}

// Section 3.3: the card shows a rejection, or a waiting obstacle only while
// it waits for capacity; the first in task identifier order.
function firstObstacle(states: readonly TaskState[], disposition: PlacementObstacle['disposition']): PlacementObstacle | undefined {
  const obstacles = states.flatMap((state) => (state.obstacle?.disposition === disposition ? [state.obstacle] : []));
  return obstacles.sort((left, right) => (left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0))[0];
}

function latestEnd(states: readonly TaskState[]): BoardCard['end'] {
  const ends = states.flatMap((state) => (state.end === undefined ? [] : [state.end]));
  return ends.sort((left, right) => Date.parse(right.outcome.endedAt) - Date.parse(left.outcome.endedAt))[0];
}

interface WaitInputs {
  readonly needsYou: number;
  readonly integration: MergeGateState;
  readonly capacity: boolean;
  readonly idle: boolean;
  readonly archived: boolean;
  readonly review: boolean;
  readonly stageDone: boolean;
}

// The first that holds: a person, the merge queue, capacity, then a reviewer
// or an admission for an idle stage that has not completed.
function waitOf({ needsYou, integration, capacity, idle, archived, review, stageDone }: WaitInputs): CardWait | undefined {
  if (needsYou > 0 || FOR_A_PERSON.includes(integration)) return 'person';
  if (IN_QUEUE.includes(integration)) return 'merge-queue';
  if (capacity) return 'capacity';
  if (!idle || archived || stageDone) return undefined;
  return review ? 'reviewer' : 'stage-admission';
}

function stageViews(graph: StageGraph, gates: readonly Gate[], merged: boolean): readonly StageView[] {
  const close = closeStage(graph);
  return Object.freeze(graph.order.map((stage) => Object.freeze({
    ...stageSummary(stage, graph),
    column: stage.id === close.id ? (merged ? 'archived' : 'review') : columnOf(stage, graph),
    gates: Object.freeze(gates.filter((gate) => gate.stageId === stage.id).map((gate) => Object.freeze({
      gateId: gate.id, state: gate.state, requiredEvidence: gate.requiredEvidence, ...(gate.blockReason === undefined ? {} : { blockReason: gate.blockReason }),
    }))),
  })));
}

function taskView({ link, task, admission, state }: CardTaskState): TaskView {
  return Object.freeze({
    taskId: task.id, taskRunId: link.taskRunId, ownershipGeneration: task.ownershipGeneration,
    admission: Object.freeze({
      admissionId: admission.id, stageId: admission.stageId, ...(admission.workItemId === undefined ? {} : { workItemId: admission.workItemId }),
      state: admission.state, policyRevision: admission.policyRevision,
      ...(admission.ownershipGeneration === undefined ? {} : { dispatchedGeneration: admission.ownershipGeneration }),
    }),
    ...(link.parentTaskId === undefined ? {} : { delegation: Object.freeze({ parentTaskId: link.parentTaskId, depth: link.depth }) }),
    ...state,
  });
}

