import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkHttpSchema, type HttpComponents, type HttpOperations, type SchemaViolations } from '@taskelith/contracts';
import { DELEGATION_OUTCOMES, EXECUTION_EVIDENCE_KINDS, LAUNCH_REJECTION_REASONS } from '@taskelith/execution';
import { SCM_PERMISSIONS } from '@taskelith/integrations/port';
import type { Result } from '@taskelith/kernel';

type Json = Record<string, unknown>;
type SecurityRequirement = Record<string, string[]>;

interface Operation {
  readonly operationId: string;
  readonly security: SecurityRequirement[];
  readonly parameters?: { readonly name: string; readonly in: string; readonly required?: boolean }[];
  readonly requestBody?: { readonly content: Record<string, { schema?: Json }> };
  readonly responses: Record<string, { headers?: Record<string, Json>; content?: Record<string, { schema: Json }> }>;
}

interface Document {
  readonly openapi: string;
  readonly info: { readonly version: string };
  readonly paths: Record<string, Record<string, Operation>>;
  readonly components: { readonly schemas: Record<string, Json>; readonly securitySchemes: Record<string, Json> };
}

interface RefusalSchema {
  readonly properties: { readonly code: { readonly const: string }; readonly details: { readonly properties: { readonly reason: { readonly enum: string[] } } } };
}

function document(name: string): Document {
  return JSON.parse(readFileSync(new URL(`../documents/${name}`, import.meta.url), 'utf8'));
}

function violations<T>(result: Result<T, SchemaViolations>): SchemaViolations {
  assert.equal(result.ok, false);
  return result.ok ? [] : result.error;
}

const EXECUTION = document('execution.openapi.json');
const CONTROL_PLANE = document('control-plane.openapi.json');
const SCHEMAS = EXECUTION.components.schemas;
const AT = '2026-10-28T10:00:00.000Z';
const REMOTE = 'https://scm.example/acme/project.git';

const OPERATIONS = Object.values(EXECUTION.paths).flatMap((item) =>
  Object.entries(item).map(([method, operation]) => ({ method, ...operation })),
);

const SESSION_READS = ['readEvidence', 'downloadEvidence', 'listUnknownExecutions', 'listUnrecordedProcesses'];
const SESSION_WRITES = ['retireEvidence', 'readmitTask'];
const CREDENTIAL_DELIVERIES = ['fetchSlotCredential', 'issueRunScmCredential', 'fetchRunScmCredential'];
const WORKER_READS = ['readDelegationResult', ...CREDENTIAL_DELIVERIES];
const NEW_OPERATIONS = [
  'retireEvidence', 'readDelegationResult', 'listUnknownExecutions', 'listUnrecordedProcesses', 'readmitTask', ...CREDENTIAL_DELIVERIES,
];

function operation(id: string): Operation & { method: string } {
  const found = OPERATIONS.find((candidate) => candidate.operationId === id);
  assert.ok(found, id);
  return found;
}

function referencesIn(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(referencesIn);
  if (node === null || typeof node !== 'object') return [];
  const own = typeof (node as Json).$ref === 'string' ? [(node as Json).$ref as string] : [];
  return [...own, ...Object.values(node).flatMap(referencesIn)];
}

// Every schema name a node reaches, following component references.
function reachableNames(node: unknown, seen = new Set<string>()): Set<string> {
  for (const reference of referencesIn(node)) {
    const name = reference.replace('#/components/schemas/', '');
    if (seen.has(name)) continue;
    seen.add(name);
    reachableNames(SCHEMAS[name], seen);
  }
  return seen;
}

function responseSchema(id: string, status: string): Json {
  return operation(id).responses[status]!.content!['application/json']!.schema;
}

function reasonsOf(name: string): string[] {
  return (SCHEMAS[name] as unknown as RefusalSchema).properties.details.properties.reason.enum;
}

