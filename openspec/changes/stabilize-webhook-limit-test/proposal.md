## Why

The test "a body over the limit is 413 before any verification, and one at the limit is read" of `apps/control-plane/test/scm-webhook-receiver.test.ts` failed intermittently with `fetch failed` and `ECONNRESET` in three `make verify` runs on the loaded iMac on 2026-11-03, and passed alone. The receiver answers 413 to a delivery whose declared length exceeds 25 MiB before it reads the body, and Node.js then closes the socket with the client's body still unread, which resets the connection. A client still writing that body can lose the 413 that wire contract section 5 promises.

## What Changes

- An answer sent before its request's body ended keeps the connection open after it is written: the server reads and discards the rest of the body until it ends, at most `MAX_DRAINED_BODY_BYTES` (32 MiB) and `MAX_DRAIN_MILLISECONDS` (10 s), and only then ends the response, so the close is a FIN, not a reset. The answer carries `Connection: close`, as every answer already does.
- Three tests: a sender that writes its whole oversized body before it reads gets the 413, which failed before the fix; a body past the byte bound and a body that stalls past the time bound get their connection closed.
- The control-plane wire contracts section 5 and a new `control-plane-api` requirement state the behavior and its bounds.

## Capabilities

### New Capabilities

### Modified Capabilities

- `control-plane-api`: ADDED requirement "Answer before the body ends".

## Impact

`@taskelith/control-plane`, a private workspace package: every operation's answer that is sent before the request's body ended, such as a 413, a 401 before an upload, or a body limit refusal, now closes after the bounded drain instead of at once. The 25 MiB limit and the order of verification are unchanged.
