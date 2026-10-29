import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstant } from '@taskelith/kernel';
import {
  InMemorySessionTimelineStore,
  MAX_HARNESS_TEXT_LENGTH,
  SessionTimelineService,
  type SessionTimelineStore,
} from '@taskelith/execution';
import { failed, sequentialIds, value } from '@taskelith/testing';
import {
  FIRST_ATTEMPT,
  FLIPPING_CIPHER,
  HARNESS,
  NATIVE,
  PERSON,
  SESSION,
  TASK,
  binding,
  generation,
  sessionId,
  trailingRunRedactor,
  turnId,
  turnKey,
} from './session-fixtures.ts';

const CLOCK = { now: () => value(parseInstant('2026-10-29T09:00:00.000Z')) };
const redact = (text: string) => text.replaceAll(/SECRET\S*/g, '[redacted]');
const TURN = turnId('turn-1');
const FIRST = generation(1);

function timeline(store = new InMemorySessionTimelineStore()) {
  const service = new SessionTimelineService({
    store, digest: { digest: (input) => `digest:${input}` }, redactor: { redact }, outputRedactor: trailingRunRedactor(redact),
    tailCipher: FLIPPING_CIPHER, turnIds: sequentialIds('TurnId', 'turn'), clock: CLOCK, itemIds: sequentialIds('NeedsYouItemId', 'item'),
  });
  return { store, service };
}

// SESSION runs `turn-1` in generation 1.
async function runningTurn(service: SessionTimelineService): Promise<void> {
  value(await service.openSession({ id: SESSION, taskId: TASK, harness: HARNESS }));
  value(await service.bindAttempt(SESSION, binding()));
  value(await service.startGeneration(SESSION, { generation: FIRST, nativeSessionId: NATIVE }));
  value(await service.submitTurn(SESSION, { key: turnKey('key-1'), author: PERSON, text: 'go' }));
  value(await service.deliverTurn(SESSION, { turnId: TURN, generation: FIRST }));
}

const append = (service: SessionTimelineService, text: string) => service.appendOutput(SESSION, { turnId: TURN, generation: FIRST, text });

async function entries(store: InMemorySessionTimelineStore) {
  const stored = value(await store.transaction((tx) => tx.sessions.get(SESSION)))!;
  return stored.session.output.entries.map((entry) => [entry.turnId, entry.text]);
}

async function storedTail(store: SessionTimelineStore) {
  return value(await store.transaction((tx) => tx.tails.get(SESSION)));
}

test('a held tail is recorded by no entry and stored only sealed, and the next chunk releases it redacted', async () => {
  const { service, store } = timeline();
  await runningTurn(service);
  value(await append(service, 'key SEC'));
  assert.deepEqual(await entries(store), [[TURN, 'key ']]);
  const tail = (await storedTail(store))!;
  assert.deepEqual([tail.turnId, tail.generation, tail.version], [TURN, FIRST, 1]);
  assert.equal(Buffer.from(tail.sealed).includes('SEC'), false, 'the stored tail holds no plaintext');
  value(await append(service, 'RET more\n'));
  assert.deepEqual(await entries(store), [[TURN, 'key '], [TURN, '[redacted] more\n']]);
  assert.equal((await storedTail(store))?.version, 2, 'the emptied tail keeps its row and version');
});

test('each write of a tail takes the next version, and a chunk that releases nothing still writes it', async () => {
  const { service, store } = timeline();
  await runningTurn(service);
  value(await append(service, 'SEC'));
  value(await append(service, 'RET'));
  assert.deepEqual([(await storedTail(store))?.version, await entries(store)], [2, []]);
});

const ENDINGS = {
  recordTurnOutcome: (service: SessionTimelineService) => service.recordTurnOutcome(SESSION, { turnId: TURN, generation: FIRST, outcome: 'completed' }),
  endGeneration: (service: SessionTimelineService) => service.endGeneration(SESSION, FIRST),
  endBoundAttempt: (service: SessionTimelineService) => service.endBoundAttempt(SESSION, FIRST_ATTEMPT),
};

for (const [name, end] of Object.entries(ENDINGS)) {
  test(`${name} first releases the held tail, redacted, as the turn's last entry and clears it`, async () => {
    const { service, store } = timeline();
    await runningTurn(service);
    value(await append(service, 'done SECRET-half'));
    value(await end(service));
    assert.deepEqual(await entries(store), [[TURN, 'done '], [TURN, '[redacted]']]);
    assert.equal(await storedTail(store), undefined);
  });
}

