import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkHttpSchema, checkMessageSchema, type SchemaViolations } from '@taskelith/contracts';
import { parseInstant, type Instant, type Result } from '@taskelith/kernel';
import {
  admitPlanningTask,
  beginWorkflowProgress,
  openGate,
  parseArtifactRevision,
  parseSemanticApproval,
  parseWorkflowDefinition,
  parseWorkflowRunBinding,
  recordGateEvidence,
  type ArtifactRevision,
} from '@taskelith/sdlc';

function document(name: string): { components: { schemas: Record<string, unknown> } } {
  return JSON.parse(readFileSync(new URL(`../documents/${name}`, import.meta.url), 'utf8'));
}

function instant(text: string): Instant {
  const result = parseInstant(text);
  assert.ok(result.ok);
  return result.value;
}

function violations<T>(result: Result<T, SchemaViolations>): SchemaViolations {
  assert.equal(result.ok, false);
  return result.ok ? [] : result.error;
}

const AT = instant('2026-10-24T10:00:00.000Z');
const DIGEST = `sha256:${'ab'.repeat(32)}`;

const SPEC: ArtifactRevision = (() => {
  const result = parseArtifactRevision({ artifactId: 'spec', digest: DIGEST, nativeReference: 'specs/spec.md' });
  assert.ok(result.ok);
  return result.value;
})();

const BINDING = {
  pluginId: 'example-plugin',
  pluginVersion: '1.0.0',
  upstreamToolVersion: '2.0.0',
  workflowId: 'example-workflow',
  workflowVersion: '1',
  workflowDigest: `sha256:${'ee'.repeat(32)}`,
  configurationRevision: 'config-1',
  policyRevision: 'policy-7',
};

function admission() {
  const definition = parseWorkflowDefinition({
    id: 'example-workflow',
    version: '1',
    stages: [
      { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
    ],
  });
  assert.ok(definition.ok);
  const binding = parseWorkflowRunBinding(BINDING);
  assert.ok(binding.ok);
  const result = admitPlanningTask(
    { id: 'admission-1', taskId: 'task-1', stageId: 'specs' },
    { binding: binding.value, progress: beginWorkflowProgress(definition.value, AT) },
    [SPEC],
    AT,
  );
  assert.ok(result.ok);
  return result.value;
}

function decidedGate() {
  const pending = openGate({ id: 'specs-approval', stageId: 'specs', requiredEvidence: 'semantic-approval', subject: [SPEC] }, AT);
  assert.ok(pending.ok);
  const evidence = parseSemanticApproval({ approver: 'reviewer-1', verdict: 'approved', subject: [SPEC], recordedAt: AT, reference: 'review-1' });
  assert.ok(evidence.ok);
  const result = recordGateEvidence(pending.value, pending.value.generation, evidence.value, AT);
  assert.ok(result.ok);
  return result.value;
}

function eventMetadata(eventType: string) {
  return { eventId: 'event-1', eventType, schemaVersion: 1, occurredAt: AT, correlationId: 'correlation-1', producerId: 'control-plane-1', sequence: 1 };
}

test('the schemas both documents define are identical', () => {
  const http = document('sdlc.openapi.json').components.schemas;
  const messages = document('sdlc.asyncapi.json').components.schemas;
  const shared = Object.keys(http).filter((name) => name in messages);

  assert.ok(shared.includes('Admission'));
  for (const name of shared) assert.deepEqual(http[name], messages[name], name);
});

test('an admission record of the domain is a valid wire admission in both documents', () => {
  const record = JSON.parse(JSON.stringify(admission()));

  assert.ok(checkHttpSchema('Admission', record).ok);
  assert.ok(checkMessageSchema('Admission', record).ok);
});

test('admission and gate events carry the event envelope and their own event type', () => {
  const admitted = { metadata: eventMetadata('sdlc.admission.admitted'), payload: { runId: 'run-1', admission: admission() } };
  const decided = { metadata: eventMetadata('sdlc.gate.decided'), payload: { runId: 'run-1', gate: JSON.parse(JSON.stringify(decidedGate())) } };

  assert.ok(checkMessageSchema('AdmissionAdmittedEvent', JSON.parse(JSON.stringify(admitted))).ok);
  assert.ok(checkMessageSchema('GateDecidedEvent', decided).ok);
  assert.ok(violations(checkMessageSchema('AdmissionInvalidatedEvent', JSON.parse(JSON.stringify(admitted)))).some((text) => text.includes('/metadata/eventType')));
});

test('an event without its producer sequence or with an unknown field is rejected', () => {
  const { sequence: _sequence, ...withoutSequence } = eventMetadata('sdlc.gate.opened');
  const gate = JSON.parse(JSON.stringify(decidedGate()));

  assert.ok(violations(checkMessageSchema('GateOpenedEvent', { metadata: withoutSequence, payload: { runId: 'run-1', gate } })).some((text) => text.includes('sequence')));
  assert.deepEqual(
    violations(checkMessageSchema('GateEventPayload', { runId: 'run-1', gate, extra: true })),
    ['GateEventPayload / must NOT have additional properties "extra"'],
  );
});

test('a command carries its SDLC run, stage, and admission revision', () => {
  const metadata = {
    commandId: 'command-1',
    commandType: 'sdlc.task.dispatch',
    schemaVersion: 1,
    issuedAt: AT,
    correlationId: 'correlation-1',
    projectId: 'project-1',
    taskId: 'task-1',
    sdlc: { runId: 'run-1', stageId: 'apply', admissionId: 'admission-1', admissionGeneration: 1 },
  };

  assert.ok(checkMessageSchema('Command', { metadata, payload: {} }).ok);
  assert.ok(violations(checkMessageSchema('Command', { metadata: { ...metadata, sdlc: { runId: 'run-1', stageId: 'apply', admissionId: 'admission-1' } }, payload: {} }))
    .some((text) => text.includes('admissionGeneration')));
});

test('HTTP request bodies are checked against the OpenAPI schemas', () => {
  assert.ok(checkHttpSchema('CreateRunRequest', { runId: 'run-1', projectId: 'project-1', binding: BINDING }).ok);
  assert.ok(checkHttpSchema('SubmitTaskRequest', { taskId: 'task-1', kind: 'planning', stageId: 'specs' }).ok);
  assert.ok(violations(checkHttpSchema('SubmitTaskRequest', { taskId: 'task 1', kind: 'review', stageId: 'specs' })).length >= 2);
  assert.ok(checkHttpSchema('Failure', { code: 'precondition-failed', message: 'needs a work item', details: { admission: 'admission-1' } }).ok);
});
