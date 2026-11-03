## Context

`createApiRequestListener` (`apps/control-plane/src/api/api-server.ts:129`) sets `response.shouldKeepAlive = false`, so every answer carries `Connection: close`. `signedBody` answers 413 `body-too-large` as soon as the declared `content-length` exceeds the limit, before it reads the body, and `readBody` stops reading once a body passes its limit. In both cases `writeResponse` ended the response with the rest of the body unread.

## Diagnosis

- When a response finishes on a connection that is not kept alive, Node.js 24 (`_http_server`, `resOnFinish`) calls `socket.destroySoon()`, which ends the socket and destroys it once its FIN is written. Closing a TCP socket with unread received data makes the kernel send a reset instead of a FIN, and the client's next write fails with `EPIPE` or `ECONNRESET`.
- A client that writes its body before it reads, or that sees its write fail before it parses the answer, so loses the 413. `fetch` writes the 25 MiB body while the answer arrives; on a loaded host its write error can come first, which is the `fetch failed` of the flaky test.
- Reproduction: a raw socket client that declares 25 MiB + 1 byte, writes the whole body, and only then reads failed in 3 of 3 runs with `write EPIPE` before the fix (`verification.md`).

## Goals / Non-Goals

A client still writing an oversized body reliably reads the 413. The server never reads an oversized body without bound. The 25 MiB limit, the verification order, and other flaky tests are out of scope.

## Decisions

- **Answer first, close after a bounded drain.** `serve` writes an answer whose request is not `complete` with `writeResponseBeforeBodyEnds` (`apps/control-plane/src/api/http-exchange.ts`): it writes the head and the whole content with `response.write`, which sends them at once, discards the rest of the body, and ends the response only when the body ends, its `close` or `error` fires, it passes `MAX_DRAINED_BODY_BYTES`, or `MAX_DRAIN_MILLISECONDS` passes. The close is then a FIN, unless a bound was hit. Only public `ServerResponse` and `IncomingMessage` APIs are used; Node.js still closes the connection.
- **Draining after answering, not before.** Draining before the answer would delay every 413 and hold the request's body slot; the answer goes out first, the drain runs after `serve` logged it, outside the slot.
- **Bounds.** 32 MiB covers a whole body at the 25 MiB limit with room to spare, so any sender within GitHub's cap finishes; a larger sender gets the reset after reading the answer. 10 s is wide for a client on loopback or a LAN, under the repository's slack rule for loaded hosts. Discarded bytes are never buffered.
- **Every early answer.** The cause is not specific to 413: any answer sent before the body ended, such as a 401 before an upload's body, had the same reset. The mechanism keys on `request.complete`, so it applies to them all; requests whose body was read, and event streams, are written as before.
- **Tests.** A raw socket sender that writes before it reads is the deterministic form of the race; the bound tests use a 1 GiB declared body and the test runner's mock `setTimeout`.
