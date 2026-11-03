import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Socket, type AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';
import { after, afterEach, test } from 'node:test';
import { createApiRequestListener, createApiServer, type ApiHandlers } from '@taskelith/control-plane';
import { err, failure, ok } from '@taskelith/kernel';
import { answeredWithin, destroyRawSenders, rawSend } from './raw-sender.ts';

// Handlers that refuse every credential and never see a body.
const handlers: ApiHandlers = {
  authenticateOperator: async () => err(failure('forbidden', 'no operator here')),
  authenticateWorker: async () => err(failure('forbidden', 'no worker here')),
  authenticateSession: async () => err(failure('forbidden', 'no session here')),
  authorize: async () => ok(undefined),
  authorizeResource: async () => ok(undefined),
  handle: async () => err(failure('internal', 'no operation runs in these tests')),
};
const server = createApiServer(handlers);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const port = (server.address() as AddressInfo).port;
after(() => {
  server.closeAllConnections();
  return new Promise<void>((resolve) => server.close(() => resolve()));
});
afterEach(destroyRawSenders);

test('a sender that writes its whole upload before reading gets the 401 sent before its body', async () => {
  const length = 8 * 1024 ** 2;
  const head = `POST /evidence HTTP/1.1\r\nhost: control-plane\r\ncontent-type: multipart/form-data; boundary=b\r\ncontent-length: ${length}\r\n\r\n`;
  const { received, written, failure: failed } = await answeredWithin(rawSend({ port, head, body: 'declared', sent: length }).exchange, 60_000);
  assert.match(received, /^HTTP\/1\.1 401 /);
  assert.match(received, /\r\nconnection: close\r\n/i);
  assert.deepEqual([written, failed], [length, undefined]);
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
      const request = Object.assign(new PassThrough(), { url: '/no-such-operation', method: 'POST', headers: {}, complete: false, socket });
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
