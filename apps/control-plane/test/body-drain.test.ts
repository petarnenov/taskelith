import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import { afterEach, test } from 'node:test';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { BodyDrains, MAX_CONCURRENT_DRAINS, MAX_DRAIN_MILLISECONDS, MAX_DRAINED_BODY_BYTES } from '@taskelith/control-plane';

const ANSWER = Buffer.from('{"code":"invalid"}');

// What the drain did to a response: its writes, a flush, and its end.
class RecordedResponse {
  readonly written: Uint8Array[] = [];
  flushed = false;
  ended = false;
  endedWith: Uint8Array | undefined;

  write(content: Uint8Array): boolean {
    this.written.push(content);
    return true;
  }

  flushHeaders(): void {
    this.flushed = true;
  }

  // Never finishes, as for a client that reads no output.
  end(content?: Uint8Array): this {
    this.ended = true;
    this.endedWith = content;
    return this;
  }
}

// A request whose body the test writes, on an unconnected socket.
interface Exchange {
  readonly body: PassThrough;
  readonly socket: Socket;
  readonly response: RecordedResponse;
}

// Every socket a test opened, closed after it, which clears its deadline.
const sockets: Socket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy();
});

function exchange(): Exchange {
  const socket = new Socket();
  sockets.push(socket);
  const body = Object.assign(new PassThrough(), { socket });
  return { body, socket, response: new RecordedResponse() };
}

function answer(drains: BodyDrains, { body, response }: Exchange, content: Uint8Array = ANSWER): void {
  drains.answer(body as unknown as IncomingMessage, response as unknown as ServerResponse, content);
}

// Lets the stream deliver what was written, without timers.
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function discard(body: PassThrough, bytes: number): Promise<void> {
  const piece = Buffer.alloc(1024 ** 2);
  for (let left = bytes; left > 0; left -= piece.length) body.write(piece.subarray(0, Math.min(piece.length, left)));
  await settled();
}

test('the drain sends the answer at once and discards the body while it flows', async () => {
  const drained = exchange();
  answer(new BodyDrains(), drained);
  assert.deepEqual([drained.response.written, drained.response.flushed], [[ANSWER], false]);
  await discard(drained.body, 1024);
  assert.equal(drained.body.isPaused(), false);
  assert.equal(drained.response.ended, false);
});

test('an empty answer flushes its head at once instead of writing nothing', () => {
  const drained = exchange();
  answer(new BodyDrains(), drained, Buffer.alloc(0));
  assert.deepEqual([drained.response.flushed, drained.response.written], [true, []]);
  assert.equal(drained.response.ended, false);
});

// The collector, exposed at run time, so the test needs no node flag.
setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

// Writes fresh chunks the test keeps no reference to, and watches them.
function discardedUnreferenced(body: PassThrough, chunks: number): WeakRef<Buffer>[] {
  return Array.from({ length: chunks }, () => {
    const chunk = Buffer.alloc(1024 ** 2, 'a');
    body.write(chunk);
    return new WeakRef(chunk);
  });
}

test('the drain retains none of the bytes it discards', async () => {
  const drained = exchange();
  answer(new BodyDrains(), drained);
  const watched = discardedUnreferenced(drained.body, MAX_DRAINED_BODY_BYTES / 1024 ** 2);
  await settled();
  assert.equal(drained.body.writableLength + drained.body.readableLength, 0, 'nothing is buffered');
  assert.equal(drained.socket.destroyed, false);
  collectGarbage();
  await settled();
  collectGarbage();
  assert.equal(watched.filter((chunk) => chunk.deref() !== undefined).length, 0, 'every chunk was collected');
});

test('a body that ends within the bounds ends the response, without forcing a close', async () => {
  const drained = exchange();
  answer(new BodyDrains(), drained);
  await discard(drained.body, 1024);
  drained.body.end();
  await settled();
  assert.deepEqual([drained.response.ended, drained.response.endedWith], [true, undefined]);
  assert.equal(drained.socket.destroyed, false);
});

