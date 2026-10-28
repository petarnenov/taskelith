import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  checkMessageSchema,
  type MessageSchemas,
  SESSION_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  supportsProtocolVersion,
  type SchemaViolations,
} from '@taskelith/contracts';
import { DELIVERY_STATES, HARNESS_FAILURES, TURN_OUTCOMES } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';

type Json = Record<string, unknown>;

interface AsyncapiDocument {
  readonly info: { readonly version: string };
  readonly channels: Record<string, { messages: Record<string, { $ref: string }> }>;
  readonly operations: Record<string, { action: string; channel: { $ref: string }; messages: { $ref: string }[] }>;
  readonly components: { readonly schemas: Record<string, Json>; readonly messages: Record<string, { title: string; payload: { $ref: string } }> };
}

const EXECUTION = JSON.parse(readFileSync(new URL('../documents/execution.asyncapi.json', import.meta.url), 'utf8')) as AsyncapiDocument;
const SCHEMAS = EXECUTION.components.schemas;
const AT = '2026-10-28T10:00:00.000Z';
const ONE_MEBIBYTE = 1_048_576;

const SESSION_COMMANDS: Record<string, string> = {
  'session.turn.deliver': 'TurnDeliveryCommand',
  'session.response.deliver': 'ResponseDeliveryCommand',
  'session.delegation-result.deliver': 'DelegationResultDeliveryCommand',
  'execution.scm-credential.refreshed': 'ScmCredentialRefreshedCommand',
};
const SESSION_OBSERVATIONS: Record<string, string> = {
  'session.generation.started': 'GenerationStartedObservation',
  'session.generation.ended': 'GenerationEndedObservation',
  'session.turn.delivered': 'TurnDeliveredObservation',
  'session.turn.not-delivered': 'TurnNotDeliveredObservation',
  'session.turn.ended': 'TurnEndedObservation',
  'session.request.recorded': 'RequestRecordedObservation',
  'session.response.delivery-reported': 'ResponseDeliveryReportedObservation',
  'session.output.appended': 'OutputAppendedObservation',
  'session.limit.signaled': 'LimitSignaledObservation',
  'execution.scm-credential.adopted': 'ScmCredentialAdoptedObservation',
  'execution.scm-credential.not-adopted': 'ScmCredentialNotAdoptedObservation',
};
const SECRET_SCHEMAS = ['RevealedSlotCredential', 'RevealedScmSecret', 'ScmAuthorization', 'SlotCredential', 'ScmSecrets', 'Password'];
const REQUEST = { generation: 2, nativeRequestId: 'native-7' };

function violations<T>(result: Result<T, SchemaViolations>): SchemaViolations {
  assert.equal(result.ok, false);
  return result.ok ? [] : result.error;
}

function check(name: string, input: unknown) {
  return checkMessageSchema(name as keyof MessageSchemas & string, input);
}

function command(commandType: string, payload: object, protocolVersion = SESSION_PROTOCOL_VERSION) {
  return {
    metadata: {
      commandId: 'command-1', commandType, schemaVersion: 1, issuedAt: AT, correlationId: 'correlation-1', projectId: 'project-1',
      taskId: 'task-1', attemptId: 'attempt-1', workerId: 'worker-1', ownershipGeneration: 2,
      sdlc: { runId: 'run-1', stageId: 'apply', admissionId: 'admission-1', admissionGeneration: 1 },
    },
    payload: { protocolVersion, ...payload },
  };
}

function observation(observationType: string, payload: object, protocolVersion = SESSION_PROTOCOL_VERSION) {
  return {
    metadata: {
      observationId: 'observation-1', observationType, schemaVersion: 1, protocolVersion, occurredAt: AT, correlationId: 'correlation-1',
      workerId: 'worker-1', journalId: 'journal-1', sequence: 1, attemptId: 'attempt-1', ownershipGeneration: 2,
    },
    payload,
  };
}

