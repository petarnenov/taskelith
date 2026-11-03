import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { after, beforeEach, test } from 'node:test';
import {
  ControlPlaneApi,
  MAX_DRAIN_MILLISECONDS,
  MAX_SCM_WEBHOOK_BODY_BYTES,
  createApiServer,
  type ApiServices,
} from '@taskelith/control-plane';
import {
  ScmWebhookReceiver,
  type DeliveryRecording,
  type ScmIntegrationVerifiers,
  type ScmWebhookDeliveries,
  type WebhookDelivery,
  type WebhookEvent,
  type WebhookVerifier,
} from '@taskelith/integrations';
import { ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { createGithubSourceControl, githubSourceControlPlugin } from '@taskelith/scm-github';
import { value } from '@taskelith/testing';

// The receiver over HTTP with the GitHub plugin's verifier, under a
// synthetic secret; GitHub itself is never called.
const SECRET = 'synthetic-receiver-secret';
const KNOWN = `i${'a'.repeat(32)}`;
const REPOSITORY = 'acme/project';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const github = value(createGithubSourceControl({
  appId: '1234', installationId: '5678', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  mergeMethods: ['squash'], webhookSecret: SECRET,
}));

// Counts the deliveries the plugin verifies, to show what never reaches it.
let verifications = 0;
const counted: WebhookVerifier = {
  verifyWebhookDelivery: (delivery: WebhookDelivery) => {
    verifications += 1;
    return github.verifyWebhookDelivery(delivery);
  },
};

class InMemoryDeliveries implements ScmWebhookDeliveries {
  readonly events = new Map<string, WebhookEvent>();

  async record(integrationId: string, event: WebhookEvent): Promise<Result<DeliveryRecording>> {
    const key = `${integrationId}/${event.deliveryId}`;
    if (this.events.has(key)) return ok('repeated');
    this.events.set(key, event);
    return ok('recorded');
  }
}

// The GitHub plugin's decoy and eventless rule, as the composition uses.
const plugin = githubSourceControlPlugin();
const verifiersOf = (known: WebhookVerifier): ScmIntegrationVerifiers => ({
  verifierOf: async (integrationId) => ok(integrationId === KNOWN ? known : undefined),
});
const deliveries = new InMemoryDeliveries();
const receiver = new ScmWebhookReceiver({
  verifiers: verifiersOf(counted),
  deliveries,
  decoy: plugin.createDecoy(),
  eventless: plugin,
});
const sink = new InMemoryLogSink();
const logger = new Logger(sink, { now: () => '2026-11-03T09:00:00.000Z' as never });
const server = createApiServer(new ControlPlaneApi({ scmWebhooks: receiver } as unknown as ApiServices), { logger });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  verifications = 0;
});

interface Delivery {
  readonly body: Uint8Array;
  readonly headers: Record<string, string>;
}

function signed(body: Uint8Array, event: string, deliveryId: string, secret = SECRET): Delivery {
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return { body, headers: { 'X-Hub-Signature-256': signature, 'X-GitHub-Event': event, 'X-GitHub-Delivery': deliveryId } };
}

function pullRequest(deliveryId: string, secret = SECRET): Delivery {
  const payload = { action: 'opened', pull_request: { number: 7, head: { sha: 'abc123' } }, repository: { full_name: REPOSITORY } };
  return signed(Buffer.from(JSON.stringify(payload)), 'pull_request', deliveryId, secret);
}

async function post(integrationId: string, { body, headers }: Delivery): Promise<{ status: number; text: string }> {
  const response = await fetch(`${base}/scm-integrations/${integrationId}/webhooks`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: new Uint8Array(body),
  });
  return { status: response.status, text: await response.text() };
}

test('a signed delivery answers 202 and its redelivery 202, recorded once', async () => {
  const delivery = pullRequest('delivery-1');
  assert.deepEqual(await post(KNOWN, delivery), { status: 202, text: '' });
  assert.deepEqual(await post(KNOWN, delivery), { status: 202, text: '' });
  assert.deepEqual(deliveries.events.get(`${KNOWN}/delivery-1`), {
    deliveryId: 'delivery-1', kind: 'change-request', repository: REPOSITORY, changeRequest: '7', commit: 'abc123',
  });
  assert.equal(verifications, 2);
});

