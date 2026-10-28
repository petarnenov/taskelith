import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { inspect } from 'node:util';
import { passPlans, type ShadowDecision } from '../scripts/review-route.ts';
import {
  CREDENTIAL_VARIABLE,
  Credential,
  JEV_ENDPOINT,
  JEV_MODEL,
  JevRouter,
  jevRequestBody,
  parseJevAnswer,
  REDACTED,
} from '../scripts/review-route-jev.ts';
import { featuresWith, QUIET_FEATURES } from './review-route-fake.ts';

// The Jev adapter with an injected fetch and against a local server; no
// test reaches the real endpoint.

const SENTINEL = 'sentinel-jev-credential-5f1c0a9e';
const CREDENTIAL = Credential.fromEnvironment({ [CREDENTIAL_VARIABLE]: SENTINEL })!;
// Constructed from the OpenAPI document, not captured live; see README.
const RECORDED_RESPONSE = readFileSync(new URL('fixtures/review-route/jev-systemone-response.json', import.meta.url), 'utf8');

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

test('the recorded response maps to an answered shadow decision', async () => {
  const sent: SentRequest[] = [];
  const decision = await router(fakeFetch(respond(RECORDED_RESPONSE), sent)).route(QUIET_FEATURES);
  assert.deepEqual(decision, {
    router: 'jev',
    status: 'answered',
    model: 'jev-1.14.0',
    tier: 'elevated',
    confidence: 0.62,
    probabilities: { standard: 0.19, elevated: 0.81 },
    expectedPasses: 2.4,
    passes: passPlans('elevated', QUIET_FEATURES),
    latencyMs: 250,
  });
  assert.equal(sent[0]!.url, JEV_ENDPOINT);
  assert.equal(sent[0]!.init.method, 'POST');
  assert.ok(sent[0]!.init.signal instanceof AbortSignal);
});

test('the request sends the pinned model and both questions', () => {
  const body = JSON.parse(jevRequestBody(QUIET_FEATURES, JEV_MODEL)) as Record<string, any>;
  assert.equal(body.model, 'jev-1.14.0');
  assert.deepEqual(Object.keys(body).sort(), ['model', 'questions', 'state']);
  assert.equal(body.questions.tier.type, 'choice');
  assert.deepEqual(Object.keys(body.questions.tier.criteria), ['standard', 'elevated']);
  assert.equal(body.questions.passes.type, 'score');
  assert.deepEqual(body.questions.passes.criteria, ['1 pass', '2 passes', '3 passes']);
});

test('the request state holds exactly the allowlisted feature keys', () => {
  const extended = { ...QUIET_FEATURES, path: 'scripts/a.ts', headCommit: 'f'.repeat(40) };
  const { state } = JSON.parse(jevRequestBody(extended, JEV_MODEL)) as { state: Record<string, Record<string, unknown>> };
  assert.deepEqual(Object.keys(state).sort(), [
    'capabilities', 'capabilityHistory', 'externalFacts', 'filesChanged', 'linesChanged', 'size', 'touches',
  ]);
  assert.deepEqual(Object.keys(state.touches!).sort(), ['code', 'contracts', 'docker', 'docsOnly', 'security', 'specs', 'tests']);
  assert.deepEqual(Object.keys(state.capabilityHistory!).sort(), ['changes', 'mediumOrWorsePerChange', 'thirdPassShare']);
});

test('the bearer header carries the credential and nothing else does', async () => {
  const sent: SentRequest[] = [];
  await router(fakeFetch(respond(RECORDED_RESPONSE), sent)).route(QUIET_FEATURES);
  const headers = sent[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${SENTINEL}`);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.ok(!String(sent[0]!.init.body).includes(SENTINEL));
});

test('a missing credential sends no request', async () => {
  const sent: SentRequest[] = [];
  const shadow = new JevRouter({ credential: undefined, fetch: fakeFetch(respond(RECORDED_RESPONSE), sent) });
  assert.deepEqual(await shadow.route(QUIET_FEATURES), { router: 'jev', status: 'failed', reason: 'missing-credential', latencyMs: 0 });
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
    answer: respond(answerWith(({ answers }) => { answers.tier!.probabilities = { standard: 0.2, elevated: 1.2 }; })),
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
    const decision = await router(fakeFetch(answer)).route(QUIET_FEATURES);
    assert.deepEqual(decision, { router: 'jev', status: 'failed', ...expected, latencyMs: 250 });
    assert.ok(!JSON.stringify(decision).includes(SENTINEL));
    assert.ok(!inspect(decision).includes(SENTINEL));
  });
}

const INVALID_BODIES: readonly { name: string; body: unknown }[] = [
  { name: 'an array', body: [] },
  { name: 'no answers', body: { model: 'jev-1.14.0' } },
  { name: 'no tier answer', body: answerWithout('tier') },
  { name: 'no passes answer', body: answerWithout('passes') },
  { name: 'a model that is no identifier', body: JSON.parse(answerWith((body) => { body.model = 'jev 1.14 <b>'; })) },
  { name: 'an unknown choice', body: JSON.parse(answerWith(({ answers }) => { answers.tier!.choice = 'light'; })) },
  { name: 'a tier answer of another type', body: JSON.parse(answerWith(({ answers }) => { answers.tier!.type = 'score'; })) },
  {
    name: 'an extra probability key',
    body: JSON.parse(answerWith(({ answers }) => { answers.tier!.probabilities = { standard: 0.1, elevated: 0.8, light: 0.1 }; })),
  },
  { name: 'a negative confidence', body: JSON.parse(answerWith(({ answers }) => { answers.tier!.confidence = -0.1; })) },
  { name: 'a score above 2', body: JSON.parse(answerWith(({ answers }) => { answers.passes!.score = 2.5; })) },
  { name: 'a score answer of another type', body: JSON.parse(answerWith(({ answers }) => { answers.passes!.type = 'choice'; })) },
  { name: 'a passes confidence above 1', body: JSON.parse(answerWith(({ answers }) => { answers.passes!.confidence = 2; })) },
];

function answerWithout(question: string): unknown {
  return JSON.parse(answerWith(({ answers }) => { delete answers[question]; }));
}

for (const { name, body } of INVALID_BODIES) {
  test(`a response with ${name} is invalid`, () => {
    assert.equal(parseJevAnswer(body), undefined);
  });
}

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
      const decision = await new JevRouter({ credential: CREDENTIAL, endpoint }).route(featuresWith({ linesChanged: 420 }));
      assert.equal(decision.status, 'answered');
    },
  );
  assert.equal(received.authorization, `Bearer ${SENTINEL}`);
  assert.equal((JSON.parse(received.body!) as { state: { linesChanged: number } }).state.linesChanged, 420);
});

test('a local server that never answers times out without a retry', async () => {
  let requests = 0;
  await withServer(
    () => {
      requests += 1;
      return undefined;
    },
    async (endpoint) => {
      const decision = await new JevRouter({ credential: CREDENTIAL, endpoint, timeoutMs: 100 }).route(QUIET_FEATURES);
      assert.equal(decision.status === 'failed' && decision.reason, 'timeout');
    },
  );
  assert.equal(requests, 1);
});

// The server keeps its port bound and resets every connection, so no
// other process can answer in its place.
test('a reset connection is a network failure', async () => {
  const server: Server = createServer();
  server.on('connection', (socket) => socket.destroy());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/systemone`;
    const decision = await new JevRouter({ credential: CREDENTIAL, endpoint }).route(QUIET_FEATURES);
    assert.equal(decision.status === 'failed' && decision.reason, 'network');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
