## Why

The worker's control-plane client reduces the cause of a request that got no answer to the thrown error's name (`packages/adapters/worker-control-plane-client/src/control-plane-http.ts:39`). Node's `fetch` throws a `TypeError` named `fetch failed` for every network failure and keeps the root cause in `error.cause`, so a reset connection (`ECONNRESET`), a refused one (`ECONNREFUSED`), and a socket closed by the other side (`UND_ERR_SOCKET`) are all reported and logged as `TypeError`. That hid the root cause of finding B6 in production-like logs.

A failed launch authorization request is also not logged at all: the worker backs off and repeats the operation without a line that says why.

## What Changes

- **Client.** A request without an answer still fails with `unavailable` and the message `the control plane did not answer`, but its details describe the cause chain instead of the outermost name:
  - `cause`: the chain, outermost first, each link its name, its structured code, and a sanitized message, at most four links and 512 characters;
  - `causeCode`: the innermost structured code, such as `ECONNRESET`, when the chain has one.
  Messages lose URLs, bearer values, key-value secrets, and long token-like values; names and codes that are not identifiers are dropped.
- **Worker.** Each failed launch authorization request is logged as `worker.launch.authorization-failed` with the execution, the operation, the failure's code and message, and its details, so the cause reaches the logs. An enrollment failure already reaches the start failure line with its details.
- **Specification.** A new requirement "Control-plane failure cause" of capability `worker-runtime`.
- **Contract.** The worker client paragraph of `docs/contracts/launch-authorization.md` section 11 names the two details and the log line.

No wire schema or OpenAPI document changes: the details are local to the worker.

## Capabilities

### Modified Capabilities
- `worker-runtime`: adds requirement "Control-plane failure cause".

## Impact

`@taskelith/worker-control-plane-client` (`control-plane-http.ts` and a new `failure-cause.ts`), `@taskelith/worker` (`launch-orchestrator.ts`), their tests, and `docs/contracts/launch-authorization.md`. Both packages are private workspace packages and the published `taskelith` package is unchanged, so commits use `chore`, `test`, and `docs`.
