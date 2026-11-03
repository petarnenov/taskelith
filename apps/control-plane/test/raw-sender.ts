import { once } from 'node:events';
import type { Server } from 'node:http';
import { connect, type Socket } from 'node:net';

// The test runner's mock timers replace the global ones; the watchdogs keep
// the real ones, so a mocked clock never stops them.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

// What a raw sender wrote and read, and why it failed, when it closed.
export interface RawExchange {
  readonly written: number;
  readonly received: string;
  readonly failure?: Error;
}

export interface RawSender {
  readonly socket: Socket;
  readonly exchange: Promise<RawExchange>;
}

// A request head whose body is either declared or chunked; `sent` body
// bytes follow it, and a chunked body that is all sent gets its last chunk.
export interface RawRequest {
  readonly port: number;
  readonly head: string;
  readonly body: 'declared' | 'chunked';
  readonly sent: number;
}

const senders = new Set<Socket>();

// A sender that reads only after it wrote, as an HTTP client may.
export function rawSend({ port, head, body, sent }: RawRequest): RawSender {
  const socket = connect(port, '127.0.0.1');
  senders.add(socket);
  const chunks: Buffer[] = [];
  let written = 0;
  let failure: Error | undefined;
  socket.pause();
  socket.on('data', (chunk: Buffer) => chunks.push(chunk));
  socket.on('error', (error) => {
    failure = error;
  });
  const exchange = new Promise<RawExchange>((resolve) => {
    socket.on('close', () => resolve({ written, received: Buffer.concat(chunks).toString(), ...(failure === undefined ? {} : { failure }) }));
  });
  socket.write(head);
  const piece = Buffer.alloc(64 * 1024, 'a');
  const frame = (bytes: Buffer): Buffer => (body === 'chunked' ? Buffer.concat([Buffer.from(`${bytes.length.toString(16)}\r\n`), bytes, Buffer.from('\r\n')]) : bytes);
  const pump = (): void => {
    while (written < sent && !socket.destroyed) {
      const next = piece.subarray(0, Math.min(piece.length, sent - written));
      written += next.length;
      if (!socket.write(frame(next))) return void socket.once('drain', pump);
    }
    if (body === 'chunked' && !socket.destroyed) socket.write('0\r\n\r\n');
    socket.resume();
  };
  pump();
  return { socket, exchange };
}

// Destroys every raw sender's socket, so no failed test leaves one open.
export function destroyRawSenders(): void {
  for (const socket of senders) socket.destroy();
  senders.clear();
}

// The first bytes a sender reads; its close or error before them fails.
export function firstData(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    const closed = (): void => reject(new Error('the connection closed before any answer'));
    socket.once('close', closed).once('error', reject);
    socket.once('data', (chunk: Buffer) => {
      socket.off('close', closed).off('error', reject);
      resolve(chunk.toString());
    });
  });
}

// The server side of the next connection that `server` accepts.
export async function nextConnection(server: Server): Promise<Socket> {
  const [socket] = await once(server, 'connection');
  return socket as Socket;
}

export async function answeredWithin<Value>(answer: Promise<Value>, milliseconds: number): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = realSetTimeout(() => reject(new Error(`no answer within ${milliseconds} ms`)), milliseconds);
  });
  try {
    return await Promise.race([answer, late]);
  } finally {
    realClearTimeout(timer);
  }
}

// The JSON body of a raw HTTP/1.1 answer.
export function jsonBodyOf(received: string): { details: Record<string, string> } {
  return JSON.parse(received.slice(received.indexOf('\r\n\r\n') + 4));
}