test('a delivery identifier above 2^53 is recorded exactly', async () => {
  const deliveryId = '18446744073709551615';
  assert.equal((await post(KNOWN, pullRequest(deliveryId))).status, 202);
  assert.equal(deliveries.events.get(`${KNOWN}/${deliveryId}`)?.deliveryId, deliveryId);
});

test('a verified ping and installation delivery answer 202 without a record', async () => {
  const before = deliveries.events.size;
  const ping = signed(Buffer.from('{"zen":"Keep it logically awesome.","hook_id":1}'), 'ping', 'ping-1');
  const installation = signed(Buffer.from('{"action":"created","installation":{"id":5678}}'), 'installation', 'installation-1');
  const repositories = signed(Buffer.from('{"action":"added","installation":{"id":5678}}'), 'installation_repositories', 'installation-2');
  assert.deepEqual(await post(KNOWN, ping), { status: 202, text: '' });
  assert.deepEqual(await post(KNOWN, installation), { status: 202, text: '' });
  assert.deepEqual(await post(KNOWN, repositories), { status: 202, text: '' });
  assert.equal(deliveries.events.size, before);
});

test('a verified push without a repository is 400 invalid and not recorded', async () => {
  const before = deliveries.events.size;
  const answer = await post(KNOWN, signed(Buffer.from('{"ref":"refs/heads/main","after":"abc123"}'), 'push', 'push-1'));
  assert.equal(answer.status, 400);
  assert.equal(JSON.parse(answer.text).code, 'invalid');
  assert.equal(deliveries.events.size, before);
});

test('a verified ping whose body is no JSON object is 400 invalid and not recorded', async () => {
  const before = deliveries.events.size;
  const answer = await post(KNOWN, signed(Buffer.from('["zen"]'), 'ping', 'ping-2'));
  assert.equal(answer.status, 400);
  assert.equal(JSON.parse(answer.text).code, 'invalid');
  assert.equal(deliveries.events.size, before);
});

test('an unknown or invalid integration and a missing or failed signature get one identical 401', async () => {
  const before = deliveries.events.size;
  const delivery = pullRequest('delivery-2');
  const { 'X-Hub-Signature-256': _signature, ...unsigned } = delivery.headers;
  const answers = [
    await post(`i${'b'.repeat(32)}`, delivery),
    await post('%ZZ', delivery),
    await post('x'.repeat(129), delivery),
    await post('caf%C3%A9', delivery),
    await post(KNOWN, { ...delivery, headers: unsigned }),
    await post(KNOWN, pullRequest('delivery-2', 'another-secret')),
    await post(KNOWN, { ...delivery, body: Buffer.from(` ${Buffer.from(delivery.body).toString()}`) }),
  ];
  const rejection = '{"code":"forbidden","message":"the delivery has no valid signature","details":{"reason":"signature-invalid"}}';
  assert.deepEqual(answers, answers.map(() => ({ status: 401, text: rejection })));
  assert.equal(deliveries.events.size, before);
});

test('a verified payload that cannot be parsed is 400 invalid and not recorded', async () => {
  const before = deliveries.events.size;
  const answer = await post(KNOWN, signed(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), 'push', 'garbled-1'));
  assert.equal(answer.status, 400);
  assert.equal(JSON.parse(answer.text).code, 'invalid');
  assert.equal(deliveries.events.size, before);
});

test('a body over the limit is 413 before any verification, and one at the limit is read', async () => {
  const prefix = `{"repository":{"full_name":"${REPOSITORY}"},"padding":"`;
  const padded = Buffer.alloc(MAX_SCM_WEBHOOK_BODY_BYTES, 'a');
  padded.write(prefix);
  padded.write('"}', MAX_SCM_WEBHOOK_BODY_BYTES - 2);
  assert.deepEqual(await post(KNOWN, signed(padded, 'push', 'largest-1')), { status: 202, text: '' });
  assert.equal(verifications, 1);
  const over = Buffer.concat([padded, Buffer.from(' ')]);
  const answer = await post(KNOWN, signed(over, 'push', 'too-large-1'));
  assert.equal(answer.status, 413);
  assert.equal(JSON.parse(answer.text).details.reason, 'body-too-large');
  assert.equal(verifications, 1, 'the plugin never saw the oversized body');
});