const TURN = { sessionId: 'session-1', generation: 2, turn: { turnId: 't1', position: 3, author: { kind: 'principal', principalId: 'u1' }, text: 'Run the tests' } };
const PERMISSION = { sessionId: 'session-1', request: REQUEST, answer: { kind: 'permission', decision: 'allow' }, responder: { kind: 'principal', principalId: 'u1' } };
const ENDED = {
  state: 'ended', delegationId: 'delegation-1', attemptId: 'attempt-1', parentTaskId: 'task-1', childTaskId: 'task-2',
  outcome: 'completed', summary: 'The child added the parser.', endedAt: AT,
};
const NOTICE = { runId: 'run-1', credentialId: 'credential-1', version: 3 };
const BINDING = { sessionId: 'session-1', harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' };
const RESUME = { nativeSessionId: 'native-session-1', generation: 3 };
const OFFER = {
  assignmentId: 'assignment-1',
  recoveryEpoch: 1,
  reservation: { reservationId: 'reservation-1', requested: { cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: ['cpu-limit'] } },
};

const COMMAND_EXAMPLES: Record<string, object> = {
  'session.turn.deliver': TURN,
  'session.response.deliver': PERMISSION,
  'session.delegation-result.deliver': { sessionId: 'session-1', request: REQUEST, result: ENDED },
  'execution.scm-credential.refreshed': NOTICE,
};
const OBSERVATION_EXAMPLES: Record<string, object> = {
  'session.generation.started': { sessionId: 'session-1', generation: 1, nativeSessionId: 'native-session-1' },
  'session.generation.ended': { sessionId: 'session-1', generation: 1, cause: 'session-ended' },
  'session.turn.delivered': { sessionId: 'session-1', turnId: 't1', generation: 2 },
  'session.turn.not-delivered': { sessionId: 'session-1', turnId: 't1', generation: 2, reason: 'generation-not-running' },
  'session.turn.ended': { sessionId: 'session-1', turnId: 't1', generation: 2, outcome: 'completed' },
  'session.request.recorded': { sessionId: 'session-1', request: REQUEST, kind: 'permission-request', turnId: 't1', text: 'Allow git push?' },
  'session.response.delivery-reported': { sessionId: 'session-1', request: REQUEST, report: 'delivered' },
  'session.output.appended': { sessionId: 'session-1', turnId: 't1', generation: 2, chunk: 1, text: 'All tests pass.' },
  'session.limit.signaled': { sessionId: 'session-1', generation: 2, resetsAt: AT },
  'execution.scm-credential.adopted': NOTICE,
  'execution.scm-credential.not-adopted': { ...NOTICE, reason: 'superseded' },
};

function reachableNames(node: unknown, seen = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) reachableNames(item, seen);
  } else if (node !== null && typeof node === 'object') {
    const reference = (node as Json).$ref;
    if (typeof reference === 'string') {
      const name = reference.replace('#/components/schemas/', '');
      if (!seen.has(name)) {
        seen.add(name);
        reachableNames(SCHEMAS[name], seen);
      }
    }
    for (const value of Object.values(node)) reachableNames(value, seen);
  }
  return seen;
}

function enumAt(schema: Json, ...path: string[]): string[] {
  const node = path.reduce<Json>((current, key) => current[key] as Json, schema);
  return (node.enum ?? [node.const]) as string[];
}

test('the execution messages are at version 0.8.0 with the session commands and observations on the worker channels', () => {
  assert.equal(EXECUTION.info.version, '0.8.0');
  const titles = (channel: string) => Object.values(EXECUTION.channels[channel]!.messages).map(({ $ref }) =>
    EXECUTION.components.messages[$ref.replace('#/components/messages/', '')]!.title);
  for (const [type, schema] of Object.entries(SESSION_COMMANDS)) {
    assert.ok(titles('workerCommands').includes(type), type);
    const message = Object.values(EXECUTION.components.messages).find(({ title }) => title === type)!;
    assert.equal(message.payload.$ref, `#/components/schemas/${schema}`);
  }
  for (const type of Object.keys(SESSION_OBSERVATIONS)) assert.ok(titles('workerObservations').includes(type), type);
  const listed = (operation: string) => EXECUTION.operations[operation]!.messages.map(({ $ref }) => $ref.split('/').pop());
  for (const [channel, operation] of [['workerCommands', 'sendWorkerCommand'], ['workerObservations', 'receiveWorkerObservation']] as const) {
    assert.deepEqual(listed(operation).sort(), Object.keys(EXECUTION.channels[channel]!.messages).sort());
  }
});

