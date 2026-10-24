import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import {
  InMemoryAdmissionRepository,
  TaskAdmissionService,
  beginWorkflowProgress,
  openGate,
  parseArtifactRevision,
  parseGeneration,
  parseSemanticApproval,
  parseWorkItem,
  parseWorkflowDefinition,
  parseWorkflowRunBinding,
  recordGateEvidence,
  type AdmissionId,
  type AdmissionRepository,
  type ArtifactRevision,
  type Clock,
  type Gate,
  type Generation,
  type RunContext,
  type TaskAdmission,
} from '@taskelith/sdlc';

function instant(text: string): Instant {
  const result = parseInstant(text);
  assert.ok(result.ok);
  return result.value;
}

function generation(value: number): Generation {
  const result = parseGeneration(value);
  assert.ok(result.ok);
  return result.value;
}

function admissionId(text: string): AdmissionId {
  const result = parseIdentifier('AdmissionId', text);
  assert.ok(result.ok);
  return result.value;
}

const NOW = instant('2026-10-24T10:00:00.000Z');
const FIXED_CLOCK: Clock = { now: () => NOW };

function revision(artifactId: string, fill: string): ArtifactRevision {
  const result = parseArtifactRevision({ artifactId, digest: `sha256:${fill.repeat(32)}`, nativeReference: `${artifactId}.md` });
  assert.ok(result.ok);
  return result.value;
}

const SPEC = revision('spec', 'aa');
const NEW_SPEC = revision('spec', 'bb');

const WORK_ITEM = (() => {
  const result = parseWorkItem({ id: 'change-1', nativeReference: 'changes/add-feature' });
  assert.ok(result.ok);
  return result.value;
})();

