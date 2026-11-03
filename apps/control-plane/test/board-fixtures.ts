import type { BoardReads, BoardStore, CardViewParts } from '@taskelith/control-plane';
import { InMemoryCardCatalog, type CardTask, type NeedsYouItem, type NeedsYouSource, type Task } from '@taskelith/execution';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { Assignment, PlacementOutcomeRecord, WorkerPlacementRecord } from '@taskelith/scheduling';
import type { Gate, StageState, TaskAdmission, WorkflowRun } from '@taskelith/sdlc';

export const AS_OF = '2026-11-03T10:00:00.000Z' as Instant;
export const EARLY = '2026-11-03T08:00:00.000Z' as Instant;
export const LATE = '2026-11-03T09:00:00.000Z' as Instant;

export const OPENSPEC_STAGES = [
  { id: 'proposal', obligations: ['intake', 'specification'], dependsOn: [] as string[] },
  { id: 'specs', obligations: ['specification'], dependsOn: ['proposal'] },
  { id: 'apply', obligations: ['implementation'], dependsOn: ['specs'] },
  { id: 'review', obligations: ['review'], dependsOn: ['apply'] },
  { id: 'archive', obligations: ['closure'], dependsOn: ['review'] },
];

export const BINDING = {
  pluginId: 'openspec', pluginVersion: '1.0.0', upstreamToolVersion: '1.3.1', workflowId: 'flow', workflowVersion: '1',
  workflowDigest: `sha256:${'a'.repeat(64)}`, configurationRevision: 'config-1', policyRevision: 'policy-1',
};

export function run(id: string, states: Readonly<Record<string, StageState>> = {}): WorkflowRun {
  const stages = OPENSPEC_STAGES.map((stage) => ({ ...stage, origin: 'native' }));
  const progress = {
    definition: { id: 'flow', version: '1', stages }, generation: 1,
    stages: stages.map((stage) => ({ stageId: stage.id, state: states[stage.id] ?? 'not-started', changedAt: EARLY })),
  };
  return { id, binding: BINDING, progress } as never;
}

export function gate(id: string, stageId: string, state: Gate['state'] = 'passed'): Gate {
  return { id, stageId, state, requiredEvidence: 'structural-validation', generation: 1, changedAt: EARLY } as never;
}

export function execution(id: string, workerId: string, extra: object = {}) {
  return { id, assignmentId: `assign-${id}`, workerId, state: 'started', grants: [], evidence: [], unauthorizedStarts: [], ...extra };
}

export function task(id: string, attempts: readonly object[] = [], ownershipGeneration = 1): Task {
  return { id, admissionId: `adm-${id}`, ownershipGeneration, attempts, generation: 1, changedAt: EARLY } as never;
}

export function admission(taskId: string, stageId: string): TaskAdmission {
  return {
    id: `adm-${taskId}`, taskId, kind: 'implementation', workflowId: 'flow', workflowVersion: '1', stageId, workItemId: `wi-${taskId}`,
    artifacts: [], policyRevision: 'policy-1', createdRevisions: [], state: 'used', generation: 1, changedAt: EARLY, ownershipGeneration: 1,
  } as never;
}

export function worker(workerId: string, extra: Partial<WorkerPlacementRecord> = {}): WorkerPlacementRecord {
  return {
    workerId, enrolled: true, revoked: false, draining: false, reachable: true, lastContactAt: EARLY, slots: 1, cpuMillicores: 1000,
    memoryMebibytes: 1024, controls: [], protocolVersion: 1, admitted: true, ...extra,
  } as never;
}

export function item(id: string, runId: string, extra: Partial<Record<string, unknown>> = {}): NeedsYouItem {
  const { taskId, createdAt = LATE, kind = 'permission-request', projectId = 'alpha' } = extra as Record<string, string | undefined>;
  return {
    id, sourceId: 'native-requests', kind, title: `item ${id}`, createdAt, answerableBy: 'project-operator', state: 'open',
    subject: {
      scope: 'card', projectId, runId, taskId: taskId ?? `task-of-${id}`, attemptId: `att-of-${id}`, attemptGeneration: 1,
      sessionId: `session-of-${id}`, sessionGeneration: 1, nativeRequestId: `native-${id}`,
    },
  } as never;
}

