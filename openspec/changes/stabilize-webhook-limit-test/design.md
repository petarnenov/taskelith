## Context

`createApiRequestListener` (`apps/control-plane/src/api/api-server.ts:129`) sets `response.shouldKeepAlive = false`, so every answer carries `Connection: close`. `signedBody` answers 413 `body-too-large` as soon as the declared `content-length` exceeds the limit, before it reads the body, and `readBody` stops reading once a body passes its limit. In both cases `writeResponse` ended the response with the rest of the body unread.

## Diagnosis

- When a response finishes on a connection that is not kept alive, Node.js 24 (`_http_server`, `resOnFinish`) calls `socket.destroySoon()`, which ends the socket and destroys it once its FIN is written. Closing a TCP socket with unread received data makes the kernel send a reset instead of a FIN, and the client's next write fails with `EPIPE` or `ECONNRESET`.
- A client that writes its body before it reads, or that sees its write fail before it parses the answer, so loses the 413. `fetch` writes the 25 MiB body while the answer arrives; on a loaded host its write error can come first, which is the `fetch failed` of the flaky test.
- Reproduction: a raw socket client that declares 25 MiB + 1 byte, writes the whole body, and only then reads failed in 3 of 3 runs with `write EPIPE` before the fix (`verification.md`).

## Goals / Non-Goals

A client still writing an oversized body reliably reads the 413. The server never reads an oversized body without bound. The 25 MiB limit, the verification order, and other flaky tests are out of scope.

## Decisions

- **Answer first, then a bounded discard.** `serve` (`apps/control-plane/src/api/api-server.ts`) writes a JSON, binary, or empty answer whose request is not `complete` with `writeResponseBeforeBodyEnds` (`apps/control-plane/src/api/http-exchange.ts`), which hands the content to `BodyDrains.answer` (`apps/control-plane/src/api/body-drain.ts`). It writes the head and content with `response.write`, discards the rest of the body unbuffered, and ends the response when the body ends, so the close is a FIN. Web-app files and event streams are written as before.
- **A bound really stops.** At more than `MAX_DRAINED_BODY_BYTES` (32 MiB) discarded, or `MAX_DRAIN_MILLISECONDS` (10 s) after the answer, the drain pauses the request and destroys the socket. The deadline runs until the socket closes, so it also closes a connection whose body ended but whose client reads no output. The byte bound overshoots by at most the chunk that crosses it. Pass 1 found that `stop()` only removed the listener and `response.end()` waited for output.
- **The bounded read leaves the request open.** `readBody` reads through `request.iterator({ destroyOnReturn: false })`: an early `return` from `for await` over the request destroyed it, so a chunked body over its limit lost its connection before the drain (pass 1). On Node.js 24 the stream `destroyer` detaches a server request's socket before it destroys the request, so the drain no longer read the body, and the sender of a body 8 MiB over the limit read nothing before the connection closed, as the fail-before run shows.
- **Bounded discards, no queue.** `BodyDrains` admits at most `MAX_CONCURRENT_DRAINS` (16, provisional) connections at once, apart from the slots of uploads and signed bodies, which `serve` has left before it answers. Beyond them, or for a connection already closed, the answer is ended at once, as before this change; nothing waits, so stalled drains never block normal processing. A slot is freed by its socket's `close`, which a forced close also emits.
- **No detached promise.** The answer path is synchronous: a failure of `writeHead` or `write` throws into `serve`, whose rejection reaches the listener's `response.destroy()` guard, and the slot taken before the write is freed by that close.
- **Every early answer.** The cause is not specific to 413: any answer sent before the body ended, such as a 401 before an upload's body, had the same reset, so the mechanism keys on `request.complete`.
- **Tests.** A raw socket sender that writes before it reads is the deterministic form of the race, declared and chunked. `apps/control-plane/test/body-drain.test.ts` drives `BodyDrains` with a stream and an unconnected socket at each bound, one byte and one millisecond below and at exhaustion; the wire tests use the test runner's mock `setTimeout`, observe the server's socket, and have watchdogs on the real timers.