function refusal(reason: string) {
  return { code: 'precondition-failed', message: `refused: ${reason}`, details: { reason } };
}

test('the execution document is OpenAPI 3.1.0 at version 0.6.0 with the 9c operations', () => {
  assert.equal(EXECUTION.openapi, '3.1.0');
  assert.equal(EXECUTION.info.version, '0.6.0');
  for (const reference of referencesIn(EXECUTION)) assert.ok(reference.replace('#/components/schemas/', '') in SCHEMAS, reference);
  for (const id of NEW_OPERATIONS) operation(id);
  assert.equal(operation('retireEvidence').method, 'delete');
  assert.equal(operation('readmitTask').method, 'post');
});

test('the session schemes and the shared failures are those of the control-plane document', () => {
  const { securitySchemes } = EXECUTION.components;

  assert.deepEqual(Object.keys(securitySchemes).sort(), ['browserSession', 'csrfToken', 'enrollmentToken', 'operatorToken', 'workerCredential']);
  for (const name of ['browserSession', 'csrfToken', 'operatorToken']) assert.deepEqual(securitySchemes[name], CONTROL_PLANE.components.securitySchemes[name], name);
  for (const name of ['AuthenticationFailure', 'AccessDenial', 'CsrfRejection', 'ExternalId', 'RemoteUrl']) {
    assert.deepEqual(SCHEMAS[name], CONTROL_PLANE.components.schemas[name], name);
  }
});

test('evidence, reconciliation, and re-admission accept the session or the operator bearer', () => {
  for (const id of SESSION_READS) assert.deepEqual(operation(id).security, [{ browserSession: [] }, { operatorToken: [] }], id);
  for (const id of SESSION_WRITES) assert.deepEqual(operation(id).security, [{ browserSession: [], csrfToken: [] }, { operatorToken: [] }], id);
  for (const id of [...SESSION_READS, ...SESSION_WRITES]) {
    assert.deepEqual(responseSchema(id, '401'), { $ref: '#/components/schemas/AuthenticationFailure' }, id);
  }
  for (const id of SESSION_WRITES) {
    assert.deepEqual(responseSchema(id, '403'), { oneOf: [{ $ref: '#/components/schemas/AccessDenial' }, { $ref: '#/components/schemas/CsrfRejection' }] }, id);
  }
  for (const id of ['readEvidence', 'downloadEvidence']) {
    assert.ok(!('403' in operation(id).responses), `${id} answers a principal without a role as an unknown record`);
  }
  for (const id of ['listUnknownExecutions', 'listUnrecordedProcesses']) assert.deepEqual(responseSchema(id, '403'), { $ref: '#/components/schemas/AccessDenial' }, id);
});

test('delegation results and credential deliveries take the worker credential only', () => {
  for (const id of WORKER_READS) assert.deepEqual(operation(id).security, [{ workerCredential: [] }], id);
  const sessions = OPERATIONS.filter(({ security }) => security.some((requirement) => 'browserSession' in requirement));
  assert.deepEqual(sessions.map(({ operationId }) => operationId).sort(), [...SESSION_READS, ...SESSION_WRITES].sort());
});

test('every new operation with a path parameter answers 400 to an invalid one', () => {
  for (const id of NEW_OPERATIONS) {
    const { parameters, responses } = operation(id);
    if ((parameters ?? []).some(({ in: place }) => place === 'path')) assert.ok('400' in responses, id);
  }
});

test('only the credential deliveries reveal a secret, and never cached', () => {
  const secrets = ['RevealedSlotCredential', 'RevealedScmSecret', 'ScmAuthorization'];
  const revealing = OPERATIONS.filter(({ responses }) =>
    Object.values(responses).some(({ content }) => Object.values(content ?? {}).some(({ schema }) => secrets.some((name) => reachableNames(schema).has(name)))));

  assert.deepEqual(revealing.map(({ operationId }) => operationId).sort(), [...CREDENTIAL_DELIVERIES].sort());
  for (const { operationId, responses } of revealing) {
    assert.deepEqual(responses['200']!.headers!['Cache-Control']!.schema, { type: 'string', const: 'no-store' }, operationId);
    assert.equal(responses['200']!.headers!['Cache-Control']!.required, true, operationId);
  }
  for (const name of secrets) assert.notEqual(SCHEMAS[name]!.writeOnly, true, name);
});

