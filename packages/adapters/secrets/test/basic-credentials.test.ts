import assert from 'node:assert/strict';
import test from 'node:test';
import { failure } from '@taskelith/kernel';
import { assertLinearOnRuns } from '@taskelith/testing';
import { REDACTED, redactFailure, redactSecrets, scrubEnvironment } from '@taskelith/secrets';

// Synthetic Basic credentials, as an SCM plugin forms them for Git.
const GITHUB_TOKEN = `ghs_${'A1b2'.repeat(9)}`;
const BASIC = Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64');

test('text loses a Basic credential after Authorization', () => {
  assert.equal(redactSecrets(`Authorization: Basic ${BASIC} sent`), `Authorization: Basic ${REDACTED} sent`);
});

test('text loses a Basic credential in the Git configuration forms', () => {
  assert.equal(
    redactSecrets(`git -c http.extraHeader=Authorization: Basic ${BASIC} fetch`),
    `git -c http.extraHeader=Authorization: Basic ${REDACTED} fetch`,
  );
  assert.equal(redactSecrets(`GIT_CONFIG_VALUE_0=Authorization: Basic ${BASIC}`), `GIT_CONFIG_VALUE_0=Authorization: Basic ${REDACTED}`);
});

test('a failure loses a Basic credential in its message and details', () => {
  const header = `Authorization: Basic ${BASIC}`;
  const redacted = redactFailure(failure('forbidden', `push sent ${header}`, { header }));
  assert.deepEqual([redacted.message, redacted.details], [
    `push sent Authorization: Basic ${REDACTED}`,
    { header: `Authorization: Basic ${REDACTED}` },
  ]);
});

test('a child process loses a Git configuration value with a Basic credential', () => {
  const environment = { GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${BASIC}` };
  assert.deepEqual(scrubEnvironment(environment), { GIT_CONFIG_KEY_0: 'http.extraHeader' });
});

test('near misses of a marked Basic credential stay', () => {
  for (const kept of [`Basic ${BASIC}`, `Authorizations: Basic ${BASIC}`, 'Authorization: Basically fine']) {
    assert.equal(redactSecrets(`keep ${kept} here`), `keep ${kept} here`, kept);
  }
});

test('Basic credentials are redacted in linear time on long runs', () => {
  assertLinearOnRuns(redactSecrets, ['authorization: basic ', 'Authorization: Basic a', '[redacted]']);
});