test('every session command and observation is valid at protocol version 2 and refused at version 1', () => {
  for (const [type, schema] of Object.entries(SESSION_COMMANDS)) {
    assert.ok(check(schema, command(type, COMMAND_EXAMPLES[type]!)).ok, type);
    assert.ok(violations(check(schema, command(type, COMMAND_EXAMPLES[type]!, 1))).some((text) => text.includes('/payload/protocolVersion')), type);
    assert.ok(violations(check(schema, command('execution.assignment.offer', COMMAND_EXAMPLES[type]!))).some((text) => text.includes('/metadata/commandType')), type);
  }
  for (const [type, schema] of Object.entries(SESSION_OBSERVATIONS)) {
    assert.ok(check(schema, observation(type, OBSERVATION_EXAMPLES[type]!)).ok, type);
    assert.ok(violations(check(schema, observation(type, OBSERVATION_EXAMPLES[type]!, 1))).some((text) => text.includes('/metadata/protocolVersion')), type);
    const { attemptId: _attemptId, ...unattributed } = observation(type, OBSERVATION_EXAMPLES[type]!).metadata;
    assert.ok(violations(check(schema, { ...observation(type, OBSERVATION_EXAMPLES[type]!), metadata: unattributed })).some((text) => text.includes('attemptId')), type);
  }
});

test('a worker of version 1 reads a session command as versioned and fails closed on it', () => {
  const turn = command('session.turn.deliver', TURN);

  assert.equal(SESSION_PROTOCOL_VERSION, 2);
  assert.equal((SCHEMAS.SessionProtocolVersion as { minimum: number }).minimum, SESSION_PROTOCOL_VERSION);
  assert.ok(checkMessageSchema('VersionedCommand', turn).ok);
  assert.equal(supportsProtocolVersion(SUPPORTED_PROTOCOL_VERSIONS, turn.payload.protocolVersion), false);
  assert.equal(supportsProtocolVersion({ minimum: 1, maximum: 2 }, turn.payload.protocolVersion), true);
});

test('an offer of protocol version 2 binds its attempt to a new or resumed agent session', () => {
  const offer = (payload: object, protocolVersion = SESSION_PROTOCOL_VERSION) =>
    checkMessageSchema('AssignmentOfferCommand', command('execution.assignment.offer', { ...OFFER, ...payload }, protocolVersion));
  const binding = SCHEMAS.AssignmentSessionBinding as { required: string[]; properties: Record<string, Json> };
  const { model: _model, ...withoutModel } = BINDING;
  const { effort: _effort, ...withoutEffort } = BINDING;

  assert.deepEqual([...binding.required].sort(), ['effort', 'harness', 'model', 'sessionId']);
  assert.deepEqual(binding.properties.sessionId, { $ref: '#/components/schemas/AgentSessionId' });
  assert.ok(offer({ session: BINDING }).ok);
  assert.ok(offer({ session: { ...BINDING, resume: RESUME } }).ok);
  assert.ok(violations(offer({})).some((text) => text.includes('session')));
  assert.ok(violations(offer({ session: withoutModel })).some((text) => text.includes('model')));
  assert.ok(violations(offer({ session: withoutEffort })).some((text) => text.includes('effort')));
  assert.ok(!offer({ session: { ...BINDING, resume: { ...RESUME, generation: 1 } } }).ok);
  assert.ok(offer({}, 1).ok);
  assert.ok(!offer({ session: BINDING }, 1).ok);
});

