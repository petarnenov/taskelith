import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLogSink, Logger, REDACTED, redactText } from '@taskelith/observability';
import { parseInstant } from '@taskelith/kernel';
import { assertLinearOnRuns, SimulatedHost, value } from '@taskelith/testing';

// Synthetic Basic credentials, as an SCM plugin forms them for Git.
const GITHUB_TOKEN = `ghs_${'A1b2'.repeat(9)}`;
const BASIC = Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64');
const SEED = `SU${'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.repeat(2).slice(0, 56)}`;

const MARKED_FORMS: readonly (readonly [string, string])[] = [
  [`Authorization: Basic ${BASIC}`, `Authorization: Basic ${REDACTED}`],
  [`git -c http.extraHeader=Authorization: Basic ${BASIC} fetch`, `git -c http.extraHeader=Authorization: Basic ${REDACTED} fetch`],
  [
    `git -c 'http.https://scm.example/.extraheader=AUTHORIZATION: basic ${BASIC}' push`,
    `git -c 'http.https://scm.example/.extraheader=AUTHORIZATION: basic ${REDACTED}' push`,
  ],
  [`GIT_CONFIG_VALUE_0=Authorization:Basic ${BASIC}`, `GIT_CONFIG_VALUE_0=Authorization:Basic ${REDACTED}`],
  [`{"authorization":"Basic ${BASIC}"}`, `{"authorization":"Basic ${REDACTED}"}`],
  [`{\\"Authorization\\": \\"Basic ${BASIC}\\"}`, `{\\"Authorization\\": \\"Basic ${REDACTED}\\"}`],
  [`Proxy-Authorization: Basic ${BASIC}`, `Proxy-Authorization: Basic ${REDACTED}`],
  [`xAuthorization: Basic ${BASIC}`, `xAuthorization: Basic ${REDACTED}`],
];

for (const [text, redacted] of MARKED_FORMS) {
  test(`a Basic credential is redacted in ${text.slice(0, 32)}`, () => {
    assert.equal(redactText(text), redacted);
  });
}

test('a Basic credential with a token shape glued inside leaves no part of it', () => {
  assert.equal(redactText(`Authorization: Basic ab${GITHUB_TOKEN} x`), `Authorization: Basic ${REDACTED} x`);
  assert.equal(redactText(`Authorization: Basic ab${SEED}cd== x`), `Authorization: Basic ${REDACTED} x`);
});

test('a Basic credential is redacted in a logged field', () => {
  const sink = new InMemoryLogSink();
  const log = new Logger(sink, new SimulatedHost(value(parseInstant('2026-11-03T10:00:00.000Z'))).wallClock);
  log.warn('git.failed', { command: `git -c http.extraHeader=Authorization: Basic ${BASIC} fetch` });
  assert.equal(sink.records[0]!.fields['command'], `git -c http.extraHeader=Authorization: Basic ${REDACTED} fetch`);
});

test('near misses of a marked Basic credential stay', () => {
  for (const kept of [
    `Basic ${BASIC}`,
    `Authorizations: Basic ${BASIC}`,
    `WWW-Authenticate: Basic realm="${BASIC}"`,
    'Authorization: Basically fine',
    'authorization: basic -',
  ]) {
    assert.equal(redactText(`keep ${kept} here`), `keep ${kept} here`, kept);
  }
});

test('Basic credentials are redacted in linear time on long runs', () => {
  assertLinearOnRuns(redactText, ['authorization: basic ', 'authorization:', 'Authorization: Basic a', 'basic ', '[redacted]']);
});