test('the drain discards up to its byte bound, then pauses the input and destroys the socket', async () => {
  const drained = exchange();
  answer(new BodyDrains(), drained);
  await discard(drained.body, MAX_DRAINED_BODY_BYTES);
  assert.equal(drained.body.writableLength + drained.body.readableLength, 0, 'every byte reached the drain');
  assert.equal(drained.socket.destroyed, false, 'the bound itself is still discarded');
  await discard(drained.body, 1);
  assert.equal(drained.socket.destroyed, true);
  assert.equal(drained.body.isPaused(), true);
  await discard(drained.body, 1024);
  drained.body.end();
  await settled();
  assert.equal(drained.body.isPaused(), true, 'input after the bound stays unread');
  assert.equal(drained.response.ended, false);
});

test('the drain forces the close at its time bound, also after the body ended with output unsent', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const stalled = exchange();
  const ended = exchange();
  const drains = new BodyDrains();
  answer(drains, stalled);
  answer(drains, ended);
  ended.body.end();
  await settled();
  assert.equal(ended.response.ended, true);
  context.mock.timers.tick(MAX_DRAIN_MILLISECONDS - 1);
  assert.deepEqual([stalled.socket.destroyed, ended.socket.destroyed], [false, false]);
  context.mock.timers.tick(1);
  assert.deepEqual([stalled.socket.destroyed, ended.socket.destroyed], [true, true]);
  assert.equal(stalled.body.isPaused(), true);
  await discard(stalled.body, 1024);
  assert.equal(stalled.body.isPaused(), true, 'input after the deadline stays unread');
});

test('a closed connection clears the deadline', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const drained = exchange();
  answer(new BodyDrains(), drained);
  drained.socket.destroy();
  await once(drained.socket, 'close');
  context.mock.timers.tick(MAX_DRAIN_MILLISECONDS);
  assert.equal(drained.body.isPaused(), false, 'the deadline never fired');
});

test('beyond its drain slots an answer closes at once, and a closed connection frees its slot', async () => {
  const drains = new BodyDrains(2);
  const [first, second, third, fourth] = [exchange(), exchange(), exchange(), exchange()];
  answer(drains, first);
  answer(drains, second);
  answer(drains, third);
  assert.deepEqual([first.response.ended, second.response.ended], [false, false]);
  assert.deepEqual([third.response.written, third.response.endedWith], [[], ANSWER]);
  first.socket.destroy();
  await once(first.socket, 'close');
  answer(drains, fourth);
  assert.deepEqual([fourth.response.written, fourth.response.ended], [[ANSWER], false]);
});

test('the drain slots default to MAX_CONCURRENT_DRAINS', () => {
  const drains = new BodyDrains();
  const exchanges = Array.from({ length: MAX_CONCURRENT_DRAINS + 1 }, exchange);
  for (const each of exchanges) answer(drains, each);
  assert.equal(exchanges.filter((each) => each.response.ended).length, 1);
  assert.equal(exchanges.at(-1)?.response.ended, true);
});

test('a connection already closed takes no slot and gets the answer at once', async () => {
  const drains = new BodyDrains(1);
  const gone = exchange();
  gone.socket.destroy();
  await once(gone.socket, 'close');
  answer(drains, gone);
  assert.deepEqual(gone.response.endedWith, ANSWER);
  const next = exchange();
  answer(drains, next);
  assert.equal(next.response.ended, false, 'the slot is still free');
});

test('a write that throws leaves the slot to the closing connection', async () => {
  const drains = new BodyDrains(1);
  const broken = exchange();
  broken.response.write = () => {
    throw new Error('the socket broke');
  };
  assert.throws(() => answer(drains, broken), /the socket broke/);
  broken.socket.destroy();
  await once(broken.socket, 'close');
  const next = exchange();
  answer(drains, next);
  assert.equal(next.response.ended, false, 'the slot was freed');
});
