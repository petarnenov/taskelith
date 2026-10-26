## Context

`createApiServer` (`apps/control-plane/src/api/api-server.ts`) serves the control-plane API over plain node:http with the defaults of Node 24: `keepAliveTimeout` 5000 ms and `keepAliveTimeoutBuffer` 1000 ms, so an idle socket is destroyed after 6 s while the server advertises `Keep-Alive: timeout=5`. undici, the global `fetch`, keeps a socket for reuse while it has been idle for up to about 3 s.

The race: the client writes a request on a reused socket, and the process (the server shares it with the client in the tests, and any host can stall) stalls for at least 6 s minus the socket's idle time before the server reads the request. On the next event-loop turn timers run before I/O, so the server's idle timer destroys the socket with unread bytes. The kernel sends a reset, and undici fails the request with `fetch failed` or `read ECONNRESET`; it does not retry a request it has written.

The coordinator reproduced it deterministically in one process (fetch, then a busy wait, then fetch on the reused socket): idle 0 ms with a 6500 ms stall, and idle 2500 ms with a 4000 ms stall, both give `ECONNRESET`, with plain node:http and with the real `createApiServer`. With `response.shouldKeepAlive = false` the 6500 ms stall answers 201.

## Goals / Non-Goals

**Goals:** no request to the control-plane API fails because the server closed an idle socket the client reused, whatever the client.

**Non-Goals:** retries, widened test timeouts, client-side changes, and symptom d of B6.

## Decisions

### 1. The server closes the connection after each response (option 1, decided by the coordinator)

The request handler sets `response.shouldKeepAlive = false`. node:http then sends `Connection: close` and ends the socket after the response, so a client never holds an idle socket to reuse.

Trade-off: every API call opens a new TCP connection (and a TLS handshake once the API is served over TLS). The API's rate is low (operator calls, worker enrollment, launch authorization, evidence uploads, delegations), so the cost is acceptable; correctness under a stall matters more than connection reuse.

Rejected:
- **Option 2, `server.keepAliveTimeout = 0`.** The server would never close an idle socket: file descriptors leak with abandoned clients, and slow or idle clients can hold connections open (slowloris exposure).
- **Option 3, a client-side agent without keep-alive.** It fixes only Taskelith's own clients (`worker-control-plane-client`, the tests); any other client of the API still races.

### 2. The test counts connections, without a stall

A unit test in `apps/control-plane/test/api-server.test.ts` sends two sequential requests and asserts two `connection` events on the server and `connection: close` on both answers. It fails on the old code (the answer said `keep-alive`) and passes now. It holds no multi-second stall, so the suite stays fast and deterministic; the coordinator's standalone reproduction above is the evidence for the race itself.

### 3. No contract change

No contract document (`docs/contracts/*.md`) or OpenAPI document (`packages/contracts/documents/*.openapi.json`) says anything about connection reuse, and none describes the transport below HTTP semantics. `Connection: close` is standard HTTP/1.1 that every conforming client handles, so it changes no operation, status, or schema. The behavior is stated as a requirement of the `control-plane-api` capability, the specification of the server, and no contract line is added.

## Risks / Trade-offs

- One connection per call costs a handshake per call and more sockets in `TIME_WAIT` on the client. Acceptable at the API's rate; if a high-rate client appears, reuse with a server idle timeout well above the client's can be reconsidered.
- Nothing in the repository relies on reuse with this server: no client sets a keep-alive agent, and no test counted connections before this change.
