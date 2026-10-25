import assert from 'node:assert/strict';
import test from 'node:test';
import { SERVICES_REMEDY, integrationEndpoint } from '@taskelith/testing';

test('an exported service URL is read as a URL', () => {
  assert.equal(integrationEndpoint('SERVICE_URL', { SERVICE_URL: 'postgres://u:p@127.0.0.1:5432/db' }).port, '5432');
});

test('a missing or malformed service URL names the variable and the remedy', () => {
  for (const env of [{}, { SERVICE_URL: '' }, { SERVICE_URL: 'not a url' }]) {
    assert.throws(() => integrationEndpoint('SERVICE_URL', env), new RegExp(`^Error: SERVICE_URL is not set to a URL; ${SERVICES_REMEDY}$`));
  }
});
