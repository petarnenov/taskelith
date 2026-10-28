import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { inspect } from 'node:util';
import { passPlans, tierAt, type ShadowDecision } from '../scripts/review-route.ts';
import {
  CREDENTIAL_VARIABLE,
  Credential,
  JEV_ENDPOINT,
  JEV_MODEL,
  JevRouter,
  jevRequestBody,
  parseJevAnswer,
  REDACTED,
  redactedExcerpt,
  requestContext,
  THIRD_PASS_THRESHOLD,
  WHAT_CHANGES_LIMIT,
  WHY_LIMIT,
} from '../scripts/review-route-jev.ts';
import { inputWith, QUIET_FEATURES, QUIET_INPUT } from './review-route-fake.ts';

// The Jev adapter with an injected fetch and against a local server; no
// test reaches the real endpoint.

const SENTINEL = 'sentinel-jev-credential-5f1c0a9e';
const CREDENTIAL = Credential.fromEnvironment({ [CREDENTIAL_VARIABLE]: SENTINEL })!;
// Built from the TypeSafe OpenAPI document; see README.
const RECORDED_RESPONSE = readFileSync(new URL('fixtures/review-route/jev-third-pass-response.json', import.meta.url), 'utf8');
// Captured live from jev-1.14.0 on 2026-10-28 for the old two questions.
const TIER_REQUEST_RESPONSE = readFileSync(new URL('fixtures/review-route/jev-systemone-response.json', import.meta.url), 'utf8');

interface SentRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(answer: () => Promise<Response>, sent: SentRequest[] = []): typeof fetch {
  return ((url: string, init: RequestInit) => {
    sent.push({ url, init });
    return answer();
  }) as typeof fetch;
}

const respond = (body: string, status = 200) => () => Promise.resolve(new Response(body, { status }));
const reject = (error: Error) => () => Promise.reject(error);

function steppingClock(...times: number[]): () => number {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)]!;
}

function router(fetchImplementation: typeof fetch): JevRouter {
  return new JevRouter({ credential: CREDENTIAL, fetch: fetchImplementation, clock: steppingClock(1000, 1250) });
}

function answerWith(change: (body: { model: unknown; answers: Record<string, Record<string, unknown>> }) => void): string {
  const body = JSON.parse(RECORDED_RESPONSE) as { model: unknown; answers: Record<string, Record<string, unknown>> };
  change(body);
  return JSON.stringify(body);
}

test('the response maps to an answered shadow decision', async () => {
  const sent: SentRequest[] = [];
  const decision = await router(fakeFetch(respond(RECORDED_RESPONSE), sent)).route(QUIET_INPUT);
  assert.deepEqual(decision, {
    router: 'jev',
    status: 'answered',
    model: 'jev-1.14.0',
    tier: 'elevated',
    thirdPassProbability: 0.62,
    threshold: 0.4,
    passes: passPlans('elevated', QUIET_FEATURES),
    latencyMs: 250,
  });
  assert.equal(sent[0]!.url, JEV_ENDPOINT);
  assert.equal(sent[0]!.init.method, 'POST');
  assert.ok(sent[0]!.init.signal instanceof AbortSignal);
});

test('the request sends the pinned model and the one third pass question', () => {
  const body = JSON.parse(jevRequestBody(QUIET_INPUT, JEV_MODEL)) as Record<string, any>;
  assert.equal(body.model, 'jev-1.14.0');
  assert.deepEqual(Object.keys(body).sort(), ['model', 'questions', 'state']);
  assert.deepEqual(Object.keys(body.questions), ['third']);
  assert.deepEqual(body.questions.third, {
    type: 'noul',
    instructions: 'This software change will need a third review pass.',
    criteria: {
      true: 'Reviewer B in pass 2 will find a Critical or High issue, or the fixes after pass 2 will change code, tests, or contracts rather than only records and documentation.',
      false: 'No third pass will be needed: the review ends after a Low-only pass, or pass 2 finds no Critical or High issue and its fixes, if any, touch only records and documentation.',
    },
  });
});

test('the request state holds exactly the allowlisted keys', () => {
  const extended = { ...QUIET_INPUT, features: { ...QUIET_FEATURES, path: 'scripts/a.ts', headCommit: 'f'.repeat(40) } };
  const { state } = JSON.parse(jevRequestBody(extended, JEV_MODEL)) as { state: Record<string, Record<string, unknown>> };
  assert.deepEqual(Object.keys(state).sort(), [
    'capabilities', 'capabilityHistory', 'content', 'context', 'externalFacts', 'filesChanged', 'linesChanged', 'size',
  ]);
  assert.deepEqual(Object.keys(state.capabilityHistory!).sort(), ['changes', 'mediumOrWorsePerChange', 'thirdPassShare']);
  assert.deepEqual(Object.keys(state.content!).sort(), ['specRequirementCount', 'taskCount', 'whatChanges', 'why']);
});