test('the request log names the operation and outcome, never the body or a signature', async () => {
  const delivery = pullRequest('logged-1');
  await post(KNOWN, delivery);
  await post(KNOWN, pullRequest('logged-2', 'another-secret'));
  const lines = sink.records.filter((record) => record.event === 'api.request' && record.fields['operationId'] === 'receiveScmWebhook');
  assert.ok(lines.some((line) => line.fields['status'] === 202));
  assert.ok(lines.some((line) => line.fields['failureReason'] === 'signature-invalid'));
  const logged = JSON.stringify(sink.records);
  assert.doesNotMatch(logged, /sha256=|full_name|acme\/project|logged-1/);
});

// A delivery whose request stays open after `sent` bytes of its body.
function openDelivery(url: string, { body, headers }: Delivery, sent: number, length = body.length): { request: ClientRequest; answer: Promise<IncomingMessage> } {
  const request = httpRequest(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'content-length': String(length) } });
  const answer = new Promise<IncomingMessage>((resolve, reject) => {
    request.on('response', resolve);
    request.on('error', reject);
  });
  request.write(body.subarray(0, sent));
  return { request, answer };
}

async function answeredWithin<Value>(answer: Promise<Value>, milliseconds: number): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${milliseconds} ms`)), milliseconds);
  });
  try {
    return await Promise.race([answer, late]);
  } finally {
    clearTimeout(timer);
  }
}

async function textOf(response: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

test('a declared length over the limit is 413 before the body is read', async () => {
  const delivery = pullRequest('declared-too-large-1');
  const { request, answer } = openDelivery(`${base}/scm-integrations/${KNOWN}/webhooks`, delivery, 10, MAX_SCM_WEBHOOK_BODY_BYTES + 1);
  request.on('error', () => undefined);
  try {
    const response = await answeredWithin(answer, 5_000);
    assert.equal(response.statusCode, 413);
    assert.equal(JSON.parse(await textOf(response)).details.reason, 'body-too-large');
    assert.equal(verifications, 0);
  } finally {
    request.destroy();
  }
});

// What a raw sender wrote and read before its connection closed.
interface RawExchange {
  readonly written: number;
  readonly received: string;
}

// A sender that declares `length` body bytes, writes `sent` of them, and
// only then reads, as an HTTP client may; the connection is to `base`.
function rawDelivery(length: number, sent = length): { socket: Socket; exchange: Promise<RawExchange> } {
  const socket = connect(Number(new URL(base).port), '127.0.0.1');
  const chunks: Buffer[] = [];
  let written = 0;
  socket.pause();
  socket.on('data', (chunk: Buffer) => chunks.push(chunk));
  socket.on('error', () => undefined);
  const exchange = new Promise<RawExchange>((resolve) => {
    socket.on('close', () => resolve({ written, received: Buffer.concat(chunks).toString() }));
  });
  socket.write(`POST /scm-integrations/${KNOWN}/webhooks HTTP/1.1\r\nhost: control-plane\r\ncontent-type: application/json\r\ncontent-length: ${length}\r\n\r\n`);
  const piece = Buffer.alloc(64 * 1024, 'a');
  const pump = (): void => {
    while (written < sent && !socket.destroyed) {
      const next = piece.subarray(0, Math.min(piece.length, sent - written));
      written += next.length;
      if (!socket.write(next)) return void socket.once('drain', pump);
    }
    socket.resume();
  };
  pump();
  return { socket, exchange };
}

test('a sender that writes its whole oversized body before reading still gets the 413', async () => {
  const { exchange } = rawDelivery(MAX_SCM_WEBHOOK_BODY_BYTES + 1);
  const { received } = await answeredWithin(exchange, 60_000);
  assert.match(received, /^HTTP\/1\.1 413 /);
  assert.match(received, /\r\nconnection: close\r\n/i);
  assert.equal(JSON.parse(received.slice(received.indexOf('\r\n\r\n') + 4)).details.reason, 'body-too-large');
  assert.equal(verifications, 0);
});

test('after an early answer the server stops draining a body past its byte bound', async () => {
  const declared = 1024 ** 3;
  const { exchange } = rawDelivery(declared);
  const { written } = await answeredWithin(exchange, 60_000);
  assert.ok(written < declared / 8, `the sender wrote ${written} of ${declared} bytes before the close`);
});

test('after an early answer the server closes a stalled body after its drain time', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { socket, exchange } = rawDelivery(MAX_SCM_WEBHOOK_BODY_BYTES + 1, 10);
  try {
    const head = await new Promise<Buffer>((resolve) => socket.once('data', resolve));
    assert.match(head.toString(), /^HTTP\/1\.1 413 /);
    context.mock.timers.tick(MAX_DRAIN_MILLISECONDS);
    const { written } = await exchange;
    assert.equal(written, 10);
  } finally {
    socket.destroy();
  }
});

// A gate that one side opens and the other awaits.
function gate(): { readonly opened: Promise<void>; readonly open: () => void } {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

// Calls `admitted` once a request passed every check before its body slot:
// the immediate runs after the server queued it for, or gave it, the slot.
class AdmissionSignallingApi extends ControlPlaneApi {
  readonly #admitted: () => void;

  constructor(services: ApiServices, admitted: () => void) {
    super(services);
    this.#admitted = admitted;
  }

  override async authorizeResource(...check: Parameters<ControlPlaneApi['authorizeResource']>): Promise<Result<void>> {
    const authorized = await super.authorizeResource(...check);
    setImmediate(this.#admitted);
    return authorized;
  }
}

test('deliveries beyond the concurrency limit wait for a free slot before their body is read', async () => {
  const firstHoldsSlot = gate();
  const releaseFirst = gate();
  const secondAdmitted = gate();
  const holdingDeliveries: ScmWebhookDeliveries = {
    record: async (_integrationId, event) => {
      if (event.deliveryId === 'slot-1') {
        firstHoldsSlot.open();
        await releaseFirst.opened;
      }
      return ok('recorded');
    },
  };
  const slotReceiver = new ScmWebhookReceiver({
    verifiers: verifiersOf(github),
    deliveries: holdingDeliveries,
    decoy: plugin.createDecoy(),
    eventless: plugin,
  });
  let admissions = 0;
  const api = new AdmissionSignallingApi({ scmWebhooks: slotReceiver } as unknown as ApiServices, () => {
    admissions += 1;
    if (admissions === 2) secondAdmitted.open();
  });
  const slotServer = createApiServer(api, { maxConcurrentWebhooks: 1 });
  const bodiesRead: string[] = [];
  slotServer.on('request', (request: IncomingMessage) => {
    const iterate = request[Symbol.asyncIterator].bind(request);
    request[Symbol.asyncIterator] = () => {
      bodiesRead.push(String(request.headers['x-github-delivery']));
      return iterate();
    };
  });
  await new Promise<void>((resolve) => slotServer.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => slotServer.close(() => resolve())));
  const url = `http://127.0.0.1:${(slotServer.address() as AddressInfo).port}/scm-integrations/${KNOWN}/webhooks`;
  const holding = pullRequest('slot-1');
  const waiting = pullRequest('slot-2');
  const first = openDelivery(url, holding, holding.body.length);
  first.request.end();
  try {
    await answeredWithin(firstHoldsSlot.opened, 5_000);
    const second = openDelivery(url, waiting, waiting.body.length);
    second.request.end();
    await answeredWithin(secondAdmitted.opened, 5_000);
    assert.deepEqual(bodiesRead, ['slot-1'], 'the second body stays unread while the first holds the only slot');
    releaseFirst.open();
    const statuses = await Promise.all([first.answer, second.answer].map(async (answer) => (await answeredWithin(answer, 5_000)).statusCode));
    assert.deepEqual(statuses, [202, 202]);
    assert.deepEqual(bodiesRead, ['slot-1', 'slot-2']);
  } finally {
    releaseFirst.open();
  }
});
