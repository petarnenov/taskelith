import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Socket, type AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';
import { after, afterEach, test } from 'node:test';
import { createApiRequestListener, createApiServer, type ApiHandlers } from '@taskelith/control-plane';
import { err, failure, ok } from '@taskelith/kernel';
import { answeredWithin, destroyRawSenders, firstData, rawSend } from './raw-sender.ts';

// Handlers that refuse every credential and never see a body.
const handlers: ApiHandlers = {
  authenticateOperator: async () => err(failure('forbidden', 'no operator here')),
  authenticateWorker: async () => err(failure('forbidden', 'no worker here')),
  authenticateSession: async () => err(failure('forbidden', 'no session here')),
  authorize: async () => ok(undefined),
  authorizeResource: async () => ok(undefined),
  handle: async () => err(failure('internal', 'no operation runs in these tests')),
};
// Handlers that admit every operator and answer every operation.
const admitting: ApiHandlers = {
  ...handlers,
  authenticateOperator: async () => ok('u-operator' as never),
  handle: async () => ok(undefined),
};

async function listening(served: ApiHandlers): Promise<number> {
  const server = createApiServer(served);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  after(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return (server.address() as AddressInfo).port;
}

const port = await listening(handlers);
const admittingPort = await listening(admitting);
afterEach(destroyRawSenders);

test('a sender that writes its whole upload before reading gets the 401 sent before its body', async () => {
  const length = 8 * 1024 ** 2;
  const head = `POST /evidence HTTP/1.1\r\nhost: control-plane\r\ncontent-type: multipart/form-data; boundary=b\r\ncontent-length: ${length}\r\n\r\n`;
  const { received, written, failure: failed } = await answeredWithin(rawSend({ port, head, body: 'declared', sent: length }).exchange, 60_000);
  assert.match(received, /^HTTP\/1\.1 401 /);
  assert.match(received, /\r\nconnection: close\r\n/i);
  assert.deepEqual([written, failed], [length, undefined]);
});

test('an empty answer given before its body ends sends its head before the body ends', async () => {
  const head = 'DELETE /projects/p1/members/u1 HTTP/1.1\r\nhost: control-plane\r\nauthorization: Bearer operator\r\ncontent-length: 1024\r\n\r\n';
  const { socket } = rawSend({ port: admittingPort, head, body: 'declared', sent: 512 });
  const received = await answeredWithin(firstData(socket), 60_000);
  assert.match(received, /^HTTP\/1\.1 204 /);
  assert.match(received, /\r\nconnection: close\r\n/i);
});

// A response whose head or first write throws, as a broken socket may.
function brokenResponse(broken: 'writeHead' | 'write', destroyed: () => void): ServerResponse {
  const fail = (): never => {
    throw new Error(`${broken} failed`);
  };
  const response = {
    headersSent: false,
    shouldKeepAlive: true,
    writeHead: () => response,
    write: () => true,
    end: () => response,
    destroy: destroyed,
    [broken]: fail,
  };
  return response as unknown as ServerResponse;
}

test('a failure while writing an early answer destroys the response, with no unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const record = (reason: unknown): void => void unhandled.push(reason);
  process.on('unhandledRejection', record);
  const socket = new Socket();
  try {
    for (const broken of ['writeHead', 'write'] as const) {
      const headers = { 'content-length': '1' };
      const request = Object.assign(new PassThrough(), { url: '/no-such-operation', method: 'POST', headers, complete: false, socket });
      const destroyed = new Promise<void>((resolve) => {
        createApiRequestListener(handlers)(request as unknown as IncomingMessage, brokenResponse(broken, resolve));
      });
      await answeredWithin(destroyed, 5_000);
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', record);
    socket.destroy();
  }
});

// How the listener answered: ended at once, or written before a drain.
function recordingResponse(answered: (how: 'ended' | 'drained') => void): ServerResponse {
  const response = {
    headersSent: false,
    shouldKeepAlive: true,
    writeHead: () => response,
    write: () => void answered('drained'),
    end: () => void answered('ended'),
  };
  return response as unknown as ServerResponse;
}

test('a request without a body is answered at once and takes no drain slot', async () => {
  const cases = [
    [{}, 'ended'], [{ 'content-length': '0' }, 'ended'],
    [{ 'content-length': '5' }, 'drained'], [{ 'transfer-encoding': 'chunked' }, 'drained'],
  ] as const;
  const socket = new Socket();
  try {
    for (const [headers, expected] of cases) {
      const request = Object.assign(new PassThrough(), { url: '/no-such-operation', method: 'GET', headers, complete: false, socket });
      const answered = new Promise<string>((resolve) => {
        createApiRequestListener(handlers)(request as unknown as IncomingMessage, recordingResponse(resolve));
      });
      assert.equal(await answeredWithin(answered, 5_000), expected, JSON.stringify(headers));
    }
  } finally {
    socket.destroy();
  }
});