test('the wire enumerations are the domain vocabularies', () => {
  const enumOf = (name: string) => (SCHEMAS[name] as { enum: string[] }).enum;
  const ownership = ['quarantined', ...LAUNCH_REJECTION_REASONS];

  assert.deepEqual(enumOf('DelegationResultOutcome'), [...DELEGATION_OUTCOMES]);
  assert.deepEqual(enumOf('ExecutionEvidenceKind'), [...EXECUTION_EVIDENCE_KINDS]);
  assert.deepEqual(enumOf('ScmPermission'), [...SCM_PERMISSIONS]);
  for (const name of ['SlotCredentialRefusal', 'ScmCredentialRefusal']) {
    for (const reason of reasonsOf(name).slice(0, 6)) assert.ok(ownership.includes(reason), `${name}: ${reason}`);
  }
});

test('evidence retirement refuses a record within its retention with a typed 422', () => {
  const retained = { ...refusal('retention-not-elapsed'), details: { reason: 'retention-not-elapsed', retainedUntil: AT } };

  assert.deepEqual(Object.keys(operation('retireEvidence').responses).sort(), ['204', '400', '401', '403', '404', '422', '500', '503']);
  assert.deepEqual(responseSchema('retireEvidence', '422'), { $ref: '#/components/schemas/RetentionRefusal' });
  assert.ok(checkHttpSchema('RetentionRefusal', retained).ok);
  assert.ok(violations(checkHttpSchema('RetentionRefusal', refusal('role-required'))).some((text) => text.includes('/details/reason')));
});

test('a delegation result is pending or the child outcome with its summary', () => {
  const pending: HttpOperations['readDelegationResult']['responses'][200]['content']['application/json'] = {
    state: 'pending', delegationId: 'delegation-1', attemptId: 'attempt-1', parentTaskId: 'task-1', childTaskId: 'task-2',
  };
  const ended: HttpComponents['schemas']['DelegationResult'] = {
    ...pending, state: 'ended', outcome: 'completed', summary: 'The child passed its gates.', endedAt: AT,
  };

  assert.ok(checkHttpSchema('DelegationResult', pending).ok);
  assert.ok(checkHttpSchema('DelegationResult', ended).ok);
  assert.ok(checkHttpSchema('DelegationResult', { ...ended, summary: 'x'.repeat(65_536) }).ok);
  assert.ok(violations(checkHttpSchema('DelegationResult', { ...ended, summary: 'x'.repeat(65_537) })).length > 0);
  assert.ok(violations(checkHttpSchema('DelegationResult', { ...pending, outcome: 'completed' })).length > 0);
  assert.ok(violations(checkHttpSchema('DelegationResult', { ...ended, outcome: 'admitted' })).length > 0);
});

