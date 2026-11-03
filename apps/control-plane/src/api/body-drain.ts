import type { IncomingMessage, ServerResponse } from 'node:http';

// After an answer sent before its request's body ended: the body bytes
// discarded and the time from the answer before the server forces a close.
export const MAX_DRAINED_BODY_BYTES = 32 * 1024 ** 2;
export const MAX_DRAIN_MILLISECONDS = 10_000;
// Provisional: connections that discard a body at once.
export const MAX_CONCURRENT_DRAINS = 16;

// Closing with a body unread resets the connection under a client still
// writing it, so an answer before the body's end discards the rest first.
export class BodyDrains {
  readonly #limit: number;
  #draining = 0;

  constructor(limit: number = MAX_CONCURRENT_DRAINS) {
    this.#limit = limit;
  }

  // With every slot taken, or the connection gone, it closes at once: no
  // request ever waits for a drain.
  answer(request: IncomingMessage, response: ServerResponse, content: Uint8Array): void {
    const { socket } = request;
    if (this.#draining >= this.#limit || socket.closed) return void response.end(content);
    this.#draining += 1;
    socket.once('close', () => {
      this.#draining -= 1;
    });
    response.write(content);
    drain(request, response);
  }
}

// The body's end closes gracefully. A bound pauses the input and destroys
// the socket, sent or not; a bound overshoots by at most one chunk.
function drain(request: IncomingMessage, response: ServerResponse): void {
  const { socket } = request;
  let discarded = 0;
  const cutOff = (): void => {
    request.pause();
    socket.destroy();
  };
  const deadline = setTimeout(cutOff, MAX_DRAIN_MILLISECONDS);
  socket.once('close', () => clearTimeout(deadline));
  request.on('data', (chunk: Buffer) => {
    discarded += chunk.length;
    if (discarded > MAX_DRAINED_BODY_BYTES) cutOff();
  });
  request.once('end', () => response.end()).once('error', cutOff);
  request.resume();
}
