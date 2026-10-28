import assert from 'node:assert/strict';
import test from 'node:test';
import { checkHttpSchema, type HttpComponents, type HttpOperations } from '@taskelith/contracts';
import {
  ANSWERING_ROLES,
  BOARD_COLUMNS,
  CARD_WAIT_KINDS,
  DELEGATION_OUTCOMES,
  DELIVERY_STATES,
  ESCALATION_REASONS,
  EVIDENCE_FRESHNESS,
  EXECUTION_EVIDENCE_KINDS,
  FLEET_OBSTACLE_REASONS,
  HARNESS_FAILURES,
  MAX_HARNESS_TEXT_LENGTH,
  MAX_INPUT_ANSWER_BYTES,
  MERGE_GATE_STATES,
  NEEDS_YOU_KINDS,
  PERMISSION_DECISIONS,
  PLACEMENT_REJECTING_REASONS,
  PLACEMENT_WAITING_REASONS,
  RECONCILIATION_REASONS,
  REQUEST_STATES,
  SESSION_ACTIVITIES,
  TASK_END_KINDS,
  TURN_OUTCOMES,
  TURN_STATES,
  WORK_TYPES,
  WORKER_REFUSAL_REASONS,
} from '@taskelith/execution';
import { ADMISSION_STATES, EVIDENCE_KINDS, GATE_STATES, STAGE_ORIGINS, STAGE_STATES } from '@taskelith/sdlc';
import {
  AT,
  holdsKey,
  type Json,
  operation,
  reachable,
  schemaName,
  SCHEMAS,
  violations,
} from './control-plane-document.ts';

type Schemas = HttpComponents['schemas'];

const PROJECT_READS = [
  'readBoard', 'readTaskDetail', 'listAgentSessions', 'readInbox', 'readInboxCounts', 'readAgentSession',
  'listAgentSessionTurns', 'listAgentSessionRequests', 'readAgentSessionOutput', 'streamProjectEvents',
];
const INSTALLATION_READS = ['readInstallationInbox', 'readInstallationInboxCounts', 'streamInstallationEvents'];
const OPERATOR_COMMANDS = ['answerInboxItem', 'submitTurn', 'respondToNativeRequest'];
const STREAMS = ['streamProjectEvents', 'streamInstallationEvents'];
const TEXT = 'x';

function enumOf(name: string): string[] {
  return (SCHEMAS[name] as { enum: string[] }).enum;
}

// The enumeration of a property in each `oneOf` variant of a schema.
function variantValues(name: string, property: string): string[] {
  const variants = (SCHEMAS[name] as { oneOf: { properties: Record<string, { enum?: string[]; const?: string }> }[] }).oneOf;
  return variants.flatMap(({ properties }) => properties[property]!.enum ?? [properties[property]!.const!]);
}

function successSchema(id: string, status = '200', media = 'application/json'): Json {
  return operation(id).responses[status]!.content![media]!.schema;
}

const card: Schemas['BoardCard'] = {
  runId: 'r1',
  title: 'Add the board',
  workType: 'feature',
  framework: { pluginId: 'openspec', pluginVersion: '1.0.0' },
  column: 'implement',
  stage: { stageId: 'apply', origin: 'native', state: 'in-progress' },
  waitingFor: 'capacity',
  obstacle: { taskId: 't1', observedAt: AT, source: 'automatic-retry', disposition: 'waiting', reason: 'retry-backoff', retryNumber: 2 },
  session: { state: 'worker-unreachable', lastContactAt: AT },
  integration: 'not-ready',
  needsYou: 1,
};

const item: Schemas['InboxItem'] = {
  itemId: 'n1',
  sourceId: 'native-requests',
  kind: 'delivery-acknowledgement',
  subject: { scope: 'card', projectId: 'p1', runId: 'r1', taskId: 't1', attemptId: 'a1', attemptGeneration: 2, nativeRequestId: 'req-1' },
  title: 'An answer may have run an action',
  createdAt: AT,
  answerableBy: 'project-operator',
  status: { state: 'open' },
};

