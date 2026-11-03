import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { test, type TestContext } from 'node:test';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { PostgresUiEventNotifications } from '@taskelith/postgres';
import { AT } from './fixtures.ts';

// A server that accepts connections and never answers, as a PostgreSQL
// that stalls during the connection does; `accepted` settles per socket.
async function silentServer(t: TestContext) {
  const sockets: Socket[] = [];
  const waiters: Array<() => void> = [];
  const server = createServer((socket) => {
    // Reads and drops the startup message, so the client's end arrives.
    socket.resume();
    sockets.push(socket);
    for (const waiter of waiters.splice(0)) waiter();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => new Promise<void>((resolve) => {
    for (const socket of sockets) socket.destroy();
    server.close(() => resolve());
  }));
  const port = (server.address() as { port: number }).port;
  return {
    url: new URL(`postgres://taskelith@127.0.0.1:${port}/taskelith`),
    sockets,
    accepted: () => new Promise<void>((resolve) => (sockets.length > 0 ? resolve() : waiters.push(resolve))),
  };
}

const closedSocket = (socket: Socket) => new Promise<void>((resolve) => (socket.closed ? resolve() : socket.once('close', () => resolve())));

test('a LISTEN connection that never answers gives up at its deadline, logs it, and closes its socket', async (t) => {
  const silent = await silentServer(t);
  const logs = new InMemoryLogSink();
  const notifications = new PostgresUiEventNotifications(silent.url, { logger: new Logger(logs, { now: () => AT }), deadlineMilliseconds: 200 });
  t.after(() => notifications.close());
  assert.equal(await notifications.listen(), false);
  assert.ok(logs.records.some((record) => record.event === 'postgres.events.listen.lost'));
  await closedSocket(silent.sockets[0]!);
});

test('close ends a LISTEN connection that is still opening, and the pending listen answers false', async (t) => {
  const silent = await silentServer(t);
  const notifications = new PostgresUiEventNotifications(silent.url, { logger: new Logger(new InMemoryLogSink(), { now: () => AT }), deadlineMilliseconds: 600_000 });
  const connecting = notifications.listen();
  await silent.accepted();
  await notifications.close();
  assert.equal(await connecting, false);
  await closedSocket(silent.sockets[0]!);
});

test('a listen while the connection opens joins it instead of opening another', async (t) => {
  const silent = await silentServer(t);
  const notifications = new PostgresUiEventNotifications(silent.url, { logger: new Logger(new InMemoryLogSink(), { now: () => AT }), deadlineMilliseconds: 200 });
  t.after(() => notifications.close());
  assert.deepEqual(await Promise.all([notifications.listen(), notifications.listen()]), [false, false]);
  assert.equal(silent.sockets.length, 1);
});
