## Why

Item B6 `stabilize-control-plane-fetch-tests`, assigned by the coordinator (Niki), found two symptoms on a loaded host: (a) `apps/control-plane/test/control-plane-api.integration.test.ts` failing with "the control plane did not answer" (cause `TypeError: fetch failed`), and (b) `read ECONNRESET` on a control-plane API GET after a hang of about 8 s in the scenario tests.

The cause is a product defect in `createApiServer`. It keeps the node:http defaults of Node 24: it advertises `Keep-Alive: timeout=5` and closes an idle socket after 6 s (`keepAliveTimeout` 5000 plus `keepAliveTimeoutBuffer` 1000). undici, behind the global `fetch`, reuses a socket that has been idle for up to about 3 s. When the process stalls after the client wrote a request on a reused socket, but before the server read it, the next event-loop turn runs the server's idle timer first. The timer destroys the socket with unread bytes, the kernel answers with a reset, and undici does not retry a written request. Any client of the API can hit this race, not only Taskelith's own clients.

## What Changes

- **Control plane.** `createApiServer` answers every request with `Connection: close` (`response.shouldKeepAlive = false`), so no idle socket is ever reused and the race cannot occur.
- **Tests.** A unit test asserts that two sequential requests open two connections and that each answer carries `connection: close`.

No wire contract or OpenAPI change (design decision 3).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: a requirement that the API closes the connection after each response.

## Impact

`apps/control-plane` (`src/api/api-server.ts` and `test/api-server.test.ts`). Each API call costs one TCP handshake. The published `taskelith` package is unchanged, so commits use `chore` and `test`.
