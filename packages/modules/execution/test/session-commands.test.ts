import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant, type Result } from '@taskelith/kernel';
import {
  InMemorySessionTimelineStore,
  OPERATION_NOT_MATCHED,
  SessionTimelineService,
  type ClassifiedPush,
  type DelegationOutcome,
  type IdempotencyKey,
  type NeedsYouItemId,
  type RequestKey,
  type ResponseCommand,
  type ResponseSubmission,
  type SessionId,
  type WrittenSessionCommand,
} from '@taskelith/execution';
import { failed, sequentialIds, value } from '@taskelith/testing';
import {
  COMMAND_DEPENDENCIES,
  FIRST_ATTEMPT,
  FLIPPING_CIPHER,
  HARNESS,
  NATIVE,
  OWNERSHIP,
  PERSON,
  SESSION,
  TASK,
  allow,
  binding,
  generation,
  permissionRequest,
  requestKey,
  trailingRunRedactor,
  turnId,
  turnKey,
} from './session-fixtures.ts';

const CLOCK = { now: () => value(parseInstant('2026-11-10T09:00:00.000Z')) };
const TASK_REF = `refs/heads/task-branch-of-${TASK}`;
const TASK_PUSH: ClassifiedPush = { kind: 'push', ref: TASK_REF };
const RULE = { kind: 'standing-rule' as const, ruleId: value(parseIdentifier('StandingRuleId', 'rule-1')) };

function timeline() {
  const store = new InMemorySessionTimelineStore();
  const unread: string[] = [];
  const service = new SessionTimelineService({
    store, digest: { digest: (input) => `digest:${input}` }, redactor: { redact: (text) => text }, outputRedactor: trailingRunRedactor((text) => text),
    tailCipher: FLIPPING_CIPHER, turnIds: sequentialIds('TurnId', 'turn'), clock: CLOCK, itemIds: sequentialIds('NeedsYouItemId', 'item'),
    ...COMMAND_DEPENDENCIES, commandLog: { turnWithoutReader: ({ turnId: unreadTurn }) => unread.push(unreadTurn) },
  });
  return { store, service, unread };
}

type Timeline = ReturnType<typeof timeline>;

const key = (text: string) => turnKey(text) as IdempotencyKey;
const submit = (text = 'a task') => ({ author: PERSON, text });

async function open({ service }: Timeline, id: SessionId = SESSION): Promise<void> {
  value(await service.openSession({ id, taskId: TASK, harness: HARNESS }));
  value(await service.bindAttempt(id, binding()));
}

async function started(subject: Timeline, at = 1): Promise<void> {
  value(await subject.service.startGeneration(SESSION, { generation: generation(at), nativeSessionId: NATIVE }));
}

async function submitted({ service }: Timeline, name: string, id: SessionId = SESSION) {
  return value(await service.submitTurn(id, { key: key(name), ...submit(`text of ${name}`) })).turn;
}

const turnCommands = ({ store }: Timeline) => store.writtenCommands().filter((written) => written.command.commandType === 'session.turn.deliver');
const responseCommands = ({ store }: Timeline) => store.writtenCommands().filter((written) => written.command.commandType === 'session.response.deliver');

async function storedSession({ store }: Timeline, id: SessionId = SESSION) {
  return value(await store.transaction((tx) => tx.sessions.get(id)))!.session;
}

function turnIdsOf(commands: readonly WrittenSessionCommand[]): readonly unknown[] {
  return commands.map(({ command }) => (command.payload.turn as { turnId: string }).turnId);
}

// A session running the turn `turn-1` of generation 1 with the open request
// `request-1`, recorded with the given classified operation.
async function withOpenRequest(subject: Timeline, operation?: ClassifiedPush): Promise<void> {
  await open(subject);
  await started(subject);
  await submitted(subject, 'key-1');
  value(await subject.service.deliverTurn(SESSION, { turnId: turnId('turn-1'), generation: generation(1) }));
  value(await subject.service.recordRequest(SESSION, { ...permissionRequest('request-1'), ...(operation === undefined ? {} : { operation }) }));
}

function response(name: string, submission: ResponseSubmission = allow()): ResponseCommand {
  return { key: key(name), response: submission };
}

const byRule = (submission = allow()): ResponseSubmission => ({ ...submission, responder: RULE });

async function firstItem({ store }: Timeline): Promise<NeedsYouItemId> {
  return value(await store.transaction((tx) => tx.items.find(SESSION, 'permission-request', requestKey('request-1'))))!.id;
}

