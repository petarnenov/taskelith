import { parseEventMetadata, parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { parseArtifactRevision, type ArtifactRevision } from '../domain/artifact-revision.js';
import type { CodeHeadIdentity, CodeObjectId, RepositoryId } from '../domain/code-head.js';
import { openGate, recordGateEvidence, type Gate } from '../domain/gate.js';
import { parseSemanticApproval } from '../domain/gate-evidence.js';
import { nextGeneration, parseGeneration, type Generation } from '../domain/generation.js';
import { parseOwnershipGeneration } from '../domain/ownership-generation.js';
import { startStage } from '../domain/stage-progress.js';
import { admitPlanningTask, useAdmission, type TaskAdmission } from '../domain/task-admission.js';
import { parseWorkItem } from '../domain/work-item.js';
import { parseWorkflowDefinition } from '../domain/workflow-definition.js';
import { beginWorkflowRun, type WorkflowRun } from '../domain/workflow-run.js';
import { parseWorkflowRunBinding } from '../domain/workflow-run-binding.js';
import type { AdmissionRepository } from './admission-repository.js';
import { expectCode, expectRaceWinnerStored, expectRead, expectSame, expectSuccess, type ConformanceCase } from './conformance-case.js';
import type { GateRepository } from './gate-repository.js';
import type { Outbox, OutboxMessage } from './outbox.js';
import type { CurrentRevisions } from './current-revisions.js';
import type { ProjectId, RunCatalog } from './run-catalog.js';
import type { WorkflowRunRepository } from './workflow-run-repository.js';

// Shared suites that the in-memory and the database adapters of the SDLC
// ports both pass; each case expects a port with nothing stored.

// Fixtures come from fixed inputs, so a failure here is a defect of the suite.
function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const AT: Instant = must(parseInstant('2026-10-25T09:00:00.000Z'));
const LATER: Instant = must(parseInstant('2026-10-25T09:05:00.000Z'));

const DEFINITION = must(parseWorkflowDefinition({
  id: 'conformance-workflow',
  version: '1',
  stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));

const plainBinding = {
  pluginId: 'conformance-plugin',
  pluginVersion: '1.0.0',
  upstreamToolVersion: '2.0.0',
  workflowId: 'conformance-workflow',
  workflowVersion: '1',
  workflowDigest: `sha256:${'ee'.repeat(32)}`,
  configurationRevision: 'config-1',
  policyRevision: 'policy-1',
};
const BINDING = must(parseWorkflowRunBinding(plainBinding));

function run(id: string): WorkflowRun {
  return must(beginWorkflowRun({ id, binding: BINDING, definition: DEFINITION }, AT));
}

function revision(artifactId: string, fill: string): ArtifactRevision {
  return must(parseArtifactRevision({ artifactId, digest: `sha256:${fill.repeat(32)}`, nativeReference: `${artifactId}.md` }));
}

function admission(id: string, artifacts: readonly ArtifactRevision[]): TaskAdmission {
  const workItem = must(parseWorkItem({ id: 'change-1', nativeReference: 'changes/conformance' }));
  return must(admitPlanningTask({ id, taskId: `task-${id}`, stageId: 'specs', workItem }, run('admission-run'), artifacts, AT));
}

function dispatched(admitted: TaskAdmission): TaskAdmission {
  return must(useAdmission(admitted, admitted.generation, LATER, must(parseOwnershipGeneration(1))));
}

const CODE_HEAD: CodeHeadIdentity = Object.freeze({
  repository: must(parseIdentifier('RepositoryId', 'acme/project')) as RepositoryId,
  commit: '1'.repeat(40) as CodeObjectId,
  tree: 'a'.repeat(40) as CodeObjectId,
});

function gate(id: string): Gate {
  return must(openGate({ id, stageId: 'specs', requiredEvidence: 'semantic-approval', subject: [revision('spec', 'aa')] }, AT));
}

function headBoundGate(id: string): Gate {
  const subject = [revision('spec', 'aa')];
  return must(openGate({ id, stageId: 'apply', requiredEvidence: 'semantic-approval', subject, codeHead: CODE_HEAD }, AT));
}

function passed(pending: Gate): Gate {
  const evidence = must(parseSemanticApproval({
    approver: 'reviewer-1', verdict: 'approved', subject: pending.subject, recordedAt: LATER, reference: 'review-1',
    gateId: pending.id, gateGeneration: pending.generation,
    ...(pending.codeHead === undefined ? {} : { codeHead: pending.codeHead }),
  }));
  return must(recordGateEvidence(pending, pending.generation, evidence, LATER));
}

// The record a later writer would store over `record`.
function advanced<Stored extends { readonly generation: Generation }>(record: Stored): Stored {
  return { ...record, generation: nextGeneration(record.generation) };
}

function advancedRun(stored: WorkflowRun): WorkflowRun {
  return { ...stored, progress: { ...stored.progress, generation: nextGeneration(stored.progress.generation) } };
}

const MOMENTS: readonly Instant[] = ['2026-10-25T09:10:00.000Z', '2026-10-25T09:11:00.000Z'].map((text) => must(parseInstant(text)));

// Two records at one generation that a store must tell apart.
function rivals<Stored extends { readonly changedAt: Instant }>(record: Stored): readonly Stored[] {
  return MOMENTS.map((changedAt) => ({ ...record, changedAt }));
}

// Beyond 32 bits, so a store must keep the domain's safe-integer range.
const LARGE_GENERATION = must(parseGeneration(2 ** 31 + 7));

function message(eventId: string): OutboxMessage {
  const metadata = must(parseEventMetadata({
    eventId, eventType: 'sdlc.gate.passed', schemaVersion: 1, occurredAt: AT, correlationId: 'correlation-1',
  }));
  return { metadata, subject: 'sdlc.gates', payload: { gateId: 'specs-approval', nested: { list: [1, 'two'] } } };
}

export const ADMISSION_REPOSITORY_CONFORMANCE: readonly ConformanceCase<AdmissionRepository>[] = Object.freeze([
  {
    name: 'an added admission reads back as stored, and an unknown one is not found',
    async check(repository: AdmissionRepository) {
      const problems: string[] = [];
      const stored = dispatched(admission('admission-1', [revision('spec', 'aa')]));
      expectSuccess(problems, 'add', await repository.add(stored));
      expectRead(problems, 'get', await repository.get(stored.id), stored);
      expectCode(problems, 'get unknown', await repository.get(admission('admission-x', []).id), 'not-found');
      const large = { ...admission('admission-2', []), generation: LARGE_GENERATION };
      expectSuccess(problems, 'add large generation', await repository.add(large));
      expectRead(problems, 'get large generation', await repository.get(large.id), large);
      const unpaired = must(parseArtifactRevision({ artifactId: 'spec', digest: `sha256:${'dd'.repeat(32)}`, nativeReference: 'spec\uD800.md' }));
      const odd = admission('admission-3', [unpaired]);
      expectSuccess(problems, 'add unpaired surrogate', await repository.add(odd));
      expectRead(problems, 'get unpaired surrogate', await repository.get(odd.id), odd);
      return problems;
    },
  },
  {
    name: 'adding an admission twice is a conflict',
    async check(repository: AdmissionRepository) {
      const problems: string[] = [];
      const first = admission('admission-1', []);
      expectSuccess(problems, 'first add', await repository.add(first));
      expectCode(problems, 'second add', await repository.add(dispatched(first)), 'conflict');
      expectRead(problems, 'after conflict', await repository.get(first.id), first);
      return problems;
    },
  },
  {
    name: 'replace needs the stored generation and the next one, and keeps the record otherwise',
    async check(repository: AdmissionRepository) {
      const problems: string[] = [];
      const admitted = admission('admission-1', [revision('spec', 'aa')]);
      expectSuccess(problems, 'add', await repository.add(admitted));
      const used = dispatched(admitted);
      expectSuccess(problems, 'replace', await repository.replace(used, admitted.generation));
      expectCode(problems, 'stale replace', await repository.replace(dispatched(admitted), admitted.generation), 'conflict');
      expectCode(problems, 'unchanged generation', await repository.replace(used, used.generation), 'invalid');
      expectCode(problems, 'older generation', await repository.replace(admitted, used.generation), 'invalid');
      expectRead(problems, 'after rejected writes', await repository.get(admitted.id), used);
      expectCode(problems, 'replace unknown', await repository.replace(advanced(admission('admission-x', [])), admitted.generation), 'not-found');
      return problems;
    },
  },
  {
    name: 'of two concurrent replaces at one generation exactly one wins',
    async check(repository: AdmissionRepository) {
      const problems: string[] = [];
      const admitted = admission('admission-1', []);
      expectSuccess(problems, 'add', await repository.add(admitted));
      await expectRaceWinnerStored(problems, 'concurrent replace', rivals(dispatched(admitted)),
        (candidate) => repository.replace(candidate, admitted.generation), () => repository.get(admitted.id));
      return problems;
    },
  },
  {
    name: 'unused admissions are listed by a bound artifact',
    async check(repository: AdmissionRepository) {
      const problems: string[] = [];
      const bound = admission('admission-1', [revision('spec', 'aa'), revision('design', 'bb')]);
      const other = admission('admission-2', [revision('design', 'bb')]);
      const used = dispatched(admission('admission-3', [revision('spec', 'aa')]));
      for (const stored of [bound, other, used]) expectSuccess(problems, `add ${stored.id}`, await repository.add(stored));
      const listed = await repository.listUnusedBoundTo(revision('spec', 'cc').artifactId);
      expectSame(problems, 'listed', listed, [bound]);
      return problems;
    },
  },
]);

export const WORKFLOW_RUN_REPOSITORY_CONFORMANCE: readonly ConformanceCase<WorkflowRunRepository>[] = Object.freeze([
  {
    name: 'an added run reads back as stored, once',
    async check(repository: WorkflowRunRepository) {
      const problems: string[] = [];
      const stored = run('run-1');
      expectSuccess(problems, 'add', await repository.add(stored));
      expectCode(problems, 'second add', await repository.add(stored), 'conflict');
      expectRead(problems, 'get', await repository.get(stored.id), stored);
      expectCode(problems, 'get unknown', await repository.get(run('run-x').id), 'not-found');
      return problems;
    },
  },
  {
    name: 'replace needs the stored progress generation and the next one',
    async check(repository: WorkflowRunRepository) {
      const problems: string[] = [];
      const started = run('run-1');
      expectSuccess(problems, 'add', await repository.add(started));
      const progress = must(startStage(started.progress, started.progress.generation, DEFINITION.stages[0]!.id, [], LATER));
      const moved = { ...started, progress };
      expectSuccess(problems, 'replace', await repository.replace(moved, started.progress.generation));
      expectCode(problems, 'stale replace', await repository.replace(advancedRun(started), started.progress.generation), 'conflict');
      expectCode(problems, 'unchanged generation', await repository.replace(moved, progress.generation), 'invalid');
      expectRead(problems, 'after rejected writes', await repository.get(started.id), moved);
      expectCode(problems, 'replace unknown', await repository.replace(advancedRun(run('run-x')), started.progress.generation), 'not-found');
      const candidates = ['policy-2', 'policy-3'].map((policy) => {
        const next = advancedRun(moved);
        return { ...next, binding: { ...next.binding, policyRevision: must(parseWorkflowRunBinding({ ...plainBinding, policyRevision: policy })).policyRevision } };
      });
      await expectRaceWinnerStored(problems, 'concurrent replace', candidates,
        (candidate) => repository.replace(candidate, progress.generation), () => repository.get(started.id));
      return problems;
    },
  },
]);

export const GATE_REPOSITORY_CONFORMANCE: readonly ConformanceCase<GateRepository>[] = Object.freeze([
  {
    name: 'gates read back as stored and are listed by their run',
    async check(repository: GateRepository) {
      const problems: string[] = [];
      const [first, second] = [run('run-1'), run('run-2')];
      const decided = passed(gate('gate-1'));
      expectSuccess(problems, 'add decided', await repository.add(first.id, decided));
      expectSuccess(problems, 'add pending', await repository.add(first.id, gate('gate-2')));
      const headBound = passed(headBoundGate('gate-3'));
      expectSuccess(problems, 'add other run', await repository.add(second.id, headBound));
      expectCode(problems, 'second add', await repository.add(second.id, decided), 'conflict');
      expectRead(problems, 'get', await repository.get(decided.id), decided);
      expectRead(problems, 'get head-bound', await repository.get(headBound.id), headBound);
      expectCode(problems, 'get unknown', await repository.get(gate('gate-x').id), 'not-found');
      expectSame(problems, 'listed', await repository.listByRun(first.id), [decided, gate('gate-2')]);
      expectSame(problems, 'listed empty', await repository.listByRun(run('run-x').id), []);
      return problems;
    },
  },
  {
    name: 'replace needs the stored gate generation and the next one, and keeps its run',
    async check(repository: GateRepository) {
      const problems: string[] = [];
      const pending = gate('gate-1');
      expectSuccess(problems, 'add', await repository.add(run('run-1').id, pending));
      const decided = passed(pending);
      expectSuccess(problems, 'replace', await repository.replace(decided, pending.generation));
      expectCode(problems, 'stale replace', await repository.replace(advanced(pending), pending.generation), 'conflict');
      expectCode(problems, 'unchanged generation', await repository.replace(decided, decided.generation), 'invalid');
      expectCode(problems, 'replace unknown', await repository.replace(advanced(gate('gate-x')), pending.generation), 'not-found');
      expectSame(problems, 'listed', await repository.listByRun(run('run-1').id), [decided]);
      await expectRaceWinnerStored(problems, 'concurrent replace', rivals(advanced(decided)),
        (candidate) => repository.replace(candidate, decided.generation), () => repository.get(decided.id));
      return problems;
    },
  },
]);

// An outbox only appends; reading it back is the publisher's concern, so a
// test reads the adapter's own view of what it stored.
export interface OutboxConformanceTarget {
  readonly outbox: Outbox;
  stored(): Promise<readonly OutboxMessage[]>;
}

export const OUTBOX_CONFORMANCE: readonly ConformanceCase<OutboxConformanceTarget>[] = Object.freeze([
  {
    name: 'messages are stored under their event identity, once, in append order',
    async check({ outbox, stored }: OutboxConformanceTarget) {
      const problems: string[] = [];
      const [first, plain] = [message('event-1'), message('event-2')];
      const second = { ...plain, payload: { text: 'nul \u0000 and unpaired \uD800', zero: 0 } };
      expectSuccess(problems, 'first append', await outbox.append(first));
      expectSuccess(problems, 'second append', await outbox.append(second));
      expectCode(problems, 'repeated append', await outbox.append(first), 'conflict');
      expectSame(problems, 'stored', await stored(), [first, second]);
      return problems;
    },
  },
  {
    name: 'a payload that JSON cannot carry unchanged is rejected',
    async check({ outbox, stored }: OutboxConformanceTarget) {
      const problems: string[] = [];
      const base = message('event-1');
      const cycle: Record<string, unknown> = {};
      cycle.self = cycle;
      const payloads: unknown[] = [
        { count: Number.NaN }, { missing: undefined }, { at: new Date(0) }, { list: [Number.POSITIVE_INFINITY] },
        { zero: -0 }, { list: new Array(1) }, cycle,
      ];
      for (const [index, payload] of payloads.entries()) {
        const invalid = { ...base, payload } as unknown as OutboxMessage;
        expectCode(problems, `payload ${index + 1}`, await outbox.append(invalid), 'invalid');
      }
      expectSame(problems, 'stored', await stored(), []);
      return problems;
    },
  },
]);

// A catalog with the stores it describes: an envelope belongs to a stored
// run, and a binding to a stored admission.
export interface RunCatalogConformanceTarget {
  readonly runs: WorkflowRunRepository;
  readonly admissions: AdmissionRepository;
  readonly catalog: RunCatalog;
}

export const RUN_CATALOG_CONFORMANCE: readonly ConformanceCase<RunCatalogConformanceTarget>[] = Object.freeze([
  {
    name: 'a run is registered once with its project and creation time',
    async check({ runs, catalog }) {
      const problems: string[] = [];
      const stored = run('run-1');
      must(await runs.add(stored));
      const envelope = { runId: stored.id, projectId: must(parseIdentifier('ProjectId', 'project-1')) as ProjectId, createdAt: AT };
      expectRead(problems, 'unregistered', await catalog.envelope(stored.id), undefined);
      expectSuccess(problems, 'register', await catalog.register(envelope));
      expectCode(problems, 'register again', await catalog.register(envelope), 'conflict');
      expectRead(problems, 'envelope', await catalog.envelope(stored.id), envelope);
      return problems;
    },
  },
  {
    name: 'an admission is bound to one run',
    async check({ runs, admissions, catalog }) {
      const problems: string[] = [];
      const stored = run('run-1');
      must(await runs.add(stored));
      const bound = admission('admission-1', []);
      must(await admissions.add(bound));
      expectRead(problems, 'unbound', await catalog.runOfAdmission(bound.id), undefined);
      expectSuccess(problems, 'bind', await catalog.bindAdmission(bound.id, stored.id));
      expectCode(problems, 'bind again', await catalog.bindAdmission(bound.id, stored.id), 'conflict');
      expectRead(problems, 'run', await catalog.runOfAdmission(bound.id), stored.id);
      return problems;
    },
  },
]);

// Its cases store their runs first, as a run's revisions belong to it.
export interface CurrentRevisionsConformanceTarget {
  readonly runs: WorkflowRunRepository;
  readonly revisions: CurrentRevisions;
}

export const CURRENT_REVISIONS_CONFORMANCE: readonly ConformanceCase<CurrentRevisionsConformanceTarget>[] = Object.freeze([
  {
    name: 'the first revision seeded for an artifact of a run stays current',
    async check({ runs, revisions }) {
      const problems: string[] = [];
      const first = run('run-1');
      const second = run('run-2');
      must(await runs.add(first));
      must(await runs.add(second));
      const spec = revision('spec', 'aa');
      const ids = [spec.artifactId, revision('design', 'bb').artifactId];
      expectRead(problems, 'empty', await revisions.current(first.id, ids), []);
      expectSuccess(problems, 'seed', await revisions.seed(first.id, [spec]));
      expectSuccess(problems, 'seed another', await revisions.seed(first.id, [revision('spec', 'cc'), revision('design', 'bb')]));
      expectSuccess(problems, 'seed nothing', await revisions.seed(first.id, []));
      const current = must(await revisions.current(first.id, ids));
      expectSame(problems, 'current', [...current].sort((a, b) => a.artifactId.localeCompare(b.artifactId)), [revision('design', 'bb'), spec]);
      expectRead(problems, 'other run', await revisions.current(second.id, ids), []);
      expectRead(problems, 'no ids', await revisions.current(first.id, []), []);
      return problems;
    },
  },
]);
