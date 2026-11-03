## Why

The test "a body over the limit is 413 before any verification, and one at the limit is read" of `apps/control-plane/test/scm-webhook-receiver.test.ts` failed intermittently with `fetch failed` and `ECONNRESET` in three `make verify` runs on the loaded iMac on 2026-11-03, and passed alone. The receiver answers 413 to a delivery whose declared length exceeds 25 MiB before it reads the body, and Node.js then closes the socket with the client's body still unread, which resets the connection. A client still writing that body can lose the 413 that wire contract section 5 promises.

## What Changes

- An answer sent before its request's body ended is written at once with `Connection: close`; the server then discards the rest of the body unbuffered and closes gracefully when it ends, or by force once more than `MAX_DRAINED_BODY_BYTES` (32 MiB) were discarded or `MAX_DRAIN_MILLISECONDS` (10 s) passed since the answer.
- At most `MAX_CONCURRENT_DRAINS` (16) connections discard at once; beyond them an early answer closes at once, as before.
- The bounded body read no longer destroys the request past its limit, so a chunked oversized body is drained too.
- Tests: raw senders, declared and chunked, that write their whole body before reading; an early 401 before an upload's body; each bound below and at exhaustion; discard saturation; and a failing answer write.
- The control-plane wire contracts section 5 and the `control-plane-api` requirements state the behavior and its bounds.

## Capabilities

### New Capabilities

### Modified Capabilities

- `control-plane-api`: ADDED requirements "Answer before the body ends" and "Bounded discards"; MODIFIED requirement "SCM webhook receiver served", whose fixed number of deliveries leaves the discards aside.

## Impact

`@taskelith/control-plane`, a private workspace package: every operation's answer that is sent before the request's body ended, such as a 413, a 401 before an upload, or a body limit refusal, now closes after the bounded discard instead of at once, unless every discard slot is taken. The 25 MiB limit and the order of verification are unchanged.