async function requestState(subject: Timeline, at: RequestKey = requestKey('request-1')) {
  return (await storedSession(subject)).requests.find((request) => request.key.nativeRequestId === at.nativeRequestId)?.state;
}

test('a turn queued while the generation idles commits its delivery command with it', async () => {
  const subject = timeline();
  await open(subject);
  await started(subject);

  const turn = await submitted(subject, 'key-1');

  const [written] = turnCommands(subject);
  assert.equal(subject.store.writtenCommands().length, 1);
  assert.deepEqual(written!.command, {
    commandId: `cdigest:${JSON.stringify(['session.turn.deliver', SESSION, turn.id, 1])}`,
    commandType: 'session.turn.deliver',
    sessionId: SESSION,
    attemptId: FIRST_ATTEMPT,
    ownershipGeneration: OWNERSHIP,
    payload: { sessionId: SESSION, generation: 1, turn: { turnId: turn.id, position: 1, author: PERSON, text: 'text of key-1' } },
  });
  assert.deepEqual((await storedSession(subject)).turns[0]!.deliveryCommands, [{ generation: 1, commandId: written!.command.commandId }]);
});

test('a generation start commits the delivery of the earliest queued turn only', async () => {
  const subject = timeline();
  await open(subject);
  const first = await submitted(subject, 'key-1');
  await submitted(subject, 'key-2');
  assert.deepEqual(subject.store.writtenCommands(), []);

  await started(subject);

  assert.deepEqual(turnIdsOf(turnCommands(subject)), [first.id]);
});

test('the running turn\'s end commits the delivery of the next turn', async () => {
  const subject = timeline();
  await open(subject);
  await started(subject);
  const first = await submitted(subject, 'key-1');
  const second = await submitted(subject, 'key-2');
  value(await subject.service.deliverTurn(SESSION, { turnId: first.id, generation: generation(1) }));

  value(await subject.service.recordTurnOutcome(SESSION, { turnId: first.id, generation: generation(1), outcome: 'completed' }));

  assert.deepEqual(turnIdsOf(turnCommands(subject)), [first.id, second.id]);
});

test('a refused turn commits the delivery of the next turn at once', async () => {
  const subject = timeline();
  await open(subject);
  await started(subject);
  const first = await submitted(subject, 'key-1');
  const second = await submitted(subject, 'key-2');

  value(await subject.service.recordTurnRefused(SESSION, { turnId: first.id, generation: generation(1) }));

  assert.deepEqual(turnIdsOf(turnCommands(subject)), [first.id, second.id]);
});

test('a host\'s turn travels with its delegation request', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  value(await subject.service.recordRequest(SESSION, { key: requestKey('delegation-1'), kind: 'delegation-request', turnId: turnId('turn-1'), text: 'split it' }));
  value(await subject.service.recordTurnOutcome(SESSION, { turnId: turnId('turn-1'), generation: generation(1), outcome: 'completed' }));
  const host = { kind: 'host' as const, delegationRequest: requestKey('delegation-1') };

  value(await subject.service.submitTurn(SESSION, { key: key('host-1'), author: host, text: 'the child ended' }));

  const payload = turnCommands(subject).at(-1)!.command.payload as { turn: { author: unknown } };
  assert.deepEqual(payload.turn.author, { kind: 'host', delegationRequest: { generation: 1, nativeRequestId: 'delegation-1' } });
});

test('another change while the turn stays queued writes nothing and keeps the stored ID', async () => {
  const subject = timeline();
  await open(subject);
  await started(subject);
  const turn = await submitted(subject, 'key-1');
  const [written] = subject.store.writtenCommands();

  await submitted(subject, 'key-2');

  assert.deepEqual(subject.store.writtenCommands(), [written]);
  const stored = (await storedSession(subject)).turns.find((candidate) => candidate.id === turn.id);
  assert.deepEqual(stored?.deliveryCommands, [{ generation: 1, commandId: written!.command.commandId }]);
});

test('a turn not delivered in one generation gets a new command with a new ID in the next', async () => {
  const subject = timeline();
  await open(subject);
  await started(subject);
  const turn = await submitted(subject, 'key-1');
  const [first] = subject.store.writtenCommands();

  value(await subject.service.endGeneration(SESSION, generation(1)));
  await started(subject, 2);

  const commands = turnCommands(subject);
  assert.deepEqual(turnIdsOf(commands), [turn.id, turn.id]);
  assert.notEqual(commands[0]!.command.commandId, commands[1]!.command.commandId);
  assert.equal(commands[1]!.command.payload.generation, 2);
  assert.deepEqual((await storedSession(subject)).turns[0]!.deliveryCommands, [
    { generation: 1, commandId: first!.command.commandId },
    { generation: 2, commandId: commands[1]!.command.commandId },
  ]);
});

