import assert from 'node:assert/strict';
import { test } from 'node:test';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { CREDENTIALS_REJECTED } from '@taskelith/nats';
import { failed, value } from '@taskelith/testing';
import { BrokerDial, REJECTED_ROUNDS_LIMIT, type BrokerCandidate } from '@taskelith/worker';

const REJECTED = failure('unavailable', 'the broker could not connect', { cause: 'Authorization Violation', reason: CREDENTIALS_REJECTED });
const UNREACHABLE = failure('unavailable', 'the broker could not connect', { cause: 'ECONNREFUSED' });

const BOTH: readonly BrokerCandidate[] = [{ generation: 2, creds: 'creds-2' }, { generation: 1, creds: 'creds-1' }];

// Answers each dialed `.creds` text from the test's table.
function dialing(answers: Record<string, Result<string>>) {
  const dialed: string[] = [];
  const dial = new BrokerDial<string>({
    candidates: () => BOTH,
    dial: async (creds) => {
      dialed.push(creds);
      return answers[creds] ?? err(failure('internal', 'unexpected'));
    },
  });
  return { dial, dialed };
}

test('a round tries the current generation first, then the kept predecessor', async () => {
  const { dial, dialed } = dialing({ 'creds-2': err(REJECTED), 'creds-1': ok('link-1') });
  assert.deepEqual(value(await dial.connect()), { link: 'link-1', generation: 1 });
  assert.deepEqual(dialed, ['creds-2', 'creds-1']);
});

test('the third round in which every generation was rejected is credentials-expired', async () => {
  const { dial } = dialing({ 'creds-2': err(REJECTED), 'creds-1': err(REJECTED) });
  for (let round = 1; round < REJECTED_ROUNDS_LIMIT; round += 1) assert.equal(failed(await dial.connect()), REJECTED, `round ${round}`);
  const stopped = failed(await dial.connect());
  assert.deepEqual([stopped.code, stopped.details.reason], ['forbidden', 'credentials-expired']);
  assert.match(stopped.message, /enroll the worker again/);
});

test('a round with another failure, or a connection, starts the count again', async () => {
  const answers: Record<string, Result<string>> = { 'creds-2': err(REJECTED), 'creds-1': err(REJECTED) };
  const { dial } = dialing(answers);
  failed(await dial.connect());
  failed(await dial.connect());
  answers['creds-1'] = err(UNREACHABLE);
  assert.equal(failed(await dial.connect()), UNREACHABLE, 'an unreachable broker keeps the endless retry');
  answers['creds-1'] = err(REJECTED);
  failed(await dial.connect());
  answers['creds-2'] = ok('link-2');
  assert.deepEqual(value(await dial.connect()), { link: 'link-2', generation: 2 });
  answers['creds-2'] = err(REJECTED);
  failed(await dial.connect());
  assert.equal(failed(await dial.connect()).code, 'unavailable', 'two rejected rounds after a connection');
});
