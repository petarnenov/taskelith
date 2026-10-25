import { parseEventMetadata, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { parseArtifactRevision, type ArtifactRevision } from '../domain/artifact-revision.js';
import { openGate, recordGateEvidence, type Gate } from '../domain/gate.js';
import { parseSemanticApproval } from '../domain/gate-evidence.js';
import { nextGeneration } from '../domain/generation.js';
import { parseOwnershipGeneration } from '../domain/ownership-generation.js';
import { startStage } from '../domain/stage-progress.js';
import { admitPlanningTask, useAdmission, type TaskAdmission } from '../domain/task-admission.js';
import { parseWorkItem } from '../domain/work-item.js';
import { parseWorkflowDefinition } from '../domain/workflow-definition.js';
import { beginWorkflowRun, type WorkflowRun } from '../domain/workflow-run.js';
import { parseWorkflowRunBinding } from '../domain/workflow-run-binding.js';
import type { AdmissionRepository } from './admission-repository.js';
import { expectCode, expectSame, expectSuccess, type ConformanceCase } from './conformance-case.js';
import type { GateRepository } from './gate-repository.js';
import type { Outbox, OutboxMessage } from './outbox.js';
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

const BINDING = must(parseWorkflowRunBinding({
  pluginId: 'conformance-plugin',
  pluginVersion: '1.0.0',
  upstreamToolVersion: '2.0.0',
  workflowId: 'conformance-workflow',
  workflowVersion: '1',
  workflowDigest: `sha256:${'ee'.repeat(32)}`,
  configurationRevision: 'config-1',
  policyRevision: 'policy-1',
}));

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

function gate(id: string): Gate {
  return must(openGate({ id, stageId: 'specs', requiredEvidence: 'semantic-approval', subject: [revision('spec', 'aa')] }, AT));
}

function passed(pending: Gate): Gate {
  const evidence = must(parseSemanticApproval({
    approver: 'reviewer-1', verdict: 'approved', subject: pending.subject, recordedAt: LATER, reference: 'review-1',
  }));
  return must(recordGateEvidence(pending, pending.generation, evidence, LATER));
}

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
      const read = await repository.get(stored.id);
      expectSuccess(problems, 'get', read);
      if (read.ok) expectSame(problems, 'get', read.value, stored);
      expectCode(problems, 'get unknown', await repository.get(admission('admission-x', []).id), 'not-found');
      return problems;
    },
  },
  {
    name: 'adding an admission twice is a conflict',
    async check(repository: AdmissionRepository) {
      const problems: string[] = [];
      const first = admission('admission-1', []);
      expectSuccess(problems, 'first add', await repository.add(first));
      expectCode(problems, 'second add', await repository.add(first), 'conflict');
      return problems;
    },
  },
  {
    name: 'replace compares the stored generation and keeps the record on a conflict',
    async check(repository: AdmissionRepository) {
      const problems: string[] = [];
      const admitted = admission('admission-1', [revision('spec', 'aa')]);
      expectSuccess(problems, 'add', await repository.add(admitted));
      const used = dispatched(admitted);
      expectSuccess(problems, 'replace', await repository.replace(used, admitted.generation));
      expectCode(problems, 'stale replace', await repository.replace(admitted, admitted.generation), 'conflict');
      const read = await repository.get(admitted.id);
      if (read.ok) expectSame(problems, 'after conflict', read.value, used);
      expectCode(problems, 'replace unknown', await repository.replace(admission('admission-x', []), admitted.generation), 'not-found');
      return problems;
    },
  },
  {
    name: 'of two concurrent replaces at one generation exactly one wins',
    async check(repository: AdmissionRepository) {
      const problems: string[] = [];
      const admitted = admission('admission-1', []);
      expectSuccess(problems, 'add', await repository.add(admitted));
      const results = await Promise.all([1, 2].map(() => repository.replace(dispatched(admitted), admitted.generation)));
      const wins = results.filter((result) => result.ok).length;
      if (wins !== 1) problems.push(`concurrent replace: expected one success, got ${wins}`);
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
      expectSame(problems, 'listed', listed.map((item) => item.id), [bound.id]);
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
      const read = await repository.get(stored.id);
      expectSuccess(problems, 'get', read);
      if (read.ok) expectSame(problems, 'get', read.value, stored);
      expectCode(problems, 'get unknown', await repository.get(run('run-x').id), 'not-found');
      return problems;
    },
  },
  {
    name: 'replace compares the progress generation',
    async check(repository: WorkflowRunRepository) {
      const problems: string[] = [];
      const started = run('run-1');
      expectSuccess(problems, 'add', await repository.add(started));
      const progress = must(startStage(started.progress, started.progress.generation, DEFINITION.stages[0]!.id, [], LATER));
      const advanced = { ...started, progress };
      expectSuccess(problems, 'replace', await repository.replace(advanced, started.progress.generation));
      expectCode(problems, 'stale replace', await repository.replace(started, started.progress.generation), 'conflict');
      const read = await repository.get(started.id);
      if (read.ok) expectSame(problems, 'after conflict', read.value, advanced);
      expectCode(problems, 'replace unknown', await repository.replace(run('run-x'), started.progress.generation), 'not-found');
      const next = { ...advanced, progress: { ...progress, generation: nextGeneration(progress.generation) } };
      const results = await Promise.all([1, 2].map(() => repository.replace(next, progress.generation)));
      if (results.filter((result) => result.ok).length !== 1) problems.push('concurrent replace: expected one success');
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
      expectSuccess(problems, 'add other run', await repository.add(second.id, gate('gate-3')));
      expectCode(problems, 'second add', await repository.add(second.id, decided), 'conflict');
      const read = await repository.get(decided.id);
      if (read.ok) expectSame(problems, 'get', read.value, decided);
      else problems.push(`get: ${read.error.message}`);
      expectCode(problems, 'get unknown', await repository.get(gate('gate-x').id), 'not-found');
      const listed = (await repository.listByRun(first.id)).map((item) => item.id).sort();
      expectSame(problems, 'listed', listed, ['gate-1', 'gate-2']);
      expectSame(problems, 'listed empty', await repository.listByRun(run('run-x').id), []);
      return problems;
    },
  },
  {
    name: 'replace compares the gate generation and keeps its run',
    async check(repository: GateRepository) {
      const problems: string[] = [];
      const pending = gate('gate-1');
      expectSuccess(problems, 'add', await repository.add(run('run-1').id, pending));
      const decided = passed(pending);
      expectSuccess(problems, 'replace', await repository.replace(decided, pending.generation));
      expectCode(problems, 'stale replace', await repository.replace(pending, pending.generation), 'conflict');
      expectCode(problems, 'replace unknown', await repository.replace(gate('gate-x'), pending.generation), 'not-found');
      expectSame(problems, 'listed', await repository.listByRun(run('run-1').id), [decided]);
      const next = { ...decided, generation: nextGeneration(decided.generation) };
      const results = await Promise.all([1, 2].map(() => repository.replace(next, decided.generation)));
      if (results.filter((result) => result.ok).length !== 1) problems.push('concurrent replace: expected one success');
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
    name: 'messages are stored in order under their event identity, once',
    async check({ outbox, stored }: OutboxConformanceTarget) {
      const problems: string[] = [];
      const [first, second] = [message('event-1'), message('event-2')];
      expectSuccess(problems, 'first append', await outbox.append(first));
      expectSuccess(problems, 'second append', await outbox.append(second));
      expectCode(problems, 'repeated append', await outbox.append(first), 'conflict');
      expectSame(problems, 'stored', await stored(), [first, second]);
      return problems;
    },
  },
]);