test('the reconciliation queue pages by identifier with at most 100 items', () => {
  const unknown: HttpComponents['schemas']['UnknownExecution'] = {
    projectId: 'p1', runId: 'run-1', taskId: 'task-1', attemptId: 'attempt-1', ownershipGeneration: 2, executionId: 'execution-1',
    workerId: 'worker-1', state: 'started', evidence: [{ kind: 'uncertain', observedAt: AT }],
  };
  const process: HttpComponents['schemas']['UnrecordedProcess'] = {
    workerId: 'worker-1', journalId: 'journal-1', observationId: 'observation-1', containment: 'cgroup taskelith/unknown', processCount: 2, recordedAt: AT,
  };

  for (const [id, page, items] of [['listUnknownExecutions', 'UnknownExecutionPage', 'executions'], ['listUnrecordedProcesses', 'UnrecordedProcessPage', 'processes']] as const) {
    const schema = SCHEMAS[page] as { required: string[]; properties: Record<string, { maxItems?: number; $ref?: string }> };
    assert.deepEqual(responseSchema(id, '200'), { $ref: `#/components/schemas/${page}` });
    assert.equal(schema.properties[items]!.maxItems, 100, id);
    assert.equal(schema.properties.next!.$ref, '#/components/schemas/Identifier', id);
    assert.deepEqual(schema.required, [items], id);
    assert.ok(operation(id).parameters!.some(({ name, required }) => name === 'after' && required === false), id);
  }
  assert.ok(operation('listUnknownExecutions').parameters!.some(({ name, required }) => name === 'projectId' && required === true));
  assert.ok(checkHttpSchema('UnknownExecutionPage', { executions: [unknown], next: 'execution-1' }).ok);
  assert.ok(violations(checkHttpSchema('UnknownExecutionPage', { executions: Array(101).fill(unknown) })).length > 0);
  assert.ok(violations(checkHttpSchema('UnknownExecution', { ...unknown, state: 'exited' })).some((text) => text.includes('/state')));
  assert.ok(violations(checkHttpSchema('UnknownExecution', { ...unknown, evidence: [] })).some((text) => text.includes('/evidence')));
  assert.ok(checkHttpSchema('UnrecordedProcessPage', { processes: [process] }).ok);
  assert.ok(violations(checkHttpSchema('UnrecordedProcess', { ...process, projectId: 'p1' })).some((text) => text.includes('projectId')));
});

test('a re-admission names the generation it read and is refused with a typed reason', () => {
  const readmission: HttpComponents['schemas']['Readmission'] = { expectedOwnershipGeneration: 3 };

  assert.ok(checkHttpSchema('Readmission', readmission).ok);
  assert.ok(violations(checkHttpSchema('Readmission', {})).some((text) => text.includes('expectedOwnershipGeneration')));
  assert.deepEqual(responseSchema('readmitTask', '201'), { $ref: '#/components/schemas/TaskSubmission' });
  assert.ok('409' in operation('readmitTask').responses);
  assert.deepEqual(reasonsOf('ReadmissionRefusal'), ['attempt-active', 'admission-not-dispatched', 'admission-refused']);
  for (const reason of reasonsOf('ReadmissionRefusal')) assert.ok(checkHttpSchema('ReadmissionRefusal', refusal(reason)).ok, reason);
});

test('a slot credential delivery is scoped to the execution and slot and refused by its checks', () => {
  const delivery: HttpComponents['schemas']['SlotCredentialDelivery'] = {
    executionId: 'execution-1', slotId: 's1', mechanismId: 'subscription-token', credentialVersion: 3, credential: 'subscription token',
  };
  const { parameters } = operation('fetchSlotCredential');
  const placed = (where: string) => parameters!.filter(({ in: place }) => place === where);

  assert.deepEqual(placed('path').map(({ name }) => name), ['executionId', 'slotId']);
  assert.deepEqual(placed('query').map(({ name, required }) => [name, required]), [['attemptId', true], ['ownershipGeneration', true], ['recoveryEpoch', true]]);
  assert.ok(checkHttpSchema('SlotCredentialDelivery', delivery).ok);
  assert.ok(violations(checkHttpSchema('SlotCredentialDelivery', { ...delivery, attemptId: 'attempt-1' })).some((text) => text.includes('attemptId')));
  assert.deepEqual(reasonsOf('SlotCredentialRefusal'), [
    'quarantined', 'stale-recovery-epoch', 'worker-not-authorized', 'assignment-not-active', 'stale-ownership-generation',
    'attempt-not-launchable', 'execution-conflict', 'capacity-not-reserved', 'revoked', 'removed', 'delivery-not-admitted',
  ]);
  for (const reason of reasonsOf('SlotCredentialRefusal')) assert.ok(checkHttpSchema('SlotCredentialRefusal', refusal(reason)).ok, reason);
});