test('a stored ID survives the turn\'s transitions', async () => {
  const subject = timeline();
  await open(subject);
  await started(subject);
  const turn = await submitted(subject, 'key-1');

  value(await subject.service.deliverTurn(SESSION, { turnId: turn.id, generation: generation(1) }));
  value(await subject.service.recordTurnOutcome(SESSION, { turnId: turn.id, generation: generation(1), outcome: 'completed' }));

  assert.equal((await storedSession(subject)).turns[0]!.deliveryCommands?.length, 1);
});

test('a change that fails writes no command, and neither does a turn whose acceptance is unknown or a stopped session', async () => {
  const subject = timeline();
  await open(subject);
  await started(subject);
  const first = await submitted(subject, 'key-1');
  const second = await submitted(subject, 'key-2');
  const before = subject.store.writtenCommands();

  failed(await subject.service.recordTurnOutcome(SESSION, { turnId: first.id, generation: generation(1), outcome: 'completed' }));
  value(await subject.service.recordTurnAcceptanceUnknown(SESSION, { turnId: first.id, generation: generation(1) }));
  assert.deepEqual(subject.store.writtenCommands(), before);

  value(await subject.service.endGeneration(SESSION, generation(1)));
  await started(subject, 2);
  assert.deepEqual(turnIdsOf(subject.store.writtenCommands().slice(before.length)), [second.id]);

  const stopped = timeline();
  await open(stopped);
  await submitted(stopped, 'key-1');
  value(await stopped.service.recordLimitSignal(SESSION, {}));
  failed(await stopped.service.startGeneration(SESSION, { generation: generation(1), nativeSessionId: NATIVE }));
  assert.deepEqual(stopped.store.writtenCommands(), []);
});

test('a stopped session writes no turn command but still delivers a response to its current turn', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  await submitted(subject, 'key-2');
  value(await subject.service.recordLimitSignal(SESSION, {}));

  value(await subject.service.consumeResponse(SESSION, response('answer-1')));

  assert.equal(responseCommands(subject).length, 1);
  assert.equal(turnCommands(subject).length, 1, 'only the turn delivered before the stop');
});

test('consuming a response writes one delivery command, and a repeat with its key writes none', async () => {
  const subject = timeline();
  await withOpenRequest(subject);

  value(await subject.service.consumeResponse(SESSION, response('answer-1', allow())));
  value(await subject.service.consumeResponse(SESSION, response('answer-1', allow())));

  const commands = responseCommands(subject);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0]!.command, {
    commandId: `cdigest:${JSON.stringify(['session.response.deliver', SESSION, 1, 'request-1'])}`,
    commandType: 'session.response.deliver',
    sessionId: SESSION,
    attemptId: FIRST_ATTEMPT,
    ownershipGeneration: OWNERSHIP,
    payload: {
      sessionId: SESSION, request: { generation: 1, nativeRequestId: 'request-1' },
      answer: { kind: 'permission', decision: 'allow' }, responder: PERSON,
    },
  });
  const request = (await storedSession(subject)).requests[0]!;
  assert.equal(request.state === 'answered' && request.response.commandId, commands[0]!.command.commandId);
});

test('an inbox answer writes one delivery command, and a repeat with its key writes none', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  const item = await firstItem(subject);

  value(await subject.service.answerItem(item, response('inbox-1', allow())));
  value(await subject.service.answerItem(item, response('inbox-1', allow())));

  assert.equal(responseCommands(subject).length, 1);
});

test('a principal\'s input answer travels with its text and a permission with its message', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  value(await subject.service.recordRequest(SESSION, { key: requestKey('input-1'), kind: 'input-request', turnId: turnId('turn-1'), text: 'a name?' }));

  const inputResponse: ResponseSubmission = { ...allow('input-1'), answer: { kind: 'input', text: 'taskelith' } };
  value(await subject.service.consumeResponse(SESSION, response('answer-input', inputResponse)));
  value(await subject.service.consumeResponse(SESSION, response('answer-message', { ...allow(), answer: { kind: 'permission', decision: 'deny', message: 'no' } })));

  assert.deepEqual(responseCommands(subject).map(({ command }) => command.payload.answer), [
    { kind: 'input', text: 'taskelith' }, { kind: 'permission', decision: 'deny', message: 'no' },
  ]);
});

