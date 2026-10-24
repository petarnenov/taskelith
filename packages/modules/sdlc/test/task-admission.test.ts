import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstant, type Instant } from '@taskelith/kernel';
import {
  ADMISSION_STATES,
  ADMISSION_TRANSITIONS,
  admitImplementationTask,
  admitPlanningTask,
  beginWorkflowProgress,
  invalidateAdmission,
  isAdmissionOutdatedBy,
  markGateStale,
  openGate,
  parseArtifactRevision,
  parseGeneration,
  parseSemanticApproval,
  parseWorkItem,
  parseWorkflowDefinition,
  parseWorkflowRunBinding,
  recordCreatedRevision,
  recordGateEvidence,
  useAdmission,
  type AdmissionState,
  type ArtifactRevision,
  type Gate,
  type GatedRunContext,
  type Generation,
  type RunContext,
  type TaskAdmission,
  type WorkflowDefinitionInput,
  type WorkItem,
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

const OPENED_AT = instant('2026-10-24T09:00:00.000Z');
const ADMITTED_AT = instant('2026-10-24T10:00:00.000Z');
const LATER = instant('2026-10-24T11:00:00.000Z');

function revision(artifactId: string, fill: string, nativeReference = `${artifactId}.md`): ArtifactRevision {
  const result = parseArtifactRevision({ artifactId, digest: `sha256:${fill.repeat(32)}`, nativeReference });
  assert.ok(result.ok);
  return result.value;
}

const SPEC = revision('spec', 'aa');
const DESIGN = revision('design', 'bb');
const NEW_SPEC = revision('spec', 'cc');

const WORK_ITEM: WorkItem = (() => {
  const result = parseWorkItem({ id: 'change-1', nativeReference: 'changes/add-feature' });
  assert.ok(result.ok);
  return result.value;
})();

const WORKFLOW: WorkflowDefinitionInput = {
  id: 'example-workflow',
  version: '1',
  stages: [
    { id: 'proposal', obligations: ['intake'], origin: 'native', dependsOn: [] },
    { id: 'specs', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
    { id: 'design', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
    { id: 'apply', obligations: ['implementation', 'verification'], origin: 'native', dependsOn: ['specs', 'design'] },
    { id: 'check', obligations: ['review', 'closure'], origin: 'platform-managed', dependsOn: ['apply'] },
  ],
};

function runContext(workflow: WorkflowDefinitionInput = WORKFLOW, bindingVersion = '1'): RunContext {
  const definition = parseWorkflowDefinition(workflow);
  assert.ok(definition.ok);
  const binding = parseWorkflowRunBinding({
    pluginId: 'example-plugin',
    pluginVersion: '1.0.0',
    upstreamToolVersion: '2.0.0',
    workflowId: 'example-workflow',
    workflowVersion: bindingVersion,
    workflowDigest: `sha256:${'ee'.repeat(32)}`,
    configurationRevision: 'config-1',
    policyRevision: 'policy-7',
  });
  assert.ok(binding.ok);
  return { binding: binding.value, progress: beginWorkflowProgress(definition.value, OPENED_AT) };
}

function pendingGate(stage: string, subject: readonly ArtifactRevision[]): Gate {
  const result = openGate({ id: `${stage}-approval`, stageId: stage, requiredEvidence: 'semantic-approval', subject }, OPENED_AT);
  assert.ok(result.ok);
  return result.value;
}

function passedGate(stage: string, subject: readonly ArtifactRevision[]): Gate {
  const pending = pendingGate(stage, subject);
  const evidence = parseSemanticApproval({ approver: 'reviewer-1', verdict: 'approved', subject, recordedAt: OPENED_AT, reference: 'review' });
  assert.ok(evidence.ok);
  const result = recordGateEvidence(pending, pending.generation, evidence.value, OPENED_AT);
  assert.ok(result.ok);
  return result.value;
}

function gatedContext(gates: readonly Gate[] = [passedGate('specs', [SPEC]), passedGate('design', [SPEC, DESIGN])]): GatedRunContext {
  return { ...runContext(), gates };
}

const IMPLEMENTATION = { id: 'admission-1', taskId: 'task-1', stageId: 'apply', workItem: WORK_ITEM };
const PLANNING = { id: 'admission-2', taskId: 'task-2', stageId: 'specs' };

function implementationAdmission(): TaskAdmission {
  const result = admitImplementationTask(IMPLEMENTATION, gatedContext(), ADMITTED_AT);
  assert.ok(result.ok);
  return result.value;
}

function planningAdmission(artifacts: readonly ArtifactRevision[] = []): TaskAdmission {
  const result = admitPlanningTask(PLANNING, runContext(), artifacts, ADMITTED_AT);
  assert.ok(result.ok);
  return result.value;
}

function used(admission: TaskAdmission): TaskAdmission {
  const result = useAdmission(admission, admission.generation, LATER);
  assert.ok(result.ok);
  return result.value;
}

function inState(state: AdmissionState): TaskAdmission {
  const admitted = implementationAdmission();
  if (state === 'admitted') return admitted;
  if (state === 'used') return used(admitted);
  const result = invalidateAdmission(admitted, admitted.generation, NEW_SPEC, LATER);
  assert.ok(result.ok);
  return result.value;
}

function assertRejected(result: { ok: boolean; error?: { code: string; details: Readonly<Record<string, string>> } }, code: string): Readonly<Record<string, string>> {
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, code);
  return result.error!.details;
}

test('an implementation task bound to a work item is admitted once its prerequisite stages have passed', () => {
  const admission = implementationAdmission();

  assert.deepEqual(
    { ...admission },
    {
      id: 'admission-1',
      taskId: 'task-1',
      kind: 'implementation',
      workflowId: 'example-workflow',
      workflowVersion: '1',
      stageId: 'apply',
      workItemId: 'change-1',
      artifacts: [SPEC, DESIGN],
      policyRevision: 'policy-7',
      createdRevisions: [],
      state: 'admitted',
      generation: 1,
      changedAt: ADMITTED_AT,
    },
  );
  assert.ok(Object.isFrozen(admission));
  assert.ok(Object.isFrozen(admission.artifacts));
  assert.ok(Object.isFrozen(admission.createdRevisions));
});

test('an implementation task without a work item is rejected', () => {
  const result = admitImplementationTask({ id: 'admission-1', taskId: 'task-1', stageId: 'apply' }, gatedContext(), ADMITTED_AT);

  const details = assertRejected(result, 'precondition-failed');
  assert.equal(details.admission, 'admission-1');
  assert.match(result.ok ? '' : result.error.message, /work item/);
});

test('an implementation task is rejected while a prerequisite stage has not passed', () => {
  const cases: readonly (readonly Gate[])[] = [
    [passedGate('specs', [SPEC]), pendingGate('design', [DESIGN])],
    [passedGate('specs', [SPEC])],
    [passedGate('specs', [SPEC]), staleGate()],
  ];
  for (const gates of cases) {
    const details = assertRejected(admitImplementationTask(IMPLEMENTATION, gatedContext(gates), ADMITTED_AT), 'precondition-failed');
    assert.equal(details.dependencies, 'design');
    assert.equal(details.stage, 'apply');
  }
});

function staleGate(): Gate {
  const passed = passedGate('design', [DESIGN]);
  const result = markGateStale(passed, passed.generation, revision('design', 'dd'), LATER);
  assert.ok(result.ok);
  return result.value;
}

test('an implementation stage without prerequisite stages admits no task', () => {
  const workflow: WorkflowDefinitionInput = {
    id: 'example-workflow',
    version: '1',
    stages: [{ id: 'all', obligations: ['intake', 'specification', 'implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: [] }],
  };
  const result = admitImplementationTask({ ...IMPLEMENTATION, stageId: 'all' }, { ...runContext(workflow), gates: [] }, ADMITTED_AT);

  assert.equal(assertRejected(result, 'precondition-failed').stage, 'all');
});

test('prerequisite gates that judged different revisions of one artifact admit no task', () => {
  const gates = [passedGate('specs', [SPEC]), passedGate('design', [NEW_SPEC, DESIGN])];

  const details = assertRejected(admitImplementationTask(IMPLEMENTATION, gatedContext(gates), ADMITTED_AT), 'precondition-failed');

  assert.equal(details.artifact, 'spec');
});

test('a task is admitted only to a stage of its kind', () => {
  const cases = [
    admitImplementationTask({ ...IMPLEMENTATION, stageId: 'specs' }, gatedContext(), ADMITTED_AT),
    admitPlanningTask({ ...PLANNING, stageId: 'apply' }, runContext(), [], ADMITTED_AT),
    admitPlanningTask({ ...PLANNING, stageId: 'check' }, runContext(), [], ADMITTED_AT),
  ];
  for (const result of cases) assertRejected(result, 'precondition-failed');
});

test('a request names a stage of the workflow the run is bound to', () => {
  assert.equal(assertRejected(admitPlanningTask({ ...PLANNING, stageId: 'unknown' }, runContext(), [], ADMITTED_AT), 'not-found').stage, 'unknown');
  assertRejected(admitPlanningTask(PLANNING, runContext(WORKFLOW, '2'), [], ADMITTED_AT), 'precondition-failed');
});

test('a request with an invalid identifier is rejected with the field', () => {
  const fields = [
    ['id', { ...PLANNING, id: '' }],
    ['taskId', { ...PLANNING, taskId: '' }],
    ['stageId', { ...PLANNING, stageId: '' }],
  ] as const;
  for (const [field, request] of fields) {
    assert.equal(assertRejected(admitPlanningTask(request, runContext(), [], ADMITTED_AT), 'invalid').field, field);
  }
});

test('a planning task is admitted without a specification or a work item', () => {
  const admission = planningAdmission();

  assert.equal(admission.kind, 'planning');
  assert.equal(admission.stageId, 'specs');
  assert.equal(admission.workItemId, undefined);
  assert.deepEqual(admission.artifacts, []);
  assert.equal(admission.policyRevision, 'policy-7');
});

test('a planning task is bound to the revisions it starts from, at most one per artifact', () => {
  const artifacts = [SPEC];
  const admission = planningAdmission(artifacts);
  artifacts.push(DESIGN);

  assert.deepEqual(admission.artifacts, [SPEC]);
  assert.equal(assertRejected(admitPlanningTask(PLANNING, runContext(), [SPEC, NEW_SPEC], ADMITTED_AT), 'invalid').field, 'artifacts');
});

test('a dispatched planning task records the specification it created', () => {
  const dispatched = used(planningAdmission());

  const result = recordCreatedRevision(dispatched, dispatched.generation, SPEC, LATER);

  assert.ok(result.ok);
  assert.deepEqual(result.value.createdRevisions, [SPEC]);
  assert.equal(result.value.state, 'used');
  assert.equal(result.value.generation, 3);
  assert.equal(result.value.changedAt, LATER);
  assert.ok(Object.isFrozen(result.value.createdRevisions));
});

test('only a dispatched planning admission at the read generation records created revisions', () => {
  const planning = planningAdmission();
  const implementation = used(implementationAdmission());
  const dispatched = used(planning);

  assert.equal(assertRejected(recordCreatedRevision(planning, planning.generation, SPEC, LATER), 'precondition-failed').state, 'admitted');
  assertRejected(recordCreatedRevision(implementation, implementation.generation, SPEC, LATER), 'precondition-failed');
  assertRejected(recordCreatedRevision(dispatched, generation(1), SPEC, LATER), 'conflict');
});

test('every admission transition is checked against the table', () => {
  for (const from of ADMISSION_STATES) {
    for (const to of ['used', 'invalidated'] as const) {
      const admission = inState(from);
      const result = to === 'used'
        ? useAdmission(admission, admission.generation, LATER)
        : invalidateAdmission(admission, admission.generation, NEW_SPEC, LATER);
      if (ADMISSION_TRANSITIONS[from].includes(to)) {
        assert.ok(result.ok, `${from} -> ${to}`);
        assert.equal(result.value.state, to);
      } else {
        assert.deepEqual(assertRejected(result, 'precondition-failed'), { admission: 'admission-1', from, to });
      }
    }
  }
});

test('a different revision of a bound artifact outdates an unused admission', () => {
  const admission = implementationAdmission();

  const result = invalidateAdmission(admission, admission.generation, NEW_SPEC, LATER);

  assert.ok(result.ok);
  assert.equal(result.value.state, 'invalidated');
  assert.equal(result.value.invalidatedBy, NEW_SPEC);
  assert.equal(result.value.generation, 2);
});

test('the same content read elsewhere or another artifact does not outdate an admission', () => {
  const admission = implementationAdmission();

  for (const other of [revision('spec', 'aa', 'elsewhere/spec.md'), revision('tasks', 'cc')]) {
    assert.equal(isAdmissionOutdatedBy(admission, other), false);
    assertRejected(invalidateAdmission(admission, admission.generation, other, LATER), 'precondition-failed');
  }
});

test('an outdated generation is rejected before any other rule', () => {
  const invalidated = inState('invalidated');

  assertRejected(useAdmission(invalidated, generation(1), LATER), 'conflict');
  assertRejected(invalidateAdmission(invalidated, generation(1), NEW_SPEC, LATER), 'conflict');
});

test('admission rules are deterministic', () => {
  assert.deepEqual(implementationAdmission(), implementationAdmission());
});