test('the session binding of an offer carries no credential, which keeps its own channel', () => {
  const offer = (session: object) => checkMessageSchema('AssignmentOfferCommand', command('execution.assignment.offer', { ...OFFER, session }));
  const binding = SCHEMAS.AssignmentSessionBinding as { properties: Record<string, Json> };

  assert.deepEqual(Object.keys(binding.properties).sort(), ['effort', 'harness', 'model', 'resume', 'sessionId']);
  for (const name of SECRET_SCHEMAS) assert.ok(!reachableNames(binding).has(name), name);
  assert.ok(violations(offer({ ...BINDING, secret: 'slot secret' })).some((text) => text.includes('"secret"')));
  assert.ok(violations(offer({ ...BINDING, resume: { ...RESUME, slotCredential: 'token' } })).some((text) => text.includes('"slotCredential"')));
});

test('a turn travels with its immutable identity, position, author, and recorded text', () => {
  const host = { ...TURN, turn: { ...TURN.turn, author: { kind: 'host', delegationRequest: REQUEST } } };
  const { turnId: _turnId, ...anonymous } = TURN.turn;

  assert.ok(checkMessageSchema('TurnDeliveryCommand', command('session.turn.deliver', host)).ok);
  assert.ok(violations(checkMessageSchema('TurnDeliveryCommand', command('session.turn.deliver', { ...TURN, turn: anonymous }))).some((text) => text.includes('turnId')));
  assert.ok(!checkMessageSchema('TurnDeliveryCommand', command('session.turn.deliver', { ...TURN, turn: { ...TURN.turn, text: '' } })).ok);
  assert.ok(!checkMessageSchema('TurnDeliveryCommand', command('session.turn.deliver', { ...TURN, turn: { ...TURN.turn, text: 'x'.repeat(65_537) } })).ok);
});

test('a response comes from an approver, a principal or a standing rule, and never from the host', () => {
  const deliver = (payload: object) => checkMessageSchema('ResponseDeliveryCommand', command('session.response.deliver', payload));
  const rule = { kind: 'standing-rule', ruleId: 'rule-1' };

  assert.ok(deliver(PERMISSION).ok);
  assert.ok(deliver({ ...PERMISSION, responder: rule }).ok);
  assert.ok(deliver({ ...PERMISSION, answer: { kind: 'input', text: 'main' } }).ok);
  assert.ok(!deliver({ ...PERMISSION, responder: { kind: 'host' } }).ok);
  assert.ok(!deliver({ ...PERMISSION, answer: { kind: 'input', text: 'main' }, responder: rule }).ok);
  assert.ok(!deliver({ ...PERMISSION, answer: { kind: 'delegation-result', delegationId: 'delegation-1', outcome: 'completed', summary: '' } }).ok);
  const { responder: _responder, ...unattributed } = PERMISSION;
  assert.ok(violations(deliver(unattributed)).some((text) => text.includes('responder')));
});

test('a delegation result returns to its request only once the child ended, with the 9c result schema', () => {
  const deliver = (result: object) => checkMessageSchema('DelegationResultDeliveryCommand', command('session.delegation-result.deliver', { sessionId: 'session-1', request: REQUEST, result }));
  const pending = { state: 'pending', delegationId: 'delegation-1', attemptId: 'attempt-1', parentTaskId: 'task-1', childTaskId: 'task-2' };
  const execution = JSON.parse(readFileSync(new URL('../documents/execution.openapi.json', import.meta.url), 'utf8')).components.schemas;

  assert.ok(deliver(ENDED).ok);
  assert.ok(!deliver(pending).ok);
  for (const name of ['DelegationResult', 'DelegationSummary', 'DelegationResultOutcome']) assert.deepEqual(SCHEMAS[name], execution[name], name);
});