test('the host\'s delegation result writes no response command', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  value(await subject.service.recordRequest(SESSION, { key: requestKey('delegation-1'), kind: 'delegation-request', turnId: turnId('turn-1'), text: 'split it' }));
  const outcome: DelegationOutcome = 'completed';
  const result: ResponseSubmission = {
    request: requestKey('delegation-1'), answer: { kind: 'delegation-result', delegationId: 'child', outcome, summary: 'done' }, responder: { kind: 'host' },
    attemptId: FIRST_ATTEMPT, ownershipGeneration: OWNERSHIP,
  };

  value(await subject.service.consumeResponse(SESSION, response('host-1', result)));

  assert.deepEqual(responseCommands(subject), []);
  const held = (await storedSession(subject)).requests.find((request) => request.key.nativeRequestId === 'delegation-1')!;
  assert.equal(held.state === 'answered' && held.response.commandId, undefined);
});

test('a standing rule answers a push to the task\'s own branch', async () => {
  const subject = timeline();
  await withOpenRequest(subject, TASK_PUSH);

  value(await subject.service.consumeResponse(SESSION, response('rule-1', byRule())));

  assert.equal(await requestState(subject), 'answered');
  assert.equal(responseCommands(subject).length, 1);
});

for (const [case_, operation] of [
  ['a push to another branch', { kind: 'push', ref: 'refs/heads/other' }],
  ['a push to the default branch', { kind: 'push', ref: 'refs/heads/main' }],
  ['no classified operation', undefined],
] as const) {
  test(`a standing rule cannot answer ${case_}: the request stays open and nothing is written`, async () => {
    const subject = timeline();
    await withOpenRequest(subject, operation);

    const refused = failed(await subject.service.consumeResponse(SESSION, response('rule-1', byRule())));

    assert.deepEqual([refused.code, refused.details.reason], ['precondition-failed', OPERATION_NOT_MATCHED]);
    assert.equal(await requestState(subject), 'open');
    assert.deepEqual(responseCommands(subject), []);
    assert.deepEqual(subject.store.auditEvents(), []);
    assert.equal(value(await subject.store.transaction((tx) => tx.idempotency.find(SESSION, 'response:1:request-1', key('rule-1')))), undefined);
  });
}

test('the operation check does not apply to a person, whose answer reaches the same request', async () => {
  const subject = timeline();
  await withOpenRequest(subject);

  value(await subject.service.consumeResponse(SESSION, response('answer-1', allow())));

  assert.equal(await requestState(subject), 'answered');
});

test('a standing rule\'s answer to an unknown or already answered request keeps the codes of the earlier rules', async () => {
  const unknown = timeline();
  await withOpenRequest(unknown);
  const unknownRefusal = failed(await unknown.service.consumeResponse(SESSION, response('rule-1', { ...byRule(), request: requestKey('never-recorded') })));
  assert.deepEqual([unknownRefusal.code, unknownRefusal.details.reason], ['not-found', undefined]);

  const answered = timeline();
  await withOpenRequest(answered, TASK_PUSH);
  value(await answered.service.consumeResponse(SESSION, response('rule-1', byRule())));
  const alreadyAnswered = failed(await answered.service.consumeResponse(SESSION, response('rule-2', byRule())));
  assert.deepEqual(alreadyAnswered.code, 'conflict');

  const expired = timeline();
  await withOpenRequest(expired);
  value(await expired.service.recordTurnOutcome(SESSION, { turnId: turnId('turn-1'), generation: generation(1), outcome: 'completed' }));
  assert.equal(failed(await expired.service.consumeResponse(SESSION, response('rule-1', byRule()))).code, 'not-found');
});

test('the operation refusal precedes the unavailable response of a request that no worker can read', async () => {
  const subject = timeline();
  await withOpenRequest(subject);
  subject.store.removeReaderOf(FIRST_ATTEMPT);

  const refused = failed(await subject.service.consumeResponse(SESSION, response('rule-1', byRule())));

  assert.equal(refused.details.reason, OPERATION_NOT_MATCHED);
});

