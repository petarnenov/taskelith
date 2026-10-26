## Context

The fake control-plane server in the evidence publisher test reads the whole request body, parses it as multipart form data, records it, and answers. A client that aborts while the server is still reading makes `for await (const chunk of request)` reject with `Error: aborted`. The callback passed to `createServer` was `async`, so that rejection had no handler.

## Decisions

- **Total handler, narrow tolerance.** The callback delegates to `answerPublication` and handles its rejection. Only a client that left is tolerated: when `request.errored` is set, the response is destroyed. Any other failure answers 500, which the publisher reports as `internal`. A blanket destroy would have mapped every fake-server failure to `unavailable`, which the gateway and timeout cases expect, and so could hide a publisher regression.
- **The flag.** On Node.js 24.22.1 a one-off check showed that for the mid-body abort `request.errored` is set (`Error: aborted`), with `aborted` and `destroyed` true. For a parse failure (a body that is not multipart) `errored` is null and `aborted` false, while `destroyed` is also true because the body was fully read. So `destroyed` cannot tell the cases apart; `errored` can.
- **Deterministic regression test.** The request body enqueues one chunk and never ends. The test waits for the server's `request` event and only then aborts, so the server is always still reading the body when the client leaves. Before the handler fix the file fails every run with the reported error.
- **No connection closing in `after`.** `closeAllConnections()` was considered and left out: nothing showed it was needed, and the aborted client's socket is already closed.
- **No product change.** `HttpEvidencePublisher` already maps an abort to `unavailable`.