test('a refreshed SCM credential travels as a notice of its run, identity, and version only', () => {
  const notice = (payload: object) => checkMessageSchema('ScmCredentialRefreshedCommand', command('execution.scm-credential.refreshed', payload));

  assert.deepEqual(Object.keys((SCHEMAS.ScmCredentialRefreshedPayload as { properties: Json }).properties).sort(), ['credentialId', 'protocolVersion', 'runId', 'version']);
  assert.ok(notice(NOTICE).ok);
  assert.ok(violations(notice({ ...NOTICE, secret: 'scm secret' })).some((text) => text.includes('"secret"')));
  assert.ok(violations(notice({ ...NOTICE, authorization: 'Basic eDp5' })).some((text) => text.includes('"authorization"')));
});

test('no execution message can carry a credential, a secret, or an example', () => {
  const messages = Object.values(EXECUTION.components.messages).map(({ payload }) => payload);

  for (const name of SECRET_SCHEMAS) assert.ok(!reachableNames(messages).has(name), name);
  const text = JSON.stringify(EXECUTION);
  assert.ok(!/"examples?"\s*:/.test(text));
  for (const property of ['"secret"', '"authorization"', '"credential"', '"token"']) assert.ok(!text.includes(`${property}:`), property);
});

test('the worker confirms the adoption of a refreshed version, or says why it kept its current one', () => {
  const adopted = (payload: object) => checkMessageSchema('ScmCredentialAdoptedObservation', observation('execution.scm-credential.adopted', payload));
  const notAdopted = SCHEMAS.ScmCredentialNotAdoptedPayload as Json;

  assert.ok(adopted(NOTICE).ok);
  assert.ok(violations(adopted({ ...NOTICE, secret: 'scm secret' })).some((text) => text.includes('"secret"')));
  assert.deepEqual(enumAt(notAdopted, 'properties', 'reason'), ['fetch-refused', 'superseded', 'attempt-not-held']);
});

test('a turn ends with one outcome of the port, with a failure exactly when it failed', () => {
  const ended = (payload: object) => checkMessageSchema('TurnEndedObservation', observation('session.turn.ended', payload));
  const base = { sessionId: 'session-1', turnId: 't1', generation: 2 };
  const variants = (SCHEMAS.TurnEndedPayload as { oneOf: Json[] }).oneOf;

  assert.deepEqual(variants.flatMap((variant) => enumAt(variant, 'properties', 'outcome')).sort(), [...TURN_OUTCOMES].sort());
  assert.deepEqual(enumAt(SCHEMAS.HarnessFailure!), [...HARNESS_FAILURES]);
  assert.ok(ended({ ...base, outcome: 'failed', failure: 'transport' }).ok);
  assert.ok(!ended({ ...base, outcome: 'failed' }).ok);
  assert.ok(!ended({ ...base, outcome: 'completed', failure: 'transport' }).ok);
});

test('a delivery report is one of the timeline\'s reports and never pending', () => {
  const report = enumAt(SCHEMAS.ResponseDeliveryReportedPayload!, 'properties', 'report');

  assert.deepEqual(report, DELIVERY_STATES.filter((state) => state !== 'pending'));
});

test('the largest session message fits the broker payload limit', () => {
  const wide = '\u{1F600}'.repeat(65_536);
  const largest = [
    command('session.turn.deliver', { ...TURN, turn: { ...TURN.turn, text: wide } }),
    command('session.response.deliver', { ...PERMISSION, answer: { kind: 'permission', decision: 'deny', message: wide } }),
    command('session.delegation-result.deliver', { sessionId: 'session-1', request: REQUEST, result: { ...ENDED, summary: wide } }),
    observation('session.request.recorded', { ...OBSERVATION_EXAMPLES['session.request.recorded']!, text: wide }),
    observation('session.output.appended', { ...OBSERVATION_EXAMPLES['session.output.appended']!, text: wide }),
  ];

  for (const message of largest) assert.ok(Buffer.byteLength(JSON.stringify(message)) < ONE_MEBIBYTE);
  assert.ok(checkMessageSchema('OutputAppendedObservation', largest[4]).ok);
});
