## Context

`post` in `packages/adapters/worker-control-plane-client/src/control-plane-http.ts` catches whatever `fetch` throws and reports `failure('unavailable', 'the control plane did not answer', { cause: error.name })`. Node's `fetch` (undici) throws `TypeError: fetch failed` for every network failure and keeps the root cause in `error.cause`: a Node system error (`code: 'ECONNRESET'`, `syscall: 'read'`), an undici error (`SocketError`, `code: 'UND_ERR_SOCKET'`, `other side closed`), or an `AggregateError` with `code: 'ECONNREFUSED'` and the per-address errors in `errors`. A timeout throws a `DOMException` named `TimeoutError` without a cause. So every failure was reported as `TypeError`.

The failure reaches two outputs on the worker:

- the start failure line of `workerMain` (`apps/worker/src/main.ts`), which writes the whole failure, details included, through `redactFailure` of `@taskelith/secrets` when enrollment fails;
- the launch authorization loop of `LaunchOrchestrator#authorize` (`apps/worker/src/launch-orchestrator.ts`), which backs off and repeats the operation without logging anything.

The evidence publisher uses the same `post` but has no worker caller yet.

Observability rules that apply: `execution-observability` requirement "Logs without secrets" (the logger redacts secret-named fields, URL user information, and bearer tokens in text), architecture section 11 (no secret values in logs), and the bounded-output principle of the operational targets.

## Goals / Non-Goals

**Goals:** the root cause of an unanswered request reaches the reported failure and the logs, as a structured code where one exists; the description is bounded and holds no secret even before the logger's own redaction.

**Non-Goals:** changing the failure code, the message, or the retry policy; any wire or OpenAPI change; logging the evidence publisher, which has no caller; changing `redactSecrets` or the logger's redaction.

## Decisions

1. **Two details, `cause` and `causeCode`.** `cause` keeps its key and becomes the chain, outermost first, joined by ` <- `, each link `Name[CODE]: message` (for example `TypeError: fetch failed <- Error[ECONNRESET]: read ECONNRESET`). `causeCode` is the innermost code in the chain, the root cause, as a separate field so logs can be filtered on it. A failure without any code has no `causeCode`, rather than an empty or sentinel value. Details stay `Record<string, string>`, so the kernel's `Failure` shape is unchanged.
   *Alternative:* one field with only the innermost code. Rejected: the chain also tells a timeout from a socket error and keeps undici's message, which names the closed side.

2. **The chain follows `cause`, then `errors[0]`.** An `AggregateError` from Node's address selection has no `cause` but per-address errors; the first one is followed. The walk stops at four links, at a value already seen (a cycle), or at a value that is not an object. A thrown value that is not an object is described as `unknown`, as before.

3. **Only identifiers pass as names and codes.** A name must match `^[A-Za-z][A-Za-z0-9_$]{0,63}$`, otherwise it becomes `Error`; a code must be a string matching `^[A-Z][A-Z0-9_]{0,63}$`, otherwise it is left out. This keeps Node and undici codes (`ECONNRESET`, `UND_ERR_SOCKET`, `ERR_INVALID_URL`) and drops the numeric legacy `code` of a `DOMException` and any free text placed in `code`. `errno` and `syscall` are not added: the code already carries the errno meaning, and Node puts the syscall into the message.

4. **Messages are sanitized here, before the logger.** The client cannot rely on the caller's redaction, because the details also reach the start failure line and any future caller. A message is cut to 2,048 characters, then loses control characters, every URL (replaced by `[url]`, which removes user information and query strings together), every bearer value, every `password=`, `token:`, or similar pair, and every run of 32 or more token characters (letters, digits, `_`, `-`, `+`, `=`), which covers the product's prefixed secrets, JWT segments, and NATS seeds. Only then is it cut to 160 characters. Cutting after the replacements keeps a cut from splitting a secret into a run too short to match. An address such as `127.0.0.1:8443` stays, because it names no secret and is what an operator needs.
   *Alternative:* import `redactSecrets` from `@taskelith/secrets`. Rejected: it would make one adapter depend on another for a few patterns, and it keeps hostnames and query strings, which the coordinator asked to strip.

5. **Bounds.** At most four links (`MAX_CAUSE_LINKS`), 160 characters per message (`MAX_CAUSE_MESSAGE`), and 512 characters for the whole `cause` (`MAX_CAUSE_LENGTH`), cut with a trailing `…`. Four links cover `TypeError` → `AggregateError` → system error with one spare.

6. **The worker logs each failed authorization request.** `#authorize` logs `worker.launch.authorization-failed` at `warn` with `executionId`, `operationId`, `code`, `message`, and the failure's details spread as fields, before it backs off. The back-off of at least 5 seconds per retry bounds the rate. The fields pass through the logger's redaction as every other log line. Spreading the details also logs `status` and `reason` of a status failure and `violation` of a schema failure, which say why a grant was not received.

## Risks / Trade-offs

- The 32-character token rule also hides a long hexadecimal identifier inside a message. Identifiers are not what an operator needs from a network failure, and the code and the rest of the message stay.
- Replacing whole URLs hides the host of a message that names one. The worker's configured control-plane URL is known to the operator, and a system error names the address without a scheme, which stays.
- A failed authorization request is now one warning per retry. A long outage writes one line per back-off, at most one per 60 seconds once the back-off is at its maximum.
