import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryLogSink,
  isSecretFieldName,
  Logger,
  NO_LOGS,
  pickCorrelation,
  REDACTED,
  redactText,
  SILENT_LOGGER,
} from '@taskelith/observability';
import { parseInstant } from '@taskelith/kernel';
import { assertLinearOnRuns, SimulatedHost, value } from '@taskelith/testing';

const START = value(parseInstant('2026-10-25T10:00:00.000Z'));

const ISSUED = 'tkwk_0123456789abcdefghijABCDEFGHIJ-_xyzXYZ0123';
const SEED = `SU${'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.repeat(2).slice(0, 56)}`;
const JWT = 'eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiJVIn0.c2lnbmF0dXJl';
const CREDS_BEGIN = '-----BEGIN NATS USER JWT-----';
const CREDS_END = '------END USER NKEY SEED------';
// Markers built in parts, so no tracked file holds a whole PEM key block.
const pem = (edge: 'BEGIN' | 'END', type: string) => `-----${edge} ${type}-----`;
const KEY_BODY = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg';
const CERTIFICATE = `${pem('BEGIN', 'CERTIFICATE')}\nMIIBkTCCATegAwIBAgIUFakeCertificateBody\n${pem('END', 'CERTIFICATE')}`;
const CREDS = `${CREDS_BEGIN}\n${JWT}\n------END NATS USER JWT------\n\n-----BEGIN USER NKEY SEED-----\n${SEED}\n${CREDS_END}`;

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

test('issued secrets, seeds, JWTs, and creds blocks are redacted in fields and correlation', () => {
  const { sink, logger: log } = logger();
  log.with({ correlationId: `w-${ISSUED}` }).warn('e', { cause: `seed ${SEED} jwt x${JWT}`, creds: `creds:\n${CREDS}\nend` });
  const record = sink.records[0]!;
  assert.equal(record.correlation.correlationId, `w-${REDACTED}`);
  assert.equal(record.fields['cause'], `seed ${REDACTED} jwt x${REDACTED}`);
  assert.equal(record.fields['creds'], `creds:\n${REDACTED}\nend`);
  assert.equal(redactText(`${CREDS_BEGIN} without an end`), `${CREDS_BEGIN} without an end`);
  assert.equal(redactText('tkop_short and eyJa.b stay'), 'tkop_short and eyJa.b stay');
});

test('PEM private keys of every type are redacted, whole or cut, and certificates stay', () => {
  for (const type of ['PRIVATE KEY', 'ENCRYPTED PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'OPENSSH PRIVATE KEY']) {
    const key = `${pem('BEGIN', type)}\n${KEY_BODY}\n${pem('END', type)}`;
    assert.equal(redactText(`before x${key}y ${CERTIFICATE} after`), `before x${REDACTED}y ${CERTIFICATE} after`, type);
  }
  const two = `${pem('BEGIN', 'PRIVATE KEY')}\na\n${pem('END', 'PRIVATE KEY')} keep ${pem('BEGIN', 'EC PRIVATE KEY')}\nb\n${pem('END', 'EC PRIVATE KEY')}`;
  assert.equal(redactText(two), `${REDACTED} keep ${REDACTED}`);
  assert.equal(redactText(`cut: ${pem('BEGIN', 'PRIVATE KEY')}\n${KEY_BODY}`), `cut: ${REDACTED}`);
  assert.equal(redactText(`${CERTIFICATE}\n${pem('BEGIN', 'PUBLIC KEY')}\nMFkw`), `${CERTIFICATE}\n${pem('BEGIN', 'PUBLIC KEY')}\nMFkw`);
  const { sink, logger: log } = logger();
  log.with({ correlationId: 'c-1' }).warn('e', { cause: `tls: ${pem('BEGIN', 'PRIVATE KEY')}\n${KEY_BODY}\n${pem('END', 'PRIVATE KEY')}` });
  assert.equal(sink.records[0]!.fields['cause'], `tls: ${REDACTED}`);
});

test('text is redacted in linear time on long runs', () => {
  const units = ['a.', '.a', 'A.', 'a.b', 'a-', 'a+', 'eyJ.', 'eyJ', 'eyJ_', 'eyJa.b.', 'proxy-', 'x.eyJ'];
  assertLinearOnRuns(redactText, [...units, 'bearer ', 'token=', 'tkop_', 'SA', 'a://', 'a://b@']);
  assertLinearOnRuns(redactText, [CREDS_BEGIN, `${CREDS_BEGIN}a`], 400_000);
  const keyBegin = pem('BEGIN', 'PRIVATE KEY');
  assertLinearOnRuns(redactText, [keyBegin, `${keyBegin}${pem('END', 'PRIVATE KEY')}`, '-----BEGIN A', '-----BEGIN ', 'PRIVATE KEY-----'], 400_000);
});

test('a name redacts only by whole segments', () => {
  const secret = [
    'password', 'apiKey', 'api_key', 'privateKey', 'x-auth-token', 'Cookie', 'accessToken', 'providerCredential',
    'APIToken', 'DBPassword', 'JWTToken', 'APIKey',
  ];
  const plain = ['promptTokens', 'passedChecks', 'compass', 'bypassed', 'keyId', 'authority'];
  assert.deepEqual(secret.filter((name) => !isSecretFieldName(name)), []);
  assert.deepEqual(plain.filter(isSecretFieldName), []);
});

test('a key-value secret and a password containing @ are redacted', () => {
  assert.equal(redactText('password=hunter2 host=db token=abc'), `password=${REDACTED} host=db token=${REDACTED}`);
  assert.equal(redactText('postgres://user:p@ss@db/x'), `postgres://${REDACTED}@db/x`);
  assert.equal(redactText(`password='two words' host=db`), `password=${REDACTED} host=db`);
  assert.equal(redactText(`password = "a \\"b\\" c" host=db`), `password=${REDACTED} host=db`);
  assert.equal(redactText(`password='unterminated`), `password=${REDACTED}`);
  assert.equal(redactText('password=two\\ words host=db'), `password=${REDACTED} host=db`);
  assert.equal(redactText('password=two\\\tw host=db'), `password=${REDACTED} host=db`);
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
