import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { parseEvidencePublication, type EvidencePublication } from '@taskelith/execution';
import { HttpEvidencePublisher } from '@taskelith/worker-control-plane-client';
import { failed, value } from '@taskelith/testing';

const CREDENTIAL = `tkwk_${'A'.repeat(43)}`;
const CONTENT = new TextEncoder().encode('{"exit":0}\n');
const PUBLICATION_INPUT = {
  evidenceId: 'evidence-1', projectId: 'project-1', runId: 'run-1', taskId: 'task-1', attemptId: 'attempt-1',
  ownershipGeneration: 2, executionId: 'execution-1', kind: 'execution-log', inputArtifacts: [], codeRevision: 'revision-1',
  validator: { name: 'scripted', version: '1' }, outcome: 'passed', contentDigest: `sha256:${'ab'.repeat(32)}`,
  contentType: 'application/json', sizeBytes: CONTENT.length, capturedAt: '2026-10-25T09:00:00.000Z',
};
const PUBLICATION: EvidencePublication = value(parseEvidencePublication(PUBLICATION_INPUT));
const RECORD = { ...PUBLICATION_INPUT, producer: { kind: 'worker', workerId: 'worker-1' }, ownershipCurrent: true, publishedAt: '2026-10-25T09:00:01.000Z' };

interface Seen {
  readonly path: string | undefined;
  readonly authorization: string | undefined;
  readonly record: unknown;
  readonly content: Uint8Array;
  readonly parts: readonly string[];
}

let answer: { status: number; body: unknown; delayMilliseconds?: number } = { status: 201, body: RECORD };
const seen: Seen[] = [];
const server: Server = createServer((request, response) => {
  answerPublication(request, response).catch((error: unknown) => {
    // A client that left mid-body is no failure; anything else answers 500.
    if (request.errored) response.destroy();
    else response.writeHead(500).end(String(error));
  });
});
let baseUrl: URL;

async function answerPublication(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const form = await new Request('http://localhost/', {
    method: 'POST', headers: { 'content-type': request.headers['content-type'] ?? '' }, body: new Uint8Array(await bytes(request)),
  }).formData();
  const record = form.get('record') as Blob;
  const content = form.get('content') as Blob;
  seen.push({
    path: request.url, authorization: request.headers.authorization, parts: [...form.keys()],
    record: JSON.parse(await record.text()), content: new Uint8Array(await content.arrayBuffer()),
  });
  if (answer.delayMilliseconds !== undefined) await new Promise((resolve) => setTimeout(resolve, answer.delayMilliseconds));
  response.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body));
}

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/`);
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function bytes(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function publisher(timeoutMilliseconds = 2000): HttpEvidencePublisher {
  return new HttpEvidencePublisher({ baseUrl, credential: CREDENTIAL, timeoutMilliseconds });
}

test('a publication posts the record and the content as two parts with the bearer', async () => {
  answer = { status: 201, body: RECORD };
  seen.length = 0;
  const record = value(await publisher().publish(PUBLICATION, CONTENT));
  assert.equal(record.evidenceId, PUBLICATION.evidenceId);
  assert.equal(record.ownershipCurrent, true);
  assert.deepEqual(record.producer, { kind: 'worker', workerId: 'worker-1' });
  const [request] = seen;
  assert.equal(request?.path, '/api/evidence');
  assert.equal(request?.authorization, `Bearer ${CREDENTIAL}`);
  assert.deepEqual(request?.parts, ['record', 'content']);
  assert.deepEqual(request?.record, PUBLICATION_INPUT);
  assert.deepEqual(request?.content, CONTENT);
});

test('a repeat of a stored record answers 200 with the record', async () => {
  answer = { status: 200, body: { ...RECORD, ownershipCurrent: false } };
  assert.equal(value(await publisher().publish(PUBLICATION, CONTENT)).ownershipCurrent, false);
});

test('a gateway failure, a 503, or no answer is unavailable; other failures keep their meaning', async () => {
  for (const status of [502, 503, 504]) {
    answer = { status, body: { code: 'unavailable', message: 'down' } };
    assert.equal(failed(await publisher().publish(PUBLICATION, CONTENT)).code, 'unavailable');
  }
  answer = { status: 403, body: { code: 'forbidden', message: 'never held' } };
  assert.equal(failed(await publisher().publish(PUBLICATION, CONTENT)).code, 'forbidden');
  answer = { status: 409, body: { code: 'conflict', message: 'other values' } };
  assert.equal(failed(await publisher().publish(PUBLICATION, CONTENT)).code, 'conflict');
  answer = { status: 201, body: RECORD, delayMilliseconds: 200 };
  assert.equal(failed(await publisher(20).publish(PUBLICATION, CONTENT)).code, 'unavailable');
});

test('an answer that violates its schema or names another record is refused', async () => {
  answer = { status: 201, body: { ...RECORD, producer: undefined } };
  assert.equal(failed(await publisher().publish(PUBLICATION, CONTENT)).code, 'internal');
  answer = { status: 201, body: { ...RECORD, evidenceId: 'evidence-2' } };
  assert.equal(failed(await publisher().publish(PUBLICATION, CONTENT)).code, 'internal');
  answer = { status: 201, body: { ...RECORD, capturedAt: 'not a time' } };
  assert.equal(failed(await publisher().publish(PUBLICATION, CONTENT)).code, 'internal');
});

test('a client that leaves mid-body does not break the fake server', async () => {
  const endlessBody = new ReadableStream<Uint8Array>({
    start: (controller) => controller.enqueue(CONTENT),
  });
  const arrived = once(server, 'request');
  const client = new AbortController();
  const sent = fetch(new URL('evidence', baseUrl), {
    method: 'POST', body: endlessBody, duplex: 'half', signal: client.signal,
  } as RequestInit);
  await arrived;
  client.abort();
  await assert.rejects(sent);
  answer = { status: 201, body: RECORD };
  assert.equal(value(await publisher().publish(PUBLICATION, CONTENT)).evidenceId, PUBLICATION.evidenceId);
});

test('any other failure of the fake server answers 500', async () => {
  const response = await fetch(new URL('evidence', baseUrl), { method: 'POST', body: 'not multipart' });
  assert.equal(response.status, 500);
  await response.text();
});