// One snapshot's stores in memory; `calls` records the order of reads.
export class BoardWorld {
  readonly catalog = new InMemoryCardCatalog();
  readonly calls: string[] = [];
  readonly runs = new Map<string, WorkflowRun>();
  readonly gates = new Map<string, Gate[]>();
  readonly tasks = new Map<string, Task>();
  readonly admissions = new Map<string, TaskAdmission>();
  readonly sessions = new Map<string, readonly object[]>();
  readonly outcomes = new Map<string, PlacementOutcomeRecord>();
  readonly assignments = new Map<string, Assignment[]>();
  readonly workers: WorkerPlacementRecord[] = [];
  readonly occupied = new Map<string, number>();
  readonly held = new Set<string>();
  readonly autoMergeOff = new Set<string>();
  items: NeedsYouItem[] = [];
  head = 7;
  quarantined = false;
  failSource = false;

  async card(runId: string, projectId = 'alpha', at: Instant = EARLY, stored: WorkflowRun = run(runId)): Promise<void> {
    const registered = await this.catalog.register({ runId: runId as never, projectId: projectId as never, title: `Card ${runId}`, workType: 'feature', createdAt: at });
    if (!registered.ok) throw new Error(registered.error.message);
    this.runs.set(runId, stored);
  }

  // A task of the card admitted now, in the stage `stageId`, with an
  // optional session that binds the task's attempts, ended or not.
  async addTask(runId: string, stored: Task, stageId: string, options: { session?: boolean; parent?: string; depth?: number } = {}): Promise<void> {
    const link = { taskId: stored.id, taskRunId: runId, ...(options.parent === undefined ? {} : { parentTaskId: options.parent }), depth: options.depth ?? 0 };
    const admitted = await this.catalog.admit(link as CardTask);
    if (!admitted.ok) throw new Error(admitted.error.message);
    this.tasks.set(stored.id, stored);
    this.admissions.set(stored.admissionId, admission(stored.id, stageId));
    if (options.session !== false) this.sessions.set(stored.id, [sessionOf(stored)]);
  }

  reads(): BoardReads {
    const record = <Value>(name: string, value: Value): Value => {
      this.calls.push(name);
      return value;
    };
    return {
      head: async () => record('head', ok(this.head)),
      now: async () => record('now', AS_OF),
      cards: {
        get: (runId) => this.catalog.get(runId),
        listByProject: (projectId) => this.catalog.listByProject(projectId),
        tasks: (runId) => this.catalog.tasks(runId),
      },
      runs: { get: async (id) => found(this.runs.get(id), id) },
      gates: { listByRun: async (runId) => this.gates.get(runId) ?? [] },
      tasks: { get: async (id) => found(this.tasks.get(id), id) },
      admissions: { get: async (id) => found(this.admissions.get(id), id) },
      timeline: { sessions: { listByTask: async (taskId: string) => ok(this.sessions.get(taskId) ?? []) } } as never,
      placementOutcomes: { get: async (taskId) => this.outcomes.get(taskId) },
      assignments: { listByAttempt: async (attemptId) => this.assignments.get(attemptId) ?? [] },
      fleet: {
        workers: async () => ok(this.workers),
        quarantined: async () => this.quarantined,
        occupancy: async (workerId) => ({ slots: this.occupied.get(workerId) ?? 0, cpuMillicores: 0, memoryMebibytes: 0 }),
        heldForAttempt: async (attemptId) => this.held.has(attemptId),
      },
      autoMergeEnabled: async (projectId) => ok(!this.autoMergeOff.has(projectId)),
    };
  }

  store(): BoardStore {
    return { snapshot: (work) => work(this.reads()) };
  }

  // A source that pages its items two at a time, as a real one pages.
  source(): NeedsYouSource {
    return {
      id: 'native-requests' as never, kinds: ['permission-request'],
      openItems: async (scope, after) => {
        if (this.failSource) return err(failure('unavailable', 'the source is down'));
        const own = this.items.filter((each) => scope.kind === 'project' && each.subject.scope === 'card' && each.subject.projectId === scope.projectId);
        const start = after === undefined ? 0 : own.findIndex((each) => each.id === after) + 1;
        return ok({ items: own.slice(start, start + 2), position: String(this.head) });
      },
      answer: async () => err(failure('internal', 'not answered here')),
    };
  }

  parts(): CardViewParts {
    return { mergeQueue: { latestForRun: async () => err(failure('not-found', 'no request')) }, sources: () => [this.source()] };
  }
}

function sessionOf(stored: Task): object {
  const attempts = stored.attempts.map((attempt) => ({ id: attempt.id, ownershipGeneration: stored.ownershipGeneration, ended: attempt.outcome !== undefined }));
  return { id: `session-${stored.id}`, attempts, generations: [] };
}

function found<Value>(value: Value | undefined, id: string): Result<Value> {
  return value === undefined ? err(failure('not-found', `${id} is unknown`)) : ok(value);
}