// Fails before the change: the state carried the rule's touches flags.
test('the request state carries no touches flags', () => {
  const body = jevRequestBody(inputWith({ touches: { ...QUIET_FEATURES.touches, security: true, docker: true } }), JEV_MODEL);
  const { state } = JSON.parse(body) as { state: Record<string, unknown> };
  assert.equal('touches' in state, false);
  for (const flag of ['docsOnly', 'security', 'docker']) assert.ok(!body.includes(`"${flag}"`), flag);
});

test('the context explains the features, the review, and the reference rates', () => {
  const { state } = JSON.parse(jevRequestBody(QUIET_INPUT, JEV_MODEL)) as { state: { context: Record<string, any> } };
  const { context } = state;
  assert.match(context.review, /pass 1 by reviewer A, pass 2 by reviewer B\. A third pass is required only when/);
  assert.equal(context.baseRate, 'In this repository 32% of reviewed changes needed a third pass.');
  assert.equal(context.byLinesChanged, 'Third-pass rate by lines changed: under 100 lines 10%, 100 to 399 lines 40%, 400 lines and more 60%.');
  assert.deepEqual(Object.keys(context.fields).sort(), [
    'capabilities', 'capabilityHistory', 'content', 'externalFacts', 'filesChanged', 'linesChanged', 'size',
  ]);
});

test('unknown reference rates are named unknown', () => {
  const context = requestContext({ changes: 0, thirdPassShare: null, byLinesChanged: [{ band: 'under 100 lines', changes: 0, thirdPassShare: null }] });
  assert.equal(context.baseRate, 'In this repository unknown of reviewed changes needed a third pass.');
  assert.equal(context.byLinesChanged, 'Third-pass rate by lines changed: under 100 lines unknown.');
});

test('the content is clipped and redacted before it leaves', () => {
  const token = `ghp_${'a'.repeat(36)}`;
  const content = { why: `Uses ${token} today. ${'word '.repeat(400)}`, whatChanges: 'x '.repeat(1000), taskCount: 4, specRequirementCount: 2 };
  const body = jevRequestBody({ ...QUIET_INPUT, content }, JEV_MODEL);
  const sent = (JSON.parse(body) as { state: { content: Record<string, any> } }).state.content;
  assert.ok(!body.includes(token));
  assert.ok(sent.why.startsWith(`Uses ${REDACTED} today.`));
  assert.equal(sent.why.length, WHY_LIMIT + 1);
  assert.equal(sent.whatChanges.length, WHAT_CHANGES_LIMIT + 1);
  assert.ok(sent.whatChanges.endsWith('\u2026'));
  assert.deepEqual([sent.taskCount, sent.specRequirementCount], [4, 2]);
});

const SECRETS: readonly string[] = [
  `ghp_${'b'.repeat(36)}`,
  `github_pat_${'c'.repeat(30)}`,
  `sk-${'d'.repeat(24)}`,
  `xoxb-${'e'.repeat(12)}`,
  `AKIA${'F'.repeat(16)}`,
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
  'https://user:pass@example.com/repo.git',
  'Q'.repeat(40),
];

for (const secret of SECRETS) {
  test(`a secret-like string is redacted: ${secret.slice(0, 6)}`, () => {
    const excerpt = redactedExcerpt(`before ${secret} after`, 500);
    assert.ok(!excerpt.includes(secret), excerpt);
    assert.ok(excerpt.includes(REDACTED), excerpt);
  });
}

function pemBlock(bodyLineLength: number, endLine = true): string {
  const body = Array.from({ length: 4 }, (_, index) => `${'K'.repeat(bodyLineLength - 1)}${index}`);
  const end = endLine ? ['-----END PRIVATE KEY-----'] : [];
  return ['-----BEGIN PRIVATE KEY-----', ...body, ...end].join('\n');
}

test('a PEM block with short body lines is redacted whole', () => {
  const excerpt = redactedExcerpt(`before\n${pemBlock(32)}\nafter`, 500);
  assert.equal(excerpt, `before\n${REDACTED}\nafter`);
});