test('the first slot credential delivery is a fetch, and the launch grant carries no credential', () => {
  const delivering = OPERATIONS.filter(({ responses }) =>
    Object.values(responses).some(({ content }) => Object.values(content ?? {}).some(({ schema }) => reachableNames(schema).has('SlotCredentialDelivery'))));

  assert.deepEqual(delivering.map(({ operationId }) => operationId), ['fetchSlotCredential']);
  assert.equal(reachableNames({ $ref: '#/components/schemas/LaunchGrant' }).has('RevealedSlotCredential'), false);
});

const SCM_DELIVERY: HttpComponents['schemas']['ScmCredentialDelivery'] = {
  runId: 'run-1', credentialId: 'credential-1', version: 2, repositories: ['acme/project'], permissions: ['read-code', 'write-code'],
  expiresAt: AT, remoteUrl: REMOTE, secret: 'scm secret', authorization: 'Basic eC1hY2Nlc3MtdG9rZW46c2NtIHNlY3JldA==',
};

test('a per-run SCM credential carries its version and the remote URL it may be sent to', () => {
  const request: HttpOperations['issueRunScmCredential']['requestBody']['content']['application/json'] = {
    attemptId: 'attempt-1', ownershipGeneration: 2, recoveryEpoch: 1,
  };
  const path = operation('fetchRunScmCredential').parameters!.filter(({ in: place }) => place === 'path').map(({ name }) => name);

  assert.ok(checkHttpSchema('ScmCredentialRequest', request).ok);
  assert.ok(violations(checkHttpSchema('ScmCredentialRequest', { ...request, workerId: 'worker-1' })).some((text) => text.includes('workerId')));
  assert.deepEqual(path, ['runId', 'credentialId', 'version']);
  assert.ok(checkHttpSchema('ScmCredentialDelivery', SCM_DELIVERY).ok);
  for (const remoteUrl of ['http://scm.example/a.git', 'https://agent@scm.example/a.git', 'https://scm.example/a.git?x', 'https://scm.example/a.git#y']) {
    assert.ok(violations(checkHttpSchema('ScmCredentialDelivery', { ...SCM_DELIVERY, remoteUrl })).some((text) => text.includes('/remoteUrl')), remoteUrl);
  }
  assert.ok(violations(checkHttpSchema('ScmCredentialDelivery', { ...SCM_DELIVERY, permissions: ['admin'] })).length > 0);
  assert.ok(violations(checkHttpSchema('ScmCredentialDelivery', { ...SCM_DELIVERY, authorization: 'Basic a\r\nX-Injected: 1' })).length > 0);
});

test('every SCM credential issue and fetch re-checks the bound remote with the binding reasons', () => {
  const binding = (CONTROL_PLANE.components.schemas.BindingRefusal as unknown as RefusalSchema).properties.details.properties.reason.enum;
  const remote = binding.filter((reason) => reason !== 'merge-method-undeclared');
  const reasons = reasonsOf('ScmCredentialRefusal');

  assert.deepEqual(reasons.slice(reasons.indexOf('repository-unbound') + 1, reasons.indexOf('credential-ended')), remote);
  assert.ok(!reasons.includes('merge-method-undeclared'));
  for (const id of ['issueRunScmCredential', 'fetchRunScmCredential']) assert.deepEqual(responseSchema(id, '422'), { $ref: '#/components/schemas/ScmCredentialRefusal' }, id);
  for (const reason of reasons) assert.ok(checkHttpSchema('ScmCredentialRefusal', refusal(reason)).ok, reason);
  assert.ok(violations(checkHttpSchema('ScmCredentialRefusal', { ...refusal('remote-origin-mismatch'), code: 'forbidden' })).some((text) => text.includes('/code')));
});
