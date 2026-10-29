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

function delivery(executionId = RUN.executionId): SlotCredentialAnswer {
  const credential = value(DeliveredSlotCredential.of({ executionId, slotId: RUN.slotId, mechanismId: 'mechanism-1', credentialVersion: 1, secret: SECRET }));
  return { kind: 'delivered', credential };
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

test('a run fetches its credential once with the current recovery epoch, until the run is forgotten', async () => {
  const client = scripted([ok(delivery()), ok(delivery())]);
  const epoch = { current: 1 };
  const runs = source(client, new InMemoryLogSink(), epoch);
  const first = value(await runs.obtain(RUN));
  assert.equal(first.kind === 'delivered' && first.credential.reveal(), SECRET);
  assert.equal((value(await runs.obtain(RUN)) as typeof first).kind, 'delivered');
  assert.deepEqual(client.fetched, [{ ...RUN, recoveryEpoch: 1 }], 'held for the execution, not fetched again');
  runs.forget(RUN);
  epoch.current = 2;
  value(await runs.obtain(RUN));
  assert.deepEqual(client.fetched.map((fetched) => fetched.recoveryEpoch), [1, 2], 'a forgotten run fetches a new delivery');
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
