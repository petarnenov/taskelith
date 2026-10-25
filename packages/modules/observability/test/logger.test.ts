import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryLogSink,
  Logger,
  NO_LOGS,
  pickCorrelation,
  REDACTED,
  redactText,
  SILENT_LOGGER,
} from '@taskelith/observability';
import { parseInstant } from '@taskelith/kernel';
import { SimulatedHost, value } from '@taskelith/testing';

const START = value(parseInstant('2026-10-25T10:00:00.000Z'));

function logger(): { sink: InMemoryLogSink; logger: Logger } {
  const sink = new InMemoryLogSink();
  return { sink, logger: new Logger(sink, new SimulatedHost(START).wallClock) };
}

test('a record carries its time, level, event, correlation, and fields', () => {
  const { sink, logger: log } = logger();
  log.with({ commandId: 'command-1' }).with({ attemptId: 'attempt-1' }).info('nats.message.handled', { subject: 'a.b', count: 2, ok: true });
  assert.deepEqual(sink.records, [{
    at: START,
    level: 'info',
    event: 'nats.message.handled',
    correlation: { commandId: 'command-1', attemptId: 'attempt-1' },
    fields: { subject: 'a.b', count: 2, ok: true },
  }]);
  assert.ok(Object.isFrozen(sink.records[0]));
});

test('each level writes a record of that level', () => {
  const { sink, logger: log } = logger();
  log.debug('e.debug');
  log.info('e.info');
  log.warn('e.warn');
  log.error('e.error');
  assert.deepEqual(sink.records.map((record) => record.level), ['debug', 'info', 'warn', 'error']);
});

test('a later correlation replaces an earlier value of the same key', () => {
  const { sink, logger: log } = logger();
  log.with({ attemptId: 'attempt-1' }).with({ attemptId: 'attempt-2' }).info('e');
  assert.deepEqual(sink.records[0]!.correlation, { attemptId: 'attempt-2' });
});

test('a field named like a secret is redacted whatever its value', () => {
  const { sink, logger: log } = logger();
  log.warn('e', { password: 'p', apiKey: 'k', accessToken: 't', providerCredential: 'c', Authorization: 'a', retries: 3 });
  assert.deepEqual(sink.records[0]!.fields, {
    password: REDACTED, apiKey: REDACTED, accessToken: REDACTED, providerCredential: REDACTED, Authorization: REDACTED, retries: 3,
  });
});

test('credentials inside text are redacted in fields and correlation', () => {
  const { sink, logger: log } = logger();
  log.with({ correlationId: 'postgres://user:pw@db/x' }).error('e', { cause: 'connect postgres://taskelith:taskelith@localhost:5432/db failed; Bearer abc.def==' });
  const record = sink.records[0]!;
  assert.equal(record.fields['cause'], `connect postgres://${REDACTED}@localhost:5432/db failed; Bearer ${REDACTED}`);
  assert.equal(record.correlation.correlationId, `postgres://${REDACTED}@db/x`);
  assert.doesNotMatch(JSON.stringify(record), /taskelith:taskelith|pw@|abc\.def/);
});

test('text without credentials is unchanged', () => {
  assert.equal(redactText('https://example.com/a@b and a bearer'), 'https://example.com/a@b and a bearer');
});

test('pickCorrelation keeps only known keys with string values', () => {
  assert.deepEqual(pickCorrelation({ commandId: 'c', attemptId: 7, payload: 'secret', workerId: 'w' }), { commandId: 'c', workerId: 'w' });
});

test('the silent logger and the discarding sink write nothing anywhere', () => {
  SILENT_LOGGER.with({ commandId: 'c' }).error('e', { cause: 'x' });
  NO_LOGS.write({ at: START, level: 'info', event: 'e', correlation: {}, fields: {} });
});