test('a change that keeps the turn running keeps its tail, and a chunk for the ended turn is refused with the tail unchanged', async () => {
  const { service, store } = timeline();
  await runningTurn(service);
  value(await append(service, 'SEC'));
  value(await service.recordLimitSignal(SESSION, {}));
  const kept = await storedTail(store);
  assert.equal(kept?.version, 1);
  value(await service.recordTurnOutcome(SESSION, { turnId: TURN, generation: FIRST, outcome: 'completed' }));
  value(await store.transaction((tx) => tx.tails.put(kept!)));
  assert.equal(failed(await append(service, 'RET')).code, 'precondition-failed');
  assert.deepEqual(await storedTail(store), kept);
});

test('a tail whose ciphertext or authenticated turn changed fails with internal and releases nothing', async () => {
  for (const tamper of ['ciphertext', 'turn'] as const) {
    const { service, store } = timeline();
    await runningTurn(service);
    value(await append(service, 'SEC'));
    const tail = (await storedTail(store))!;
    const sealed = Uint8Array.from(tail.sealed);
    sealed[3]! ^= 1;
    const changed = tamper === 'ciphertext' ? { ...tail, sealed } : { ...tail, turnId: turnId('turn-9') };
    value(await store.transaction((tx) => tx.tails.put(changed)));
    const refused = failed(await append(service, 'RET\n'));
    assert.deepEqual([refused.code, refused.message], ['internal', `the held output tail of session ${SESSION} does not open`], tamper);
    assert.deepEqual(await entries(store), [], tamper);
  }
});

test('a tail of another turn that opens fails the append with internal', async () => {
  const { service, store } = timeline();
  await runningTurn(service);
  const other = turnId('turn-9');
  const plain = JSON.stringify({ text: 'x', continuation: 'none' });
  const { nonce, sealed } = FLIPPING_CIPHER.seal(plain, JSON.stringify(['session-output-tail', SESSION, other, 1]));
  value(await store.transaction((tx) => tx.tails.put({ sessionId: SESSION, turnId: other, generation: FIRST, version: 1, nonce, sealed })));
  assert.equal(failed(await append(service, 'more\n')).code, 'internal');
});

test('a release past the entry bound becomes two entries with a surrogate pair kept whole in the second', async () => {
  const { service, store } = timeline();
  await runningTurn(service);
  const text = `${'a'.repeat(MAX_HARNESS_TEXT_LENGTH - 1)}\u{1F600} `;
  value(await append(service, text.slice(0, MAX_HARNESS_TEXT_LENGTH)));
  value(await append(service, text.slice(MAX_HARNESS_TEXT_LENGTH)));
  assert.deepEqual(await entries(store), [[TURN, 'a'.repeat(MAX_HARNESS_TEXT_LENGTH - 1)], [TURN, '\u{1F600} ']]);
});

test('readOutput pages the retained entries after a cursor, with more while entries remain', async () => {
  const { service } = timeline();
  await runningTurn(service);
  for (const line of ['one\n', 'two\n', 'three\n']) value(await append(service, line));
  const page = value(await service.readOutput(SESSION, 0, 2));
  assert.deepEqual(page.kind === 'entries' && [page.entries.map((entry) => entry.text), page.more], [['one\n', 'two\n'], true]);
  const rest = value(await service.readOutput(SESSION, 2, 2));
  assert.deepEqual(rest.kind === 'entries' && [rest.entries.map((entry) => entry.position), rest.more], [[3], false]);
  assert.equal(failed(await service.readOutput(SESSION, 4, 2)).code, 'invalid');
  assert.equal(failed(await service.readOutput(sessionId('nope'), 0, 2)).code, 'not-found');
});

test('readOutput answers cursor-expired with the earliest retained position for a cursor the window left', async () => {
  const { service } = timeline();
  await runningTurn(service);
  // Each entry holds 196,608 bytes, so 54 of them pass the 10 MiB window.
  for (let index = 0; index < 54; index += 1) value(await append(service, `${'€'.repeat(MAX_HARNESS_TEXT_LENGTH - 1)}\n`));
  assert.deepEqual(value(await service.readOutput(SESSION, 0, 100)), { kind: 'cursor-expired', earliestRetained: 2 });
});
