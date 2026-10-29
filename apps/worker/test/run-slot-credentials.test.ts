import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';
import {
  DeliveredSlotCredential,
  type RecoveryEpoch,
  type RunSlotCredentialRequest,
  type SlotCredentialAnswer,
  type SlotCredentialClient,
  type SlotCredentialFetch,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { failed, id, value } from '@taskelith/testing';
import { FetchedRunSlotCredentials } from '@taskelith/worker';

// A fixture value, never a real credential.
const SECRET = 'fixture-run-slot-token';
const RUN = {
  executionId: id('ExecutionId', 'execution-1'), attemptId: id('AttemptId', 'attempt-1'), ownershipGeneration: 2,
  slotId: id('ProviderCredentialId', 'slot-1'),
} as unknown as RunSlotCredentialRequest;

function delivery(executionId = RUN.executionId, secret = SECRET): SlotCredentialAnswer {
  const credential = value(DeliveredSlotCredential.of({ executionId, slotId: RUN.slotId, mechanismId: 'mechanism-1', credentialVersion: 1, secret }));
  return { kind: 'delivered', credential };
}

function revealed(answer: Result<SlotCredentialAnswer>): string | undefined {
  const obtained = value(answer);
  return obtained.kind === 'delivered' ? obtained.credential.reveal() : undefined;
}

// Answers each fetch with the next scripted answer and records the fetch.
function scripted(answers: Array<Result<SlotCredentialAnswer>>): SlotCredentialClient & { fetched: SlotCredentialFetch[] } {
  const fetched: SlotCredentialFetch[] = [];
  return { fetched, fetch: async (request) => { fetched.push(request); return answers.shift() ?? err(failure('internal', 'unscripted')); } };
}

function source(client: SlotCredentialClient, sink = new InMemoryLogSink(), epoch = { current: 1 }) {
  const logger = new Logger(sink, { now: () => '2026-10-29T10:00:00.000Z' as never });
  return new FetchedRunSlotCredentials(client, { recoveryEpoch: () => epoch.current as RecoveryEpoch, logger });
}

test('a run fetches its credential once with the current recovery epoch, until the run ends', async () => {
  const client = scripted([ok(delivery()), ok(delivery(RUN.executionId, 'fixture-next-run-token'))]);
  const runs = source(client);
  assert.equal(revealed(await runs.obtain(RUN)), SECRET);
  assert.equal(revealed(await runs.obtain(RUN)), SECRET);
  assert.deepEqual(client.fetched, [{ ...RUN, recoveryEpoch: 1 }], 'held for the execution, not fetched again');
  runs.forgetRun(RUN);
  assert.equal(revealed(await runs.obtain(RUN)), 'fixture-next-run-token', 'the ended run held nothing');
  assert.equal(client.fetched.length, 2);
});

test('a new recovery epoch forgets every held delivery, of other runs too', async () => {
  const OTHER = { ...RUN, executionId: id('ExecutionId', 'execution-2') as never, attemptId: id('AttemptId', 'attempt-2') as never };
  const client = scripted([
    ok(delivery()), ok(delivery(OTHER.executionId)),
    ok(delivery(RUN.executionId, 'fixture-epoch-2-token')), ok(delivery(OTHER.executionId, 'fixture-epoch-2-token')),
  ]);
  const epoch = { current: 1 };
  const runs = source(client, new InMemoryLogSink(), epoch);
  value(await runs.obtain(RUN));
  value(await runs.obtain(OTHER));
  epoch.current = 2;
  assert.equal(revealed(await runs.obtain(RUN)), 'fixture-epoch-2-token', 'the delivery of epoch 1 is not reused');
  assert.equal(revealed(await runs.obtain(OTHER)), 'fixture-epoch-2-token', 'the other run held nothing of epoch 1');
  assert.deepEqual(client.fetched.map((fetched) => fetched.recoveryEpoch), [1, 1, 2, 2]);
});

const NEXT = { ...RUN, ownershipGeneration: 3 } as RunSlotCredentialRequest;

test('a new ownership generation of an attempt forgets its held deliveries', async () => {
  const client = scripted([ok(delivery()), ok(delivery(RUN.executionId, 'fixture-generation-3-token'))]);
  const runs = source(client);
  value(await runs.obtain(RUN));
  assert.equal(revealed(await runs.obtain(NEXT)), 'fixture-generation-3-token', 'generation 2 delivery is not reused');
  assert.deepEqual(client.fetched.map((fetched) => fetched.ownershipGeneration), [2, 3]);
});

test('a call of an older generation fails with conflict and keeps the held later delivery', async () => {
  const client = scripted([ok(delivery(RUN.executionId, 'fixture-generation-3-token')), ok(delivery())]);
  const runs = source(client);
  value(await runs.obtain(NEXT));
  assert.equal(failed(await runs.obtain(RUN)).code, 'conflict');
  assert.equal(revealed(await runs.obtain(NEXT)), 'fixture-generation-3-token', 'generation 3 is still held');
  assert.deepEqual(client.fetched.map((fetched) => fetched.ownershipGeneration), [3]);
});

test('a call of an older generation leaves the fetch of a later one in flight', async () => {
  const client = controlled();
  const runs = source(client);
  const later = runs.obtain(NEXT);
  const older = runs.obtain(RUN);
  client.answer(ok(delivery(RUN.executionId, 'fixture-generation-3-token')));
  assert.equal(revealed(await later), 'fixture-generation-3-token');
  assert.equal(failed(await older).code, 'conflict');
  assert.equal(client.fetched.length, 1);
});

test('another execution never gets a held credential of another run', async () => {
  const client = scripted([ok(delivery()), ok(delivery(id('ExecutionId', 'execution-2') as never))]);
  const runs = source(client);
  value(await runs.obtain(RUN));
  value(await runs.obtain({ ...RUN, executionId: id('ExecutionId', 'execution-2') as never }));
  assert.equal(client.fetched.length, 2);
});

test('a refusal or a failure is logged by identifiers and reason only, and nothing is held', async () => {
  const sink = new InMemoryLogSink();
  const refusal = { kind: 'refused' as const, refusal: { reason: 'revoked' as const, message: 'slot slot-1 is revoked' } };
  const client = scripted([ok(refusal), err(failure('unavailable', 'the control plane did not answer')), ok(delivery())]);
  const runs = source(client, sink);
  assert.deepEqual(value(await runs.obtain(RUN)), refusal);
  assert.equal(failed(await runs.obtain(RUN)).code, 'unavailable');
  value(await runs.obtain(RUN));
  assert.equal(client.fetched.length, 3, 'neither the refusal nor the failure was held');
  assert.deepEqual(sink.records.map((record) => [record.event, record.fields]), [
    ['worker.slot-delivery.refused', { executionId: 'execution-1', attemptId: 'attempt-1', slot: 'slot-1', reason: 'revoked' }],
    ['worker.slot-delivery.failed', { executionId: 'execution-1', attemptId: 'attempt-1', slot: 'slot-1', code: 'unavailable' }],
  ]);
});

test('no log record, string, JSON, or inspection of a held delivery shows the credential', async () => {
  const sink = new InMemoryLogSink();
  const runs = source(scripted([ok(delivery())]), sink);
  const answer = value(await runs.obtain(RUN));
  for (const shown of [JSON.stringify(sink.records), JSON.stringify(answer), inspect(answer, { depth: 5 }), inspect(runs, { depth: 5 })]) {
    assert.doesNotMatch(shown, new RegExp(SECRET));
  }
});

// A client whose fetches each wait until the test answers them.
function controlled(): SlotCredentialClient & { fetched: SlotCredentialFetch[]; answer: (next: Result<SlotCredentialAnswer>) => void } {
  const fetched: SlotCredentialFetch[] = [];
  const waiting: Array<(next: Result<SlotCredentialAnswer>) => void> = [];
  return {
    fetched,
    fetch: (request) => { fetched.push(request); return new Promise((resolve) => waiting.push(resolve)); },
    answer: (next) => waiting.shift()!(next),
  };
}

const IN_FLIGHT_ENDS: Array<[string, (runs: FetchedRunSlotCredentials, epoch: { current: number }) => void]> = [
  ['the run ends', (runs) => runs.forgetRun(RUN)],
  ['its ownership generation ends', (runs) => runs.forgetOwnershipGeneration(RUN)],
  ['its recovery epoch ends', (runs) => runs.forgetRecoveryEpoch(1 as RecoveryEpoch)],
  ['the worker moves to another recovery epoch', (_runs, epoch) => { epoch.current = 2; }],
];

for (const [ending, end] of IN_FLIGHT_ENDS) {
  test(`a delivery that arrives after ${ending} is neither returned nor held`, async () => {
    const client = controlled();
    const epoch = { current: 1 };
    const runs = source(client, new InMemoryLogSink(), epoch);
    const first = runs.obtain(RUN);
    end(runs, epoch);
    client.answer(ok(delivery()));
    const dropped = failed(await first);
    assert.equal(dropped.code, 'conflict');
    assert.doesNotMatch(JSON.stringify(dropped), new RegExp(SECRET));
    const again = runs.obtain(RUN);
    client.answer(ok(delivery(RUN.executionId, 'fixture-after-end-token')));
    assert.equal(revealed(await again), 'fixture-after-end-token', 'the late delivery was not held');
    assert.equal(client.fetched.length, 2);
  });
}

test('a fetch of another run is not dropped when one run ends', async () => {
  const OTHER = { ...RUN, executionId: id('ExecutionId', 'execution-2') as never };
  const client = controlled();
  const runs = source(client);
  const other = runs.obtain(OTHER);
  runs.forgetRun(RUN);
  client.answer(ok(delivery(OTHER.executionId)));
  assert.equal(revealed(await other), SECRET);
});

// The scope of each call stays the same, so a call cannot drop the held
// delivery; only the forget can.
const HELD_ENDS: Array<[string, (runs: FetchedRunSlotCredentials) => void]> = [
  ['forgetOwnershipGeneration', (runs) => runs.forgetOwnershipGeneration(RUN)],
  ['forgetRecoveryEpoch', (runs) => runs.forgetRecoveryEpoch(1 as RecoveryEpoch)],
];

for (const [operation, end] of HELD_ENDS) {
  test(`${operation} drops the held delivery without a call of another scope`, async () => {
    const client = scripted([ok(delivery()), ok(delivery(RUN.executionId, 'fixture-forgotten-token'))]);
    const runs = source(client);
    value(await runs.obtain(RUN));
    end(runs);
    assert.equal(revealed(await runs.obtain(RUN)), 'fixture-forgotten-token');
    assert.equal(client.fetched.length, 2);
  });
}

test('forgetOwnershipGeneration and forgetRecoveryEpoch keep the deliveries of other generations and epochs', async () => {
  const client = scripted([ok(delivery())]);
  const runs = source(client);
  value(await runs.obtain(RUN));
  runs.forgetOwnershipGeneration({ attemptId: RUN.attemptId, ownershipGeneration: 1 as never });
  runs.forgetOwnershipGeneration({ attemptId: id('AttemptId', 'attempt-2') as never, ownershipGeneration: RUN.ownershipGeneration });
  runs.forgetRecoveryEpoch(2 as RecoveryEpoch);
  assert.equal(revealed(await runs.obtain(RUN)), SECRET);
  assert.equal(client.fetched.length, 1);
});

test('a call of an older recovery epoch fails with conflict and keeps the held later delivery', async () => {
  const client = scripted([ok(delivery(RUN.executionId, 'fixture-epoch-2-token'))]);
  const epoch = { current: 2 };
  const runs = source(client, new InMemoryLogSink(), epoch);
  value(await runs.obtain(RUN));
  epoch.current = 1;
  assert.equal(failed(await runs.obtain(RUN)).code, 'conflict');
  epoch.current = 2;
  assert.equal(revealed(await runs.obtain(RUN)), 'fixture-epoch-2-token', 'the delivery of epoch 2 is still held');
  assert.deepEqual(client.fetched.map((fetched) => fetched.recoveryEpoch), [2]);
});

test('a call of an older recovery epoch leaves the fetch of a later one in flight', async () => {
  const client = controlled();
  const epoch = { current: 2 };
  const runs = source(client, new InMemoryLogSink(), epoch);
  const later = runs.obtain(RUN);
  epoch.current = 1;
  const older = runs.obtain({ ...RUN, executionId: id('ExecutionId', 'execution-2') as never });
  assert.equal(failed(await older).code, 'conflict');
  epoch.current = 2;
  client.answer(ok(delivery(RUN.executionId, 'fixture-epoch-2-token')));
  assert.equal(revealed(await later), 'fixture-epoch-2-token');
  assert.equal(client.fetched.length, 1);
});
