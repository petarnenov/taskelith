## Context

The fake control-plane server in the evidence publisher test reads the whole request body, parses it as multipart form data, records it, and answers. A client that aborts while the server is still reading makes `for await (const chunk of request)` reject with `Error: aborted`. The callback passed to `createServer` was `async`, so that rejection had no handler.

## Decisions

- **Total handler.** The callback delegates to `answerPublication` and catches its rejection with `response.destroy()`. A client that leaves mid-body has ended the exchange, so the server only releases the socket. Any other server-side failure also destroys the response, which the client observes as a failed request, so a test that depends on it still fails on its assertion.
- **Close connections first.** `after` calls `server.closeAllConnections()` before `server.close()`, so a delayed answer for an aborted client does not keep the file alive.
- **Deterministic regression test.** The regression test does not depend on timing races: its request body enqueues one chunk and never ends, so the server is always still reading when `AbortSignal.timeout(20)` aborts the request. Before the handler fix it fails every run with the reported error.
- **No product change.** `HttpEvidencePublisher` already maps an abort to `unavailable`.