test('a PEM block with standard 64 character lines is redacted whole', () => {
  const excerpt = redactedExcerpt(`before\n${pemBlock(64)}\nafter`, 500);
  assert.equal(excerpt, `before\n${REDACTED}\nafter`);
});

test('a truncated PEM block is redacted to the end of the text', () => {
  const excerpt = redactedExcerpt(`before\n${pemBlock(32, false)}\nKKKK`, 500);
  assert.equal(excerpt, `before\n${REDACTED}`);
});

test('a secret across the clip limit is redacted, not cut short', () => {
  const secret = `ghp_${'g'.repeat(36)}`;
  const excerpt = redactedExcerpt(`${'p'.repeat(10)} ${secret}`, 30);
  assert.equal(excerpt, `${'p'.repeat(10)} ${REDACTED}`);
  assert.equal(redactedExcerpt('short text', 20), 'short text');
});

test('the threshold maps P(third) to the shadow tier', async () => {
  assert.equal(THIRD_PASS_THRESHOLD, 0.4);
  assert.equal(tierAt(0.4, THIRD_PASS_THRESHOLD), 'elevated');
  assert.equal(tierAt(0.399, THIRD_PASS_THRESHOLD), 'standard');
  assert.equal(tierAt(1, THIRD_PASS_THRESHOLD), 'elevated');
  assert.equal(tierAt(0, THIRD_PASS_THRESHOLD), 'standard');
  const low = answerWith(({ answers }) => { answers.third!.noul = 0.39; });
  const decision = await router(fakeFetch(respond(low))).route(QUIET_INPUT);
  assert.deepEqual(decision.status === 'answered' && [decision.tier, decision.passes], ['standard', passPlans('standard', QUIET_FEATURES)]);
});