test('a due turn without a reader commits with no command and no stored ID, and logs it once with identifiers', async () => {
  const subject = timeline();
  await open(subject);
  subject.store.removeReaderOf(FIRST_ATTEMPT);
  await started(subject);

  const turn = await submitted(subject, 'key-1');

  assert.deepEqual(subject.store.writtenCommands(), []);
  assert.equal((await storedSession(subject)).turns[0]!.deliveryCommands, undefined);
  assert.deepEqual(subject.unread, [turn.id]);
  assert.equal((await storedSession(subject)).turns[0]!.state, 'queued');
});

const ANSWER_PATHS: readonly (readonly [string, (subject: Timeline) => Promise<Result<unknown>>])[] = [
  ['consumeResponse', (subject) => subject.service.consumeResponse(SESSION, response('answer-1', allow()))],
  ['answerItem', async (subject) => subject.service.answerItem(await firstItem(subject), response('answer-1', allow()))],
];

for (const [path, answer] of ANSWER_PATHS) {
  test(`${path} of a response without a reader is unavailable, leaves the request open, and records no key`, async () => {
    const subject = timeline();
    await withOpenRequest(subject);
    subject.store.removeReaderOf(FIRST_ATTEMPT);

    const refused = failed(await answer(subject));

    assert.equal(refused.code, 'unavailable');
    assert.equal(await requestState(subject), 'open');
    assert.deepEqual(responseCommands(subject), []);
    const scope = path === 'consumeResponse' ? 'response:1:request-1' : `item:${await firstItem(subject)}`;
    assert.equal(value(await subject.store.transaction((tx) => tx.idempotency.find(SESSION, scope, key('answer-1')))), undefined);
    assert.deepEqual(subject.unread, []);
  });
}

test('a stored session whose queued turn has neither an ID nor a command, as before these fields, is written on its next change', async () => {
  const subject = timeline();
  await open(subject);
  await submitted(subject, 'key-1');
  const old = value(await subject.store.transaction((tx) => tx.sessions.get(SESSION)))!;
  const running = { generation: generation(1), attemptId: FIRST_ATTEMPT, ended: false };
  value(await subject.store.transaction((tx) => tx.sessions.replace(old, { ...old.session, nativeSessionId: NATIVE, generations: [running] })));
  assert.deepEqual(subject.store.writtenCommands(), []);
  assert.equal((await storedSession(subject)).turns[0]!.deliveryCommands, undefined);

  await submitted(subject, 'key-2');

  assert.deepEqual(turnIdsOf(turnCommands(subject)), ['turn-1']);
  assert.equal((await storedSession(subject)).turns[0]!.deliveryCommands?.length, 1);
});

test('a written command whose stored ID was lost is refused by the outbox and the change rolls back', async () => {
  const subject = timeline();
  await open(subject);
  await started(subject);
  await submitted(subject, 'key-1');
  const old = value(await subject.store.transaction((tx) => tx.sessions.get(SESSION)))!;
  const { deliveryCommands: _lost, ...withoutId } = old.session.turns[0]!;
  value(await subject.store.transaction((tx) => tx.sessions.replace(old, { ...old.session, turns: [withoutId] })));

  const repeated = failed(await subject.service.submitTurn(SESSION, { key: key('key-2'), ...submit('text of key-2') }));

  assert.equal(repeated.code, 'conflict');
  assert.equal(turnCommands(subject).length, 1);
  assert.equal((await storedSession(subject)).turns.length, 1, 'the change rolled back');
});

test('a recorded classified operation is stored, and a repeat with another operation is a conflict', async () => {
  const subject = timeline();
  await withOpenRequest(subject, TASK_PUSH);

  value(await subject.service.recordRequest(SESSION, { ...permissionRequest('request-1'), operation: TASK_PUSH }));
  const other = failed(await subject.service.recordRequest(SESSION, { ...permissionRequest('request-1'), operation: { kind: 'push', ref: 'refs/heads/other' } }));

  assert.equal(other.code, 'conflict');
  assert.deepEqual((await storedSession(subject)).requests[0]!.operation, TASK_PUSH);
});

test('a request recorded without an operation keeps the digest it held before operations existed', async () => {
  const subject = timeline();
  await withOpenRequest(subject);

  const held = value(await subject.store.transaction((tx) => tx.idempotency.find(SESSION, 'request:1', permissionRequest('request-1').key.nativeRequestId)))!;

  assert.equal(held.digest, `digest:${JSON.stringify(['request', 'permission-request', 'turn-1', 'may I request-1'])}`);
});