const RUN: RunContext = (() => {
  const definition = parseWorkflowDefinition({
    id: 'example-workflow',
    version: '1',
    stages: [
      { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
    ],
  });
  assert.ok(definition.ok);
  const binding = parseWorkflowRunBinding({
    pluginId: 'example-plugin',
    pluginVersion: '1.0.0',
    upstreamToolVersion: '2.0.0',
    workflowId: 'example-workflow',
    workflowVersion: '1',
    workflowDigest: `sha256:${'ee'.repeat(32)}`,
    configurationRevision: 'config-1',
    policyRevision: 'policy-7',
  });
  assert.ok(binding.ok);
  return { binding: binding.value, progress: beginWorkflowProgress(definition.value, NOW) };
})();

function passedSpecsGate(subject: ArtifactRevision): Gate {
  const pending = openGate({ id: 'specs-approval', stageId: 'specs', requiredEvidence: 'semantic-approval', subject: [subject] }, NOW);
  assert.ok(pending.ok);
  const evidence = parseSemanticApproval({ approver: 'reviewer-1', verdict: 'approved', subject: [subject], recordedAt: NOW, reference: 'review' });
  assert.ok(evidence.ok);
  const result = recordGateEvidence(pending.value, pending.value.generation, evidence.value, NOW);
  assert.ok(result.ok);
  return result.value;
}

function implementationRequest(id: string) {
  return { id, taskId: `task-${id}`, stageId: 'apply', workItem: WORK_ITEM };
}

function value<T>(result: Result<T>): T {
  assert.ok(result.ok, result.ok ? '' : result.error.message);
  return result.value;
}

function code<T>(result: Result<T>): string {
  assert.equal(result.ok, false);
  return result.ok ? '' : result.error.code;
}

test('a planning task creates the missing specification, and implementation is admitted only when bound to it', async () => {
  const repository = new InMemoryAdmissionRepository();
  const service = new TaskAdmissionService(repository, FIXED_CLOCK);

  const planning = value(await service.admitPlanningTask({ id: 'plan', taskId: 'task-plan', stageId: 'specs' }, RUN, []));
  const dispatched = value(await service.useAdmission(planning.id, planning.generation));
  const created = value(await service.recordCreatedRevision(dispatched.id, dispatched.generation, SPEC));
  const context = { ...RUN, gates: [passedSpecsGate(SPEC)] };
  const unbound = await service.admitImplementationTask({ id: 'unbound', taskId: 'task-unbound', stageId: 'apply' }, context);
  const implementation = value(await service.admitImplementationTask(implementationRequest('implement'), context));

  assert.deepEqual(created.admission.createdRevisions, [SPEC]);
  assert.deepEqual(created.invalidated, []);
  assert.equal(code(unbound), 'precondition-failed');
  assert.equal(code(await repository.get(admissionId('unbound'))), 'not-found');
  assert.deepEqual(implementation.artifacts, [SPEC]);
  assert.equal(implementation.workItemId, 'change-1');
  assert.deepEqual(value(await repository.get(implementation.id)), implementation);
});

test('a created revision invalidates the unused admissions bound to the revision it replaces', async () => {
  const repository = new InMemoryAdmissionRepository();
  const service = new TaskAdmissionService(repository, FIXED_CLOCK);
  const context = { ...RUN, gates: [passedSpecsGate(SPEC)] };
  const unused = value(await service.admitImplementationTask(implementationRequest('unused'), context));
  const started = value(await service.admitImplementationTask(implementationRequest('started'), context));
  value(await service.useAdmission(started.id, started.generation));
  const planning = value(await service.admitPlanningTask({ id: 'plan', taskId: 'task-plan', stageId: 'specs' }, RUN, [SPEC]));
  const dispatched = value(await service.useAdmission(planning.id, planning.generation));

  const outcome = value(await service.recordCreatedRevision(dispatched.id, dispatched.generation, NEW_SPEC));

  assert.deepEqual(outcome.invalidated.map((admission) => admission.id), ['unused']);
  assert.equal(value(await repository.get(unused.id)).state, 'invalidated');
  assert.equal(value(await repository.get(unused.id)).invalidatedBy, NEW_SPEC);
  assert.equal(value(await repository.get(started.id)).state, 'used');
  assert.equal(value(await repository.get(planning.id)).state, 'used');
  assert.deepEqual(value(await service.invalidateOutdatedAdmissions(NEW_SPEC)), []);
});

test('an admission identifier is used once', async () => {
  const service = new TaskAdmissionService(new InMemoryAdmissionRepository(), FIXED_CLOCK);
  const request = { id: 'plan', taskId: 'task-plan', stageId: 'specs' };
  value(await service.admitPlanningTask(request, RUN, []));

  assert.equal(code(await service.admitPlanningTask(request, RUN, [])), 'conflict');
});

test('changing an admission fails when it is unknown, outdated, or not allowed', async () => {
  const service = new TaskAdmissionService(new InMemoryAdmissionRepository(), FIXED_CLOCK);
  const planning = value(await service.admitPlanningTask({ id: 'plan', taskId: 'task-plan', stageId: 'specs' }, RUN, []));

  assert.equal(code(await service.useAdmission(admissionId('unknown'), generation(1))), 'not-found');
  assert.equal(code(await service.recordCreatedRevision(admissionId('unknown'), generation(1), SPEC)), 'not-found');
  assert.equal(code(await service.useAdmission(planning.id, generation(2))), 'conflict');
  assert.equal(code(await service.recordCreatedRevision(planning.id, planning.generation, SPEC)), 'precondition-failed');
});

test('the in-memory repository replaces a record only at the expected generation', async () => {
  const repository = new InMemoryAdmissionRepository();
  const service = new TaskAdmissionService(repository, FIXED_CLOCK);
  const planning = value(await service.admitPlanningTask({ id: 'plan', taskId: 'task-plan', stageId: 'specs' }, RUN, []));
  const unknown: TaskAdmission = { ...planning, id: admissionId('unknown') };

  assert.equal(code(await repository.replace(planning, generation(2))), 'conflict');
  assert.equal(code(await repository.replace(unknown, generation(1))), 'not-found');
});

// Delegates to the repository, except that the replace after the given number
// of successful ones fails as if another writer had changed the record.
function racing(repository: AdmissionRepository, successfulReplaces: number): AdmissionRepository {
  let remaining = successfulReplaces;
  let raced = false;
  return {
    get: (id) => repository.get(id),
    add: (admission) => repository.add(admission),
    listUnusedBoundTo: (artifactId) => repository.listUnusedBoundTo(artifactId),
    replace: async (admission, expected) => {
      if (remaining-- > 0 || raced) return repository.replace(admission, expected);
      raced = true;
      return err(failure('conflict', 'changed concurrently'));
    },
  };
}

test('a concurrent change stops invalidation, and running it again invalidates the rest', async () => {
  const repository = new InMemoryAdmissionRepository();
  const context = { ...RUN, gates: [passedSpecsGate(SPEC)] };
  const setup = new TaskAdmissionService(repository, FIXED_CLOCK);
  value(await setup.admitImplementationTask(implementationRequest('first'), context));
  value(await setup.admitImplementationTask(implementationRequest('second'), context));
  const service = new TaskAdmissionService(racing(repository, 0), FIXED_CLOCK);

  assert.equal(code(await service.invalidateOutdatedAdmissions(NEW_SPEC)), 'conflict');
  assert.equal(value(await service.invalidateOutdatedAdmissions(NEW_SPEC)).length, 2);
});

test('a concurrent change during invalidation leaves the created revision unrecorded until the call is repeated', async () => {
  const repository = new InMemoryAdmissionRepository();
  const setup = new TaskAdmissionService(repository, FIXED_CLOCK);
  const implementation = value(await setup.admitImplementationTask(implementationRequest('implement'), { ...RUN, gates: [passedSpecsGate(SPEC)] }));
  const planning = value(await setup.admitPlanningTask({ id: 'plan', taskId: 'task-plan', stageId: 'specs' }, RUN, []));
  const dispatched = value(await setup.useAdmission(planning.id, planning.generation));

  const raced = await new TaskAdmissionService(racing(repository, 0), FIXED_CLOCK).recordCreatedRevision(dispatched.id, dispatched.generation, NEW_SPEC);

  assert.equal(code(raced), 'conflict');
  assert.deepEqual(value(await repository.get(dispatched.id)), dispatched);
  const repeated = value(await setup.recordCreatedRevision(dispatched.id, dispatched.generation, NEW_SPEC));
  assert.deepEqual(repeated.admission.createdRevisions, [NEW_SPEC]);
  assert.deepEqual(repeated.invalidated.map((admission) => admission.id), [implementation.id]);
});

test('a concurrent change fails storing a created revision or using an admission', async () => {
  const repository = new InMemoryAdmissionRepository();
  const setup = new TaskAdmissionService(repository, FIXED_CLOCK);
  const implementation = value(await setup.admitImplementationTask(implementationRequest('implement'), { ...RUN, gates: [passedSpecsGate(SPEC)] }));
  const planning = value(await setup.admitPlanningTask({ id: 'plan', taskId: 'task-plan', stageId: 'specs' }, RUN, []));
  const dispatched = value(await setup.useAdmission(planning.id, planning.generation));
  const other = value(await setup.admitPlanningTask({ id: 'other', taskId: 'task-other', stageId: 'specs' }, RUN, []));

  const recorded = await new TaskAdmissionService(racing(repository, 1), FIXED_CLOCK).recordCreatedRevision(dispatched.id, dispatched.generation, NEW_SPEC);
  const usedConcurrently = await new TaskAdmissionService(racing(repository, 0), FIXED_CLOCK).useAdmission(other.id, other.generation);

  assert.equal(code(recorded), 'conflict');
  assert.equal(value(await repository.get(implementation.id)).state, 'invalidated');
  assert.deepEqual(value(await repository.get(dispatched.id)).createdRevisions, []);
  assert.equal(code(usedConcurrently), 'conflict');
  assert.equal(value(await repository.get(other.id)).state, 'admitted');
});
