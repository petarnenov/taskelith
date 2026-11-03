import assert from 'node:assert/strict';
import test from 'node:test';
import { githubTestbed, PROJECT, WEBHOOK_SECRET } from './github-fixture.ts';

const TOKEN_ROUTE = /^\/app\/installations\/5678\/access_tokens$/;
const SKEW = "'Expiration time' claim ('exp') is too far in the future";
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

// Synthetic values only, built at run time.
const SECRETS = [
  `ghs_${'s'.repeat(36)}`,
  `Basic ${Buffer.from(`x-access-token:ghs_${'t'.repeat(36)}`).toString('base64')}`,
  `-----BEGIN PRIVATE KEY-----${'k'.repeat(40)}`,
  WEBHOOK_SECRET,
];

test('GitHub messages in the App clock skew retry reach no console', async (t) => {
  const printed: string[] = [];
  for (const method of CONSOLE_METHODS) {
    t.mock.method(console, method, (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  }
  // Octokit binds console.warn and console.error when it loads.
  for (const stream of [process.stdout, process.stderr]) {
    t.mock.method(stream, 'write', (chunk: unknown) => { printed.push(String(chunk)); return true; });
  }
  const { provider, emulator } = githubTestbed();
  const request = { runId: 'run-1', repositories: [PROJECT], permissions: ['read-code'] };
  // The first issue caches auth-app's own token, whose request skips the retry.
  assert.ok((await provider.issueRunCredential(request)).ok);
  const message = `${SKEW} ${SECRETS.join(' ')}`;
  emulator.answerNext('POST', TOKEN_ROUTE, 401, { message }, { date: new Date().toUTCString() });
  const issued = await provider.issueRunCredential(request);
  assert.ok(issued.ok, JSON.stringify(issued));
  const answered = emulator.requests.filter((sent) => TOKEN_ROUTE.test(sent.path) && sent.body !== undefined);
  assert.equal(answered.length, 3);
  for (const secret of SECRETS) assert.ok(printed.every((line) => !line.includes(secret)), 'a secret reached the console');
});
