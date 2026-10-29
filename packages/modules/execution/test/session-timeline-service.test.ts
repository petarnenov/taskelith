import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant } from '@taskelith/kernel';
import {
  ALREADY_ANSWERED,
  InMemorySessionTimelineStore,
  MAX_HARNESS_TEXT_LENGTH,
  MAX_INPUT_ANSWER_BYTES,
  SessionTimelineService,
  type HarnessRequestKind,
  type IdempotencyKey,
  type ResponseCommand,
  type SessionId,
  type TurnAuthor,
  type TurnCommand,
} from '@taskelith/execution';
import { failed, sequentialIds, value } from '@taskelith/testing';
import { evidence, ownership } from './fixtures.ts';
import {
  FIRST_ATTEMPT,
  FLIPPING_CIPHER,
  HARNESS,
  NATIVE,
  OTHER_SESSION,
  PERSON,
  SECOND_ATTEMPT,
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

const FIXED_CLOCK = { now: () => value(parseInstant('2026-10-29T09:00:00.000Z')) };
const OTHER_PERSON: TurnAuthor = { kind: 'principal', principalId: value(parseIdentifier('PrincipalId', 'person-2')) };

// Redacts each word that starts with SECRET, and digests the input as it is,
// so that two inputs that redact alike keep distinct digests.
const redactor = { redact: (text: string) => text.replaceAll(/SECRET\S*/g, '[redacted]') };
// Longer than its bound, it redacts to a text within the bound.
const OVERLONG_SECRET = `SECRET${'x'.repeat(MAX_HARNESS_TEXT_LENGTH)}`;
const digest = { digest: (input: string) => `digest:${input}` };
// Within its bound, it redacts past the bound, as each SECRET grows by 4.
const LENGTHENED = 'SECRET '.repeat(Math.floor(MAX_HARNESS_TEXT_LENGTH / 7));
const LENGTHENED_REDACTED = redactor.redact(LENGTHENED);

function timeline(store = new InMemorySessionTimelineStore()) {
  const service = new SessionTimelineService({
    store, digest, redactor, outputRedactor: trailingRunRedactor(redactor.redact), tailCipher: FLIPPING_CIPHER,
    turnIds: sequentialIds('TurnId', 'turn'), clock: FIXED_CLOCK, itemIds: sequentialIds('NeedsYouItemId', 'item'),
  });
  return { store, service };
}

const turn = (key: string, text = `text of ${key}`, author: TurnAuthor = PERSON): TurnCommand => ({ key: turnKey(key), author, text });
const response = (key: string, submission = allow()): ResponseCommand => ({ key: turnKey(key) as IdempotencyKey, response: submission });

// SESSION of TASK with FIRST_ATTEMPT bound and generation 1 running.
async function running(service: SessionTimelineService, id: SessionId = SESSION): Promise<void> {
  value(await service.openSession({ id, taskId: TASK, harness: HARNESS }));
  value(await service.bindAttempt(id, binding()));
  value(await service.startGeneration(id, { generation: generation(1), nativeSessionId: NATIVE }));
}

// Generation 1 runs `turn-1` with the open request `request-1` of the kind.
async function withOpenRequest(service: SessionTimelineService, kind: HarnessRequestKind = 'permission-request'): Promise<void> {
  await running(service);
  value(await service.submitTurn(SESSION, turn('key-1')));
  value(await service.deliverTurn(SESSION, { turnId: turnId('turn-1'), generation: generation(1) }));
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-1'), kind }));
}

async function stored(store: InMemorySessionTimelineStore, id: SessionId = SESSION) {
  return value(await store.transaction((tx) => tx.sessions.get(id)))!;
}

test('an opened session reads back without its output window', async () => {
  const { service } = timeline();
  value(await service.openSession({ id: SESSION, taskId: TASK, harness: HARNESS }));
  const view = value(await service.readSession(SESSION));
  assert.equal(view.id, SESSION);
  assert.equal('output' in view, false);
});

test('a session ID is opened once, and an unknown session fails with not-found', async () => {
  const { service } = timeline();
  value(await service.openSession({ id: SESSION, taskId: TASK, harness: HARNESS }));
  assert.equal(failed(await service.openSession({ id: SESSION, taskId: TASK, harness: HARNESS })).code, 'conflict');
  assert.equal(failed(await service.readSession(OTHER_SESSION)).code, 'not-found');
  assert.equal(failed(await service.submitTurn(OTHER_SESSION, turn('key-1'))).code, 'not-found');
});

test('a submitted turn gets a minted turn ID and its redacted text, and is recorded', async () => {
  const { service } = timeline();
  await running(service);
  const submitted = value(await service.submitTurn(SESSION, turn('key-1', 'use SECRET')));
  assert.equal(submitted.effect, 'recorded');
  assert.deepEqual([submitted.turn.id, submitted.turn.text, submitted.turn.position], ['turn-1', 'use [redacted]', 1]);
  assert.equal('output' in submitted.session, false);
});

test('a retried submission with the same key, author, and text is a duplicate of the one turn', async () => {
  const { service, store } = timeline();
  await running(service);
  value(await service.submitTurn(SESSION, turn('key-1', 'use SECRET')));
  const retry = value(await service.submitTurn(SESSION, turn('key-1', 'use SECRET')));
  assert.deepEqual([retry.effect, retry.turn.id], ['duplicate', 'turn-1']);
  assert.equal((await stored(store)).session.turns.length, 1);
});

test('the same key and text from another author fails with conflict idempotency-key-reused and adds no turn', async () => {
  const { service, store } = timeline();
  await running(service);
  value(await service.submitTurn(SESSION, turn('key-1')));
  const reused = failed(await service.submitTurn(SESSION, turn('key-1', 'text of key-1', OTHER_PERSON)));
  assert.deepEqual([reused.code, reused.details.reason], ['conflict', 'idempotency-key-reused']);
  assert.equal((await stored(store)).session.turns.length, 1);
});

test('one key with two texts that redact alike fails with conflict idempotency-key-reused', async () => {
  const { service, store } = timeline();
  await running(service);
  value(await service.submitTurn(SESSION, turn('key-1', 'SECRET')));
  const reused = failed(await service.submitTurn(SESSION, turn('key-1', '[redacted]')));
  assert.deepEqual([reused.code, reused.details.reason], ['conflict', 'idempotency-key-reused']);
  assert.equal((await stored(store)).session.turns.length, 1);
});

test('turn text outside its bound fails with invalid, also for a stored key', async () => {
  const { service } = timeline();
  await running(service);
  value(await service.submitTurn(SESSION, turn('key-1')));
  assert.equal(failed(await service.submitTurn(SESSION, turn('key-1', ''))).code, 'invalid');
  assert.equal(failed(await service.submitTurn(SESSION, turn('key-2', ''))).code, 'invalid');
});

test('a submission the domain refuses stores no key, so the key later records a turn', async () => {
  const { service } = timeline();
  await running(service);
  const host: TurnAuthor = { kind: 'host', delegationRequest: requestKey('request-9') };
  assert.equal(failed(await service.submitTurn(SESSION, turn('key-1', 'child done', host))).code, 'not-found');
  assert.equal(value(await service.submitTurn(SESSION, turn('key-1', 'child done'))).effect, 'recorded');
});

test('a native request is recorded with redacted text, once, and listed as awaiting its answer', async () => {
  const { service, store } = timeline();
  await withOpenRequest(service);
  const before = await stored(store);
  value(await service.recordRequest(SESSION, permissionRequest('request-1')));
  assert.equal((await stored(store)).version, before.version);
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-2'), text: 'read SECRET' }));
  const awaiting = value(await service.requestsAwaitingAnswer(SESSION));
  assert.deepEqual(awaiting.map((request) => [request.key.nativeRequestId, request.text]), [['request-1', 'may I request-1'], ['request-2', 'read [redacted]']]);
});

test('a native request key repeated with a text that redacts alike fails with conflict and changes nothing', async () => {
  const { service, store } = timeline();
  await withOpenRequest(service);
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-2'), text: 'read SECRET-1' }));
  const before = await stored(store);
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-2'), text: 'read SECRET-1' }));
  const reused = failed(await service.recordRequest(SESSION, { ...permissionRequest('request-2'), text: 'read SECRET-2' }));
  assert.deepEqual([reused.code, reused.details.reason], ['conflict', undefined]);
  assert.deepEqual(await stored(store), before);
});

test('native request text longer than its bound before redaction fails with invalid and records nothing', async () => {
  const { service, store } = timeline();
  await withOpenRequest(service);
  const before = await stored(store);
  const overlong = failed(await service.recordRequest(SESSION, { ...permissionRequest('request-2'), text: OVERLONG_SECRET }));
  assert.equal(overlong.code, 'invalid');
  assert.deepEqual(await stored(store), before);
});

test('a response is consumed once, with its message redacted; its key repeated returns the answered request', async () => {
  const { service, store } = timeline();
  await withOpenRequest(service);
  const answer = allow();
  const withMessage = { ...answer, answer: { kind: 'permission' as const, decision: 'allow' as const, message: 'ok SECRET' } };
  const answered = value(await service.consumeResponse(SESSION, response('answer-1', withMessage)));
  assert.equal(answered.state, 'answered');
  assert.deepEqual(answered.state === 'answered' && answered.response.answer, { kind: 'permission', decision: 'allow', message: 'ok [redacted]' });
  const version = (await stored(store)).version;
  assert.deepEqual(value(await service.consumeResponse(SESSION, response('answer-1', withMessage))), answered);
  assert.equal((await stored(store)).version, version);
});

test('a response key reused with another answer or responder fails with conflict idempotency-key-reused', async () => {
  const { service } = timeline();
  await withOpenRequest(service);
  value(await service.consumeResponse(SESSION, response('answer-1')));
  const deny = { ...allow(), answer: { kind: 'permission' as const, decision: 'deny' as const } };
  const reused = failed(await service.consumeResponse(SESSION, response('answer-1', deny)));
  assert.deepEqual([reused.code, reused.details.reason], ['conflict', 'idempotency-key-reused']);
  const byOther = { ...allow(), responder: { kind: 'principal' as const, principalId: value(parseIdentifier('PrincipalId', 'person-2')) } };
  assert.equal(failed(await service.consumeResponse(SESSION, response('answer-1', byOther))).details.reason, 'idempotency-key-reused');
});

test('a response key reused by another attempt or ownership generation fails with conflict idempotency-key-reused', async () => {
  const { service } = timeline();
  await withOpenRequest(service);
  value(await service.consumeResponse(SESSION, response('answer-1')));
  const byAttempt = failed(await service.consumeResponse(SESSION, response('answer-1', { ...allow(), attemptId: SECOND_ATTEMPT })));
  assert.deepEqual([byAttempt.code, byAttempt.details.reason], ['conflict', 'idempotency-key-reused']);
  const byOwnership = failed(await service.consumeResponse(SESSION, response('answer-1', { ...allow(), ownershipGeneration: ownership(2) })));
  assert.deepEqual([byOwnership.code, byOwnership.details.reason], ['conflict', 'idempotency-key-reused']);
});

test('a second response under another key fails with conflict already-answered, and the first stays', async () => {
  const { service } = timeline();
  await withOpenRequest(service);
  const first = value(await service.consumeResponse(SESSION, response('answer-1')));
  const second = failed(await service.consumeResponse(SESSION, response('answer-2')));
  assert.deepEqual([second.code, second.details.reason], ['conflict', ALREADY_ANSWERED]);
  assert.deepEqual(value(await service.readSession(SESSION)).requests[0], first);
});

test('a response to a reused native request ID fails as the earlier request requires, and the later one stays open', async () => {
  const { service } = timeline();
  await withOpenRequest(service);
  value(await service.consumeResponse(SESSION, response('answer-1')));
  value(await service.endGeneration(SESSION, generation(1)));
  value(await service.startGeneration(SESSION, { generation: generation(2), nativeSessionId: NATIVE }));
  value(await service.submitTurn(SESSION, turn('key-2')));
  value(await service.deliverTurn(SESSION, { turnId: turnId('turn-2'), generation: generation(2) }));
  value(await service.recordRequest(SESSION, permissionRequest('request-1', 'turn-2', 2)));
  assert.equal(failed(await service.consumeResponse(SESSION, response('answer-3'))).code, 'conflict');
  const awaiting = value(await service.requestsAwaitingAnswer(SESSION));
  assert.deepEqual(awaiting.map((request) => [request.key.generation, request.state]), [[2, 'open']]);
});

test('a generation end leaves its open request unresolved and its answered one delivery-uncertain', async () => {
  const { service } = timeline();
  await withOpenRequest(service);
  value(await service.recordRequest(SESSION, permissionRequest('request-2')));
  value(await service.consumeResponse(SESSION, response('answer-1')));
  value(await service.endGeneration(SESSION, generation(1)));
  const view = value(await service.readSession(SESSION));
  assert.deepEqual(view.requests.map((request) => request.state), ['answered', 'unresolved']);
  assert.deepEqual(view.turns.map((entry) => entry.state), ['outcome-unknown']);
  assert.deepEqual(value(await service.uncertainDeliveries(SESSION)).map((request) => request.key.nativeRequestId), ['request-1']);
  assert.equal(failed(await service.consumeResponse(SESSION, response('answer-2', allow('request-2')))).code, 'not-found');
});

test('acceptance unknown holds the generation, and a refusal lets the next turn be delivered at once', async () => {
  const { service } = timeline();
  await running(service);
  for (const key of ['key-1', 'key-2', 'key-3']) value(await service.submitTurn(SESSION, turn(key)));
  value(await service.recordTurnRefused(SESSION, { turnId: turnId('turn-1'), generation: generation(1) }));
  assert.equal(value(await service.nextDeliverableTurn(SESSION))?.id, 'turn-2');
  value(await service.recordTurnAcceptanceUnknown(SESSION, { turnId: turnId('turn-2'), generation: generation(1) }));
  assert.equal(value(await service.nextDeliverableTurn(SESSION)), undefined);
  value(await service.endGeneration(SESSION, generation(1)));
  value(await service.startGeneration(SESSION, { generation: generation(2), nativeSessionId: NATIVE }));
  assert.equal(value(await service.nextDeliverableTurn(SESSION))?.id, 'turn-3');
  const states = value(await service.readSession(SESSION)).turns.map((entry) => entry.state);
  assert.deepEqual(states, ['refused', 'outcome-unknown', 'queued']);
});

test('an attempt bound to one session of a task fails with conflict on another', async () => {
  const { service } = timeline();
  await running(service);
  value(await service.openSession({ id: OTHER_SESSION, taskId: TASK, harness: HARNESS }));
  assert.equal(failed(await service.bindAttempt(OTHER_SESSION, binding())).code, 'conflict');
  value(await service.endBoundAttempt(SESSION, FIRST_ATTEMPT));
  assert.equal(failed(await service.bindAttempt(OTHER_SESSION, binding())).code, 'conflict');
  value(await service.bindAttempt(OTHER_SESSION, binding(SECOND_ATTEMPT)));
});

test('a refused change writes nothing', async () => {
  const { service, store } = timeline();
  await running(service);
  const before = await stored(store);
  assert.equal(failed(await service.deliverTurn(SESSION, { turnId: turnId('nope'), generation: generation(1) })).code, 'not-found');
  assert.deepEqual(await stored(store), before);
});

test('released output is recorded redacted, and no session view carries an entry', async () => {
  const { service, store } = timeline();
  await withOpenRequest(service);
  const appended = value(await service.appendOutput(SESSION, { turnId: turnId('turn-1'), generation: generation(1), text: 'key SECRET\n' }));
  assert.equal('output' in appended, false);
  assert.deepEqual((await stored(store)).session.output.entries.map((entry) => entry.text), ['key [redacted]\n']);
});

test('a limit stops the session, the handoff is written, and the next session of the task takes it once', async () => {
  const { service } = timeline();
  await running(service);
  value(await service.recordLimitSignal(SESSION, {}));
  value(await service.endGeneration(SESSION, generation(1)));
  value(await service.writeHandoff(SESSION, evidence('snapshot-1')));
  value(await service.openSession({ id: OTHER_SESSION, taskId: TASK, harness: HARNESS }));
  assert.equal(value(await service.takeHandoff(SESSION, OTHER_SESSION)).handoff?.takenBy, OTHER_SESSION);
  assert.equal(failed(await service.takeHandoff(SESSION, OTHER_SESSION)).code, 'conflict');
  assert.equal(failed(await service.takeHandoff(SESSION, value(parseIdentifier('SessionId', 'nope')))).code, 'not-found');
});

test('a delivery report and a turn outcome are recorded through the service', async () => {
  const { service } = timeline();
  await withOpenRequest(service);
  value(await service.consumeResponse(SESSION, response('answer-1')));
  value(await service.recordDeliveryReport(SESSION, requestKey('request-1'), 'delivered'));
  value(await service.recordTurnOutcome(SESSION, { turnId: turnId('turn-1'), generation: generation(1), outcome: 'completed' }));
  const view = value(await service.readSession(SESSION));
  assert.deepEqual([view.turns[0]?.state, view.requests[0]?.state === 'answered' && view.requests[0].response.delivery], ['ended', 'delivered']);
});

test('an output chunk longer than its bound before redaction fails with invalid and takes no position', async () => {
  const { service, store } = timeline();
  await withOpenRequest(service);
  value(await service.appendOutput(SESSION, { turnId: turnId('turn-1'), generation: generation(1), text: 'first' }));
  const before = await stored(store);
  const overlong = failed(await service.appendOutput(SESSION, { turnId: turnId('turn-1'), generation: generation(1), text: OVERLONG_SECRET }));
  assert.equal(overlong.code, 'invalid');
  assert.deepEqual((await stored(store)).session.output, before.session.output);
  assert.equal((await stored(store)).version, before.version);
});

test('turn text that redaction lengthens past its bound is recorded with its tail cut to the bound', async () => {
  const { service } = timeline();
  await running(service);
  const submitted = value(await service.submitTurn(SESSION, turn('key-1', LENGTHENED)));
  assert.equal(submitted.turn.text, LENGTHENED_REDACTED.slice(0, MAX_HARNESS_TEXT_LENGTH));
});

test('a cut on a surrogate pair keeps the whole character out, so the text ends one unit short', async () => {
  const { service } = timeline();
  await running(service);
  const emojis = '\u{1F600}'.repeat((MAX_HARNESS_TEXT_LENGTH - 8) / 2);
  const submitted = value(await service.submitTurn(SESSION, turn('key-1', `SECRET ${emojis}`)));
  assert.equal(submitted.turn.text, `[redacted] ${emojis}`.slice(0, MAX_HARNESS_TEXT_LENGTH - 1));
});

test('native request text that redaction lengthens past its bound is recorded with its tail cut', async () => {
  const { service } = timeline();
  await withOpenRequest(service);
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-2'), text: LENGTHENED }));
  const awaiting = value(await service.requestsAwaitingAnswer(SESSION));
  assert.equal(awaiting[1]?.text, LENGTHENED_REDACTED.slice(0, MAX_HARNESS_TEXT_LENGTH));
});

test('an input answer that redaction lengthens past its byte bound is cut on a whole UTF-8 character', async () => {
  const { service } = timeline();
  await withOpenRequest(service, 'input-request');
  const accents = '\u00e9'.repeat((MAX_INPUT_ANSWER_BYTES - 8) / 2);
  const input = { ...allow(), answer: { kind: 'input' as const, text: `SECRET ${accents}` } };
  const answered = value(await service.consumeResponse(SESSION, response('answer-1', input)));
  const text = answered.state === 'answered' && answered.response.answer.kind === 'input' ? answered.response.answer.text : '';
  assert.equal(text, `[redacted] ${accents}`.slice(0, (MAX_INPUT_ANSWER_BYTES - 12) / 2 + 11));
  assert.equal(Buffer.byteLength(text), MAX_INPUT_ANSWER_BYTES - 1);
});

test('an input answer longer than its byte bound before redaction fails with invalid', async () => {
  const { service } = timeline();
  await withOpenRequest(service, 'input-request');
  const input = { ...allow(), answer: { kind: 'input' as const, text: '\u00e9'.repeat(MAX_INPUT_ANSWER_BYTES / 2 + 1) } };
  assert.equal(failed(await service.consumeResponse(SESSION, response('answer-1', input))).code, 'invalid');
});

test('released output that redaction lengthens past the entry bound is split into entries and loses nothing', async () => {
  const { service, store } = timeline();
  await withOpenRequest(service);
  value(await service.appendOutput(SESSION, { turnId: turnId('turn-1'), generation: generation(1), text: LENGTHENED }));
  const entries = (await stored(store)).session.output.entries;
  assert.deepEqual(entries.map((entry) => [entry.position, entry.text.length]), [[1, MAX_HARNESS_TEXT_LENGTH], [2, LENGTHENED_REDACTED.length - MAX_HARNESS_TEXT_LENGTH]]);
  assert.equal(entries.map((entry) => entry.text).join(''), LENGTHENED_REDACTED);
});