test('the bearer header carries the credential and nothing else does', async () => {
  const sent: SentRequest[] = [];
  await router(fakeFetch(respond(RECORDED_RESPONSE), sent)).route(QUIET_INPUT);
  const headers = sent[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${SENTINEL}`);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.ok(!String(sent[0]!.init.body).includes(SENTINEL));
});

test('a missing credential sends no request', async () => {
  const sent: SentRequest[] = [];
  const shadow = new JevRouter({ credential: undefined, fetch: fakeFetch(respond(RECORDED_RESPONSE), sent) });
  assert.deepEqual(await shadow.route(QUIET_INPUT), { router: 'jev', status: 'failed', reason: 'missing-credential', latencyMs: 0 });
  assert.equal(sent.length, 0);
});

test('an unset or empty variable gives no credential', () => {
  assert.equal(Credential.fromEnvironment({}), undefined);
  assert.equal(Credential.fromEnvironment({ [CREDENTIAL_VARIABLE]: '' }), undefined);
});

test('every string form of the credential is redacted', () => {
  for (const form of [String(CREDENTIAL), `${CREDENTIAL}`, JSON.stringify({ CREDENTIAL }), inspect(CREDENTIAL), inspect({ CREDENTIAL })]) {
    assert.ok(form.includes(REDACTED), form);
    assert.ok(!form.includes(SENTINEL), form);
  }
});

const timeoutError = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');
const unreadableBody = (error: Error) => () =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(error) } as unknown as Response);

const FAILURES: readonly { name: string; answer: () => Promise<Response>; expected: Partial<ShadowDecision> }[] = [
  { name: 'a timeout before the response', answer: reject(timeoutError()), expected: { reason: 'timeout' } },
  { name: 'a timeout while reading the body', answer: unreadableBody(timeoutError()), expected: { reason: 'timeout' } },
  { name: 'a connection error', answer: reject(new TypeError('fetch failed')), expected: { reason: 'network' } },
  { name: 'HTTP 429', answer: respond('{"detail":"slow down"}', 429), expected: { reason: 'rate-limited', httpStatus: 429 } },
  { name: 'HTTP 529', answer: respond('overloaded', 529), expected: { reason: 'overloaded', httpStatus: 529 } },
  { name: 'HTTP 401', answer: respond('{"detail":"invalid key"}', 401), expected: { reason: 'http-error', httpStatus: 401 } },
  { name: 'HTTP 500', answer: respond('', 500), expected: { reason: 'http-error', httpStatus: 500 } },
  { name: 'a body that is not JSON', answer: respond('<html>'), expected: { reason: 'invalid-response' } },
  {
    name: 'a probability above 1',
    answer: respond(answerWith(({ answers }) => { answers.third!.noul = 1.2; })),
    expected: { reason: 'invalid-response' },
  },
  {
    name: 'an unexpected exception',
    answer: () => Promise.resolve({ get ok(): boolean { throw new Error(SENTINEL); } } as unknown as Response),
    expected: { reason: 'invalid-response' },
  },
];

for (const { name, answer, expected } of FAILURES) {
  test(`${name} is a failed shadow decision without the credential`, async () => {
    const decision = await router(fakeFetch(answer)).route(QUIET_INPUT);
    assert.deepEqual(decision, { router: 'jev', status: 'failed', ...expected, latencyMs: 250 });
    assert.ok(!JSON.stringify(decision).includes(SENTINEL));
    assert.ok(!inspect(decision).includes(SENTINEL));
  });
}

const INVALID_BODIES: readonly { name: string; body: unknown }[] = [
  { name: 'an array', body: [] },
  { name: 'no answers', body: { model: 'jev-1.14.0' } },
  { name: 'no third pass answer', body: answerWithout('third') },
  { name: 'a model that is no identifier', body: JSON.parse(answerWith((body) => { body.model = 'jev 1.14 <b>'; })) },
  { name: 'an answer of another type', body: JSON.parse(answerWith(({ answers }) => { answers.third!.type = 'choice'; })) },
  { name: 'a negative probability', body: JSON.parse(answerWith(({ answers }) => { answers.third!.noul = -0.1; })) },
  { name: 'a probability that is no number', body: JSON.parse(answerWith(({ answers }) => { answers.third!.noul = '0.6'; })) },
  { name: 'a third pass answer that is no object', body: JSON.parse(answerWith(({ answers }) => { answers.third = 0.6 as never; })) },
  { name: 'the answers to the old tier and passes questions', body: JSON.parse(TIER_REQUEST_RESPONSE) },
];

function answerWithout(question: string): unknown {
  return JSON.parse(answerWith(({ answers }) => { delete answers[question]; }));
}

for (const { name, body } of INVALID_BODIES) {
  test(`a response with ${name} is invalid`, () => {
    assert.equal(parseJevAnswer(body), undefined);
  });
}

// Far above a local exchange, so a loaded host cannot turn it into a
// timeout (docs/agent-task-protocol.md "Test authoring").
const LOCAL_EXCHANGE_TIMEOUT_MS = 30_000;

async function withServer(handle: (request: IncomingMessage, body: string) => string | undefined, check: (url: string) => Promise<void>): Promise<void> {
  const server: Server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
    request.on('end', () => {
      const answer = handle(request, body);
      if (answer !== undefined) response.writeHead(200, { 'Content-Type': 'application/json' }).end(answer);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await check(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/systemone`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('the recorded response served by a local server is answered over real fetch', async () => {
  let received: { authorization?: string; body?: string } = {};
  await withServer(
    (request, body) => {
      received = { authorization: request.headers.authorization, body };
      return RECORDED_RESPONSE;
    },
    async (endpoint) => {
      const jev = new JevRouter({ credential: CREDENTIAL, endpoint, timeoutMs: LOCAL_EXCHANGE_TIMEOUT_MS });
      const decision = await jev.route(inputWith({ linesChanged: 420 }));
      assert.equal(decision.status, 'answered');
    },
  );
  assert.equal(received.authorization, `Bearer ${SENTINEL}`);
  assert.equal((JSON.parse(received.body!) as { state: { linesChanged: number } }).state.linesChanged, 420);
});

// Attempts are counted as they leave the client, so a client timeout
// before the server reads the request cannot hide one.
function countingFetch(sent: string[]): typeof fetch {
  return ((url: string, init: RequestInit) => {
    sent.push(url);
    return fetch(url, init);
  }) as typeof fetch;
}

test('a local server that never answers times out without a retry', async () => {
  const sent: string[] = [];
  await withServer(
    () => undefined,
    async (endpoint) => {
      const jev = new JevRouter({ credential: CREDENTIAL, endpoint, timeoutMs: 100, fetch: countingFetch(sent) });
      const decision = await jev.route(QUIET_INPUT);
      assert.equal(decision.status === 'failed' && decision.reason, 'timeout');
    },
  );
  assert.equal(sent.length, 1);
});

// The server keeps its port bound and resets every connection, so no
// other process can answer in its place.
test('a reset connection is a network failure', async () => {
  const server: Server = createServer();
  server.on('connection', (socket) => socket.destroy());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/systemone`;
    const jev = new JevRouter({ credential: CREDENTIAL, endpoint, timeoutMs: LOCAL_EXCHANGE_TIMEOUT_MS });
    const decision = await jev.route(QUIET_INPUT);
    assert.equal(decision.status === 'failed' && decision.reason, 'network');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
