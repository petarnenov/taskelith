import assert from 'node:assert/strict';
import test from 'node:test';
import { readServiceEndpoints } from '@taskelith/control-plane';

const VALID = {
  TASKELITH_POSTGRES_URL: 'postgres://user:secret@127.0.0.1:5432/taskelith',
  TASKELITH_NATS_URL: 'nats://127.0.0.1:4222',
};

test('reads the PostgreSQL and NATS endpoints', () => {
  const result = readServiceEndpoints(VALID);
  assert(result.ok);
  assert.equal(result.value.postgres.port, '5432');
  assert.equal(result.value.nats.href, 'nats://127.0.0.1:4222');
});

test('accepts the postgresql scheme', () => {
  const result = readServiceEndpoints({ ...VALID, TASKELITH_POSTGRES_URL: 'postgresql://127.0.0.1/taskelith' });
  assert(result.ok);
});

for (const [name, environment, message] of [
  ['missing PostgreSQL', { TASKELITH_NATS_URL: VALID.TASKELITH_NATS_URL }, 'TASKELITH_POSTGRES_URL is not set'],
  ['empty NATS', { ...VALID, TASKELITH_NATS_URL: '' }, 'TASKELITH_NATS_URL is not set'],
  ['malformed URL', { ...VALID, TASKELITH_POSTGRES_URL: 'not a url' }, 'TASKELITH_POSTGRES_URL is not a URL'],
  ['wrong scheme', { ...VALID, TASKELITH_NATS_URL: 'http://127.0.0.1:4222' }, 'TASKELITH_NATS_URL must use nats:'],
] as const) {
  test(`rejects ${name} as invalid without echoing the value`, () => {
    const result = readServiceEndpoints(environment);
    assert(!result.ok);
    assert.equal(result.error.code, 'invalid');
    assert.equal(result.error.message, message);
    assert.equal(result.error.details.variable, message.split(' ')[0]);
    assert(!JSON.stringify(result.error).includes('secret'));
  });
}