test('the 9b operations name their resources and roles', () => {
  for (const id of [...PROJECT_READS, ...INSTALLATION_READS]) assert.equal(operation(id).method, 'get', id);
  for (const id of PROJECT_READS) {
    assert.match(operation(id).path, /^\/projects\/\{projectId\}\//, id);
    assert.match(operation(id).description!, /`project-viewer` or above on the project, or `installation-owner`/, id);
  }
  for (const id of [...INSTALLATION_READS, 'answerInstallationInboxItem']) {
    assert.doesNotMatch(operation(id).path, /projectId/, id);
    assert.match(operation(id).description!, /^Requires `installation-owner`\./, id);
  }
  for (const id of OPERATOR_COMMANDS) {
    assert.equal(operation(id).method, 'post', id);
    assert.match(operation(id).description!, /^Requires `project-operator` or above on the project/, id);
  }
});

test('the board and inbox enumerations are the product ports vocabularies', () => {
  const activity = variantValues('SessionActivity', 'state');
  const obstacles = SCHEMAS.PlacementObstacle as { oneOf: { properties: Record<string, { const?: string; enum?: string[] }> }[] };
  const reasonsOf = (source: string, disposition: string) => obstacles.oneOf
    .find(({ properties }) => properties.source!.const === source && properties.disposition!.const === disposition)!
    .properties.reason!;

  assert.deepEqual(enumOf('BoardColumn'), [...BOARD_COLUMNS]);
  assert.deepEqual(enumOf('WorkType'), [...WORK_TYPES]);
  assert.deepEqual(enumOf('MergeGateState'), [...MERGE_GATE_STATES]);
  assert.deepEqual(enumOf('CardWait'), [...CARD_WAIT_KINDS]);
  assert.deepEqual([...activity].sort(), [...SESSION_ACTIVITIES].sort());
  assert.deepEqual(reasonsOf('scheduler', 'waiting').enum, [...PLACEMENT_WAITING_REASONS]);
  assert.deepEqual(reasonsOf('scheduler', 'rejected').enum, [...PLACEMENT_REJECTING_REASONS]);
  assert.deepEqual(reasonsOf('worker', 'waiting').enum, [...WORKER_REFUSAL_REASONS]);
  assert.deepEqual(reasonsOf('fleet', 'waiting').enum, [...FLEET_OBSTACLE_REASONS]);
  assert.deepEqual(enumOf('TaskEndKind'), [...TASK_END_KINDS]);
  assert.deepEqual(enumOf('EvidenceFreshness'), [...EVIDENCE_FRESHNESS]);
  assert.deepEqual(enumOf('StageOrigin'), [...STAGE_ORIGINS]);
  assert.deepEqual(enumOf('StageState'), [...STAGE_STATES]);
  assert.deepEqual(enumOf('GateState'), [...GATE_STATES]);
  assert.deepEqual(enumOf('EvidenceKind'), [...EVIDENCE_KINDS]);
  assert.deepEqual(enumOf('AdmissionState'), [...ADMISSION_STATES]);
  assert.deepEqual(enumOf('InboxItemKind'), [...NEEDS_YOU_KINDS]);
  assert.deepEqual(enumOf('AnsweringRole'), [...ANSWERING_ROLES]);
  assert.deepEqual(enumOf('EscalationReason'), [...ESCALATION_REASONS]);
  assert.deepEqual(enumOf('ExecutionEvidenceKind'), [...EXECUTION_EVIDENCE_KINDS]);
  assert.deepEqual([...new Set(variantValues('InboxItem', 'kind'))].sort(), [...NEEDS_YOU_KINDS].sort());
  assert.deepEqual(variantValues('InboxAnswer', 'kind'), [...NEEDS_YOU_KINDS]);
  const reconciliation = (SCHEMAS.InboxItem as { oneOf: { properties: Record<string, { const?: string }> }[] }).oneOf
    .flatMap(({ properties }) => (properties.reconciliationReason === undefined ? [] : [properties.reconciliationReason.const]));
  assert.deepEqual(reconciliation, [...RECONCILIATION_REASONS]);
});

test('the session enumerations and bounds are the session timeline vocabularies', () => {
  const answer = SCHEMAS.InboxAnswer as { oneOf: { properties: Record<string, { maxLength?: number }> }[] };

  assert.deepEqual(enumOf('TurnState'), [...TURN_STATES]);
  assert.deepEqual(enumOf('TurnOutcome'), [...TURN_OUTCOMES]);
  assert.deepEqual(enumOf('HarnessFailure'), [...HARNESS_FAILURES]);
  assert.deepEqual(enumOf('NativeRequestState'), [...REQUEST_STATES]);
  assert.deepEqual(enumOf('DeliveryState'), [...DELIVERY_STATES]);
  assert.deepEqual(enumOf('PermissionDecision'), [...PERMISSION_DECISIONS]);
  assert.deepEqual(enumOf('DelegationResultOutcome'), [...DELEGATION_OUTCOMES]);
  assert.deepEqual([...variantValues('Turn', 'state')].sort(), [...TURN_STATES, 'ended'].sort());
  assert.equal((SCHEMAS.TurnText as { maxLength: number }).maxLength, MAX_HARNESS_TEXT_LENGTH);
  assert.equal((SCHEMAS.HarnessText as { maxLength: number }).maxLength, MAX_HARNESS_TEXT_LENGTH);
  assert.equal(answer.oneOf.find(({ properties }) => 'text' in properties)!.properties.text!.maxLength, MAX_INPUT_ANSWER_BYTES);
});

test('a board and a task detail match the generated types and schemas', () => {
  const board: HttpOperations['readBoard']['responses'][200]['content']['application/json'] = {
    asOf: AT, position: '42', projectId: 'p1', cards: [card], workersOnline: 0, callerMayAct: false,
  };
  const detail: Schemas['TaskDetail'] = {
    asOf: AT,
    position: '42',
    card,
    stages: [{ stageId: 'apply', origin: 'native', state: 'in-progress', column: 'implement', gates: [{ gateId: 'g1', state: 'blocked', requiredEvidence: 'platform-record', blockReason: 'policy conflict' }] }],
    traceability: [{ requirement: 'specs/board/spec.md#board', workItemIds: ['w1'], attemptIds: ['a1'], evidence: 'stale' }],
    runBinding: {
      pluginId: 'openspec', pluginVersion: '1.0.0', upstreamToolVersion: '1.2.0', workflowId: 'spec-driven', workflowVersion: '1',
      workflowDigest: `sha256:${'0'.repeat(64)}`, configurationRevision: 'c1', policyRevision: 'r1',
    },
    tasks: [{
      taskId: 't1', taskRunId: 'r2', ownershipGeneration: 2, delegation: { parentTaskId: 't0', depth: 1 },
      admission: { admissionId: 'ad1', stageId: 'apply', state: 'used', policyRevision: 'r1', dispatchedGeneration: 1 },
      session: { state: 'working' },
      end: { kind: 'uncertain-exit', taskId: 't1', attemptId: 'a1', outcome: { kind: 'not-started', ownershipGeneration: 2, cancelled: false, endedAt: AT } },
    }],
  };

  assert.ok(checkHttpSchema('Board', board).ok);
  assert.ok(checkHttpSchema('TaskDetail', detail).ok, JSON.stringify(checkHttpSchema('TaskDetail', detail)));
  assert.ok(violations(checkHttpSchema('BoardCard', { ...card, title: 'x'.repeat(201) })).some((text) => text.includes('/title')));
  assert.ok(violations(checkHttpSchema('SessionActivity', { state: 'worker-unreachable' })).length > 0);
  assert.ok(violations(checkHttpSchema('PlacementObstacle', { ...card.obstacle, retryNumber: undefined })).length > 0);
  assert.ok(violations(checkHttpSchema('PlacementObstacle', { taskId: 't1', observedAt: AT, source: 'fleet', disposition: 'rejected', reason: 'no-candidate' })).length > 0);
});

test('an inbox item carries only its own kind\'s details, and its answer is of its kind', () => {
  const answer: Schemas['InboxAnswerSubmission'] = { idempotencyKey: 'k1', answer: { kind: 'delivery-acknowledgement', decision: 'acknowledge' } };
  const resolved = { ...item, status: { state: 'resolved', resolvedBy: 'u1', resolvedAt: AT, answer: answer.answer } };
  const escalation = { ...item, kind: 'escalation', escalationReason: 'no-reviewer', answerableBy: 'project-maintainer' };
  const process = {
    ...item, kind: 'reconciliation', reconciliationReason: 'unrecorded-process', containment: 'taskelith-1', processCount: 2,
    answerableBy: 'installation-owner', subject: { scope: 'installation', workerId: 'w1', journalId: 'j1', observationId: 'o1' },
  };

  assert.ok(checkHttpSchema('InboxItem', item).ok);
  assert.ok(checkHttpSchema('InboxItem', resolved).ok);
  assert.ok(checkHttpSchema('InboxItem', escalation).ok);
  assert.ok(checkHttpSchema('InboxItem', process).ok);
  assert.ok(checkHttpSchema('InboxAnswerSubmission', answer).ok);
  assert.ok(violations(checkHttpSchema('InboxItem', { ...item, escalationReason: 'no-reviewer' })).length > 0);
  assert.ok(violations(checkHttpSchema('InboxItem', { ...escalation, escalationReason: undefined })).length > 0);
  assert.ok(violations(checkHttpSchema('InboxItem', { ...process, observed: [] })).length > 0);
  assert.ok(violations(checkHttpSchema('InboxAnswerSubmission', { answer: answer.answer })).some((text) => text.includes('idempotencyKey')));
  assert.ok(violations(checkHttpSchema('InboxAnswer', { kind: 'delivery-acknowledgement', decision: 'resend' })).length > 0);
  assert.ok(violations(checkHttpSchema('InboxAnswer', { kind: 'input-request', text: 'x'.repeat(MAX_INPUT_ANSWER_BYTES + 1) })).length > 0);
  assert.ok(checkHttpSchema('InboxCounts', { asOf: AT, position: '0', total: 0, byCard: [] }).ok);
});

test('a turn keeps its identity, and a failure exactly when it failed', () => {
  const queued: Schemas['Turn'] = { turnId: 't1', position: 1, author: { kind: 'principal', principalId: 'u1' }, text: TEXT, state: 'queued' };
  const host = { ...queued, author: { kind: 'host', delegationRequest: { generation: 1, nativeRequestId: 'req-1' } } };
  const ended = { ...queued, state: 'ended', generation: 1, outcome: 'completed' };

  for (const turn of [queued, host, ended, { ...ended, outcome: 'failed', failure: 'transport' }, { ...queued, state: 'outcome-unknown', generation: 2 }]) {
    assert.ok(checkHttpSchema('Turn', turn).ok, JSON.stringify(turn));
  }
  for (const turn of [{ ...ended, outcome: 'failed' }, { ...ended, failure: 'transport' }, { ...queued, generation: 1 }, { ...queued, text: '' }]) {
    assert.ok(violations(checkHttpSchema('Turn', turn)).length > 0, JSON.stringify(turn));
  }
  assert.ok(checkHttpSchema('TurnSubmission', { idempotencyKey: 'k1', text: TEXT }).ok);
  assert.ok(violations(checkHttpSchema('TurnSubmission', { idempotencyKey: 'k1', text: 'x'.repeat(MAX_HARNESS_TEXT_LENGTH + 1) })).some((text) => text.includes('/text')));
  assert.ok(violations(checkHttpSchema('TurnSubmission', { idempotencyKey: 'k1', text: TEXT, turnId: 't1' })).some((text) => text.includes('turnId')));
  assert.deepEqual(Object.keys(operation('submitTurn').responses).filter((status) => status.startsWith('2')).sort(), ['200', '201']);
});

test('a native request carries its response only when answered, and a person answers no delegation', () => {
  const open: Schemas['NativeRequest'] = { key: { generation: 1, nativeRequestId: 'req-1' }, position: 1, kind: 'permission-request', turnId: 't1', text: '', state: 'open' };
  const response = { answer: { kind: 'permission', decision: 'allow' }, responder: { kind: 'standing-rule', ruleId: 'rule-1' }, attemptId: 'a1', ownershipGeneration: 2, delivery: 'delivery-uncertain' };
  const submission: Schemas['NativeResponseSubmission'] = {
    idempotencyKey: 'k1', request: open.key, attemptId: 'a1', ownershipGeneration: 2, answer: { kind: 'input', text: 'yes' },
  };

  assert.ok(checkHttpSchema('NativeRequest', open).ok);
  assert.ok(checkHttpSchema('NativeRequest', { ...open, state: 'answered', ...response }).ok);
  assert.ok(violations(checkHttpSchema('NativeRequest', { ...open, ...response })).length > 0);
  assert.ok(violations(checkHttpSchema('NativeRequest', { ...open, state: 'answered' })).length > 0);
  assert.ok(checkHttpSchema('NativeResponseSubmission', submission).ok);
  assert.ok(checkHttpSchema('NativeAnswer', { kind: 'delegation-result', delegationId: 'd1', outcome: 'failed', summary: '' }).ok);
  assert.ok(violations(checkHttpSchema('NativeResponseSubmission', {
    ...submission, answer: { kind: 'delegation-result', delegationId: 'd1', outcome: 'completed', summary: 'done' },
  })).length > 0);
  for (const field of ['attemptId', 'ownershipGeneration', 'idempotencyKey']) {
    assert.ok(violations(checkHttpSchema('NativeResponseSubmission', { ...submission, [field]: undefined })).some((text) => text.includes(field)), field);
  }
});

test('output after a cursor returns at most 100 entries or the earliest retained position', () => {
  const entry = { position: 7, turnId: 't1', generation: 1, text: TEXT };
  const entries = SCHEMAS.OutputRead as { oneOf: { properties: { entries?: { maxItems: number } } }[] };

  assert.ok(checkHttpSchema('OutputRead', { result: 'entries', asOf: AT, position: '9', entries: [entry], next: 7 }).ok);
  assert.ok(checkHttpSchema('OutputRead', { result: 'cursor-expired', asOf: AT, position: '9', earliestRetained: 5 }).ok);
  assert.ok(violations(checkHttpSchema('OutputEntry', { ...entry, text: '' })).length > 0);
  assert.equal(entries.oneOf[0]!.properties.entries!.maxItems, 100);
  assert.ok(violations(checkHttpSchema('TimelineCursor', -1)).length > 0);
});

test('every 9b read carries the event stream position it reflects', () => {
  const reads = [...PROJECT_READS, ...INSTALLATION_READS].filter((id) => !STREAMS.includes(id));
  const stamped = (view: Json): boolean => (view.oneOf as Json[] | undefined)?.every(stamped) ?? (view.required as string[]).includes('position');

  for (const id of reads) assert.ok(stamped(SCHEMAS[schemaName(successSchema(id))]!), id);
});

test('a stream position is a decimal integer that names no uncommitted change', () => {
  for (const position of ['0', '1', '9007199254740991']) assert.ok(checkHttpSchema('EventPosition', position).ok, position);
  for (const position of ['', '01', '-1', '1.5', 'a', '1 ', '12345678901234567']) assert.ok(violations(checkHttpSchema('EventPosition', position)).length > 0, position);
  assert.match((SCHEMAS.EventPosition as { description: string }).description, /only once the change it reports has committed/);
});

test('each stream is an uncached text/event-stream of typed events resumed by Last-Event-ID', () => {
  for (const id of STREAMS) {
    const stream = operation(id);
    const success = stream.responses['200']!;
    const cursors = Object.fromEntries((stream.parameters ?? []).filter(({ name }) => name !== 'projectId').map(({ name, in: place, required, schema }) => [name, { place, required, schema }]));

    assert.equal(stream.method, 'get');
    assert.deepEqual(Object.keys(success.content!), ['text/event-stream']);
    assert.deepEqual(success.headers!['Cache-Control']!.schema, { type: 'string', const: 'no-store' });
    assert.deepEqual(cursors, {
      after: { place: 'query', required: false, schema: { $ref: '#/components/schemas/EventPosition' } },
      'Last-Event-ID': { place: 'header', required: false, schema: { $ref: '#/components/schemas/EventPosition' } },
    });
  }
  const events = (name: string) => ((SCHEMAS[name] as { oneOf: Json[] }).oneOf).map(schemaName);
  assert.deepEqual(events('InstallationEvent'), ['InboxItemChangedEvent', 'ResyncEvent']);
  assert.ok(events('ProjectEvent').includes('ResyncEvent'));
});

test('every event names its type and position except the resync, which has no position', () => {
  const types = new Set<string>();
  for (const name of (SCHEMAS.ProjectEvent as { oneOf: Json[] }).oneOf.map(schemaName)) {
    const event = SCHEMAS[name] as { required: string[]; properties: { type: { const: string } } };

    assert.ok(!types.has(event.properties.type.const), name);
    types.add(event.properties.type.const);
    assert.equal(event.required.includes('position'), name !== 'ResyncEvent', name);
  }
  assert.ok(checkHttpSchema('ProjectEvent', { type: 'resync', reason: 'cursor-expired' }).ok);
  assert.ok(violations(checkHttpSchema('ProjectEvent', { type: 'resync', reason: 'cursor-expired', position: '3' })).length > 0);
  assert.ok(checkHttpSchema('ProjectEvent', { type: 'card-changed', position: '3', occurredAt: AT, card }).ok);
  assert.ok(checkHttpSchema('InstallationEvent', { type: 'inbox-item-changed', position: '4', occurredAt: AT, item }).ok);
  assert.ok(violations(checkHttpSchema('InstallationEvent', { type: 'card-changed', position: '3', occurredAt: AT, card })).length > 0);
  assert.ok(violations(checkHttpSchema('ProjectEvent', { type: 'output-appended', occurredAt: AT, sessionId: 's1', entry: { position: 1, turnId: 't1', generation: 1, text: TEXT } })).length > 0);
});

test('a change of the workers online reaches the project stream, also for a board with no cards', () => {
  const board = SCHEMAS.Board as { properties: Record<string, Json> };
  const event = SCHEMAS.BoardChangedEvent as { properties: Record<string, Json> };

  assert.deepEqual(event.properties.workersOnline, board.properties.workersOnline);
  assert.ok(!('cards' in event.properties) && !('callerMayAct' in event.properties));
  assert.ok(checkHttpSchema('ProjectEvent', { type: 'board-changed', position: '5', occurredAt: AT, projectId: 'p1', workersOnline: 1 }).ok);
  assert.ok(violations(checkHttpSchema('InstallationEvent', { type: 'board-changed', position: '5', occurredAt: AT, projectId: 'p1', workersOnline: 1 })).length > 0);
});

test('a stream cursor is a boundary of the installation-wide sequence', () => {
  const resync = (SCHEMAS.ResyncEvent as { description: string }).description;

  assert.match(resync, /below the stream's retention floor \(`cursor-expired`\)/);
  assert.match(resync, /beyond the head of the installation-wide sequence \(`cursor-unknown`\)/);
  for (const id of STREAMS) {
    const after = (operation(id).parameters ?? []).find(({ name }) => name === 'after');
    assert.match(after?.description ?? '', /a boundary in the installation-wide sequence, valid from the retention floor to its head/, id);
  }
});

test('a repeated command is compared before redaction, ahead of the refusal of an answered one', () => {
  for (const id of ['answerInboxItem', 'answerInstallationInboxItem', 'respondToNativeRequest']) {
    assert.match(operation(id).responses['200']!.description, /compared before redaction, repeat/, id);
  }
  assert.match(operation('respondToNativeRequest').responses['200']!.description, /checked before `already-answered`/);
  assert.match(operation('submitTurn').responses['200']!.description, /the text before redaction/);
});

test('commands that can repeat take an idempotency key and answer typed conflicts and refusals', () => {
  const conflicts = (SCHEMAS.CommandConflict as { properties: { details: { properties: { reason: { enum: string[] } } } } }).properties.details.properties.reason.enum;

  assert.deepEqual(conflicts, ['already-answered', 'idempotency-key-reused']);
  for (const id of [...OPERATOR_COMMANDS, 'answerInstallationInboxItem']) {
    const command = operation(id);
    const body = SCHEMAS[schemaName(command.requestBody!.content['application/json']!.schema!)] as { required: string[] };

    assert.ok(body.required.includes('idempotencyKey'), id);
    assert.deepEqual(command.responses['409']!.content!['application/json']!.schema, { $ref: '#/components/schemas/CommandConflict' }, id);
    assert.ok(holdsKey(command.responses['422']!.content!['application/json']!.schema, '$ref', `#/components/schemas/${id === 'submitTurn' ? 'TurnRefusal' : id === 'respondToNativeRequest' ? 'ResponseRefusal' : 'AnswerRefusal'}`), id);
  }
});

test('the schemas that the worker messages reuse use only keywords that draft-07 reads alike', () => {
  const shared = [
    'IdempotencyKey', 'AgentSessionId', 'AgentSessionGeneration', 'TurnId', 'TurnText', 'TurnOutcome', 'HarnessFailure', 'NativeRequestId',
    'NativeRequestKey', 'NativeRequestKind', 'HarnessText', 'NativeAnswer', 'PermissionDecision', 'DelegationResultOutcome',
  ];
  const onlyIn2020 = ['$defs', 'prefixItems', 'dependentRequired', 'dependentSchemas', 'unevaluatedProperties', 'unevaluatedItems', '$anchor'];

  for (const name of shared) {
    const text = JSON.stringify(reachable(SCHEMAS[name]));
    for (const keyword of onlyIn2020) assert.ok(!text.includes(`"${keyword}"`), `${name}: ${keyword}`);
  }
});
